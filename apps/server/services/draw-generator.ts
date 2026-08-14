import { eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { groupQualificationRules, groupTeams, groups, matchDependencies, matches } from "../db/schema";

type TeamRow = { id: string; name: string; teamWeight: number | null };

const KNOCKOUT_ROUND_NAMES: Record<number, string> = {
  2: "F",
  4: "SF",
  8: "QF",
  16: "R16",
  32: "R32",
  64: "R64",
  128: "R128"
};

/** Classic recursive bracket-seeding order: for size N returns the seed
 * number (1 = strongest) occupying each of the N bracket slots, so that
 * seed 1 and seed 2 can only meet in the final, seeds 1-4 only meet from the
 * semis onward, etc. */
function seedSlotOrder(bracketSize: number): number[] {
  let order = [1];
  let size = 1;
  while (size < bracketSize) {
    size *= 2;
    const next: number[] = [];
    for (const seed of order) next.push(seed, size + 1 - seed);
    order = next;
  }
  return order;
}

function nextPowerOfTwo(n: number) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Sort ascending by teamWeight (lower = stronger, sum of player rankings —
 * same convention as the CANA seed data). Teams with no computed weight
 * (REVIEW_REQUIRED) sort last, weakest. */
function sortBySeed(teams: TeamRow[]): TeamRow[] {
  return [...teams].sort((a, b) => {
    const wa = a.teamWeight ?? Number.MAX_SAFE_INTEGER;
    const wb = b.teamWeight ?? Number.MAX_SAFE_INTEGER;
    return wa - wb;
  });
}

export interface GenerateKnockoutOptions {
  tournamentId: string;
  categoryId: string;
  teams: TeamRow[];
  /** stage stored on generated matches — "MAIN_DRAW" (default) or "CLASSIFICATION". */
  stage?: string;
  /** court ids to round-robin match assignment across, optional. */
  courtIds?: string[];
}

export interface GeneratedBracket {
  bracketSize: number;
  byes: number;
  rounds: Array<{ round: string; matchIds: string[] }>;
}

/**
 * Generates a single-elimination bracket with standard tournament seeding
 * (seed 1 and 2 can only meet in the final) and wires match_dependencies so
 * the existing score-propagation engine (finalizeMatchResult) automatically
 * advances winners round to round — nothing about live play needs to know
 * this was auto-generated.
 *
 * Byes (when team count isn't a power of two) are resolved immediately: the
 * bye match is written as COMPLETED with the present team as winner, and
 * that team is placed directly into its round-2 slot.
 */
export async function generateKnockoutBracket(options: GenerateKnockoutOptions): Promise<GeneratedBracket> {
  const { tournamentId, categoryId } = options;
  const seeded = sortBySeed(options.teams);
  if (seeded.length < 2) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", "Need at least 2 teams to generate a knockout draw", 400);
  }
  const bracketSize = nextPowerOfTwo(seeded.length);
  const order = seedSlotOrder(bracketSize);
  // slot[i] = team occupying bracket position i, or null for a bye.
  const slots: Array<TeamRow | null> = order.map((seed) => seeded[seed - 1] ?? null);

  const db = getDb();
  const stage = options.stage ?? "MAIN_DRAW";
  const rounds: Array<{ round: string; matchIds: string[] }> = [];

  // Round 1: bracketSize/2 matches from the seeded slots.
  let roundSize = bracketSize;
  let currentMatchIds: string[] = [];
  const byeWinners = new Map<number, TeamRow>(); // match index -> auto-advanced team

  for (let i = 0; i < bracketSize / 2; i++) {
    const teamA = slots[i * 2];
    const teamB = slots[i * 2 + 1];
    const id = crypto.randomUUID();
    const isBye = !teamA || !teamB;
    const winner = teamA ?? teamB ?? null;
    await db.insert(matches).values({
      id,
      tournamentId,
      categoryId,
      stage,
      code: null,
      round: KNOCKOUT_ROUND_NAMES[roundSize] ?? `R${roundSize}`,
      teamAId: teamA?.id ?? null,
      teamBId: teamB?.id ?? null,
      status: isBye ? "COMPLETED" : "SCHEDULED",
      winnerTeamId: isBye ? winner?.id ?? null : null,
      loserTeamId: null,
      scoreStatus: isBye ? JSON.stringify({ bye: true }) : null,
      scheduleType: "FOLLOW"
    });
    currentMatchIds.push(id);
    if (isBye && winner) byeWinners.set(i, winner);
  }
  rounds.push({ round: KNOCKOUT_ROUND_NAMES[roundSize] ?? `R${roundSize}`, matchIds: currentMatchIds });

  // Remaining rounds: create empty-slot matches and wire match_dependencies
  // from the previous round; resolve byes into round 2 immediately.
  while (roundSize > 2) {
    const nextRoundSize = roundSize / 2;
    const nextMatchIds: string[] = [];
    for (let i = 0; i < currentMatchIds.length / 2; i++) {
      const nextId = crypto.randomUUID();
      await db.insert(matches).values({
        id: nextId,
        tournamentId,
        categoryId,
        stage,
        code: null,
        round: KNOCKOUT_ROUND_NAMES[nextRoundSize] ?? `R${nextRoundSize}`,
        status: "SCHEDULED",
        scheduleType: "FOLLOW"
      });
      nextMatchIds.push(nextId);

      const sourceAId = currentMatchIds[i * 2];
      const sourceBId = currentMatchIds[i * 2 + 1];
      await db.insert(matchDependencies).values([
        { id: crypto.randomUUID(), sourceMatchId: sourceAId, outcome: "WINNER", targetMatchId: nextId, targetSlot: "A" },
        { id: crypto.randomUUID(), sourceMatchId: sourceBId, outcome: "WINNER", targetMatchId: nextId, targetSlot: "B" }
      ]);

      // Only round-1 matches can be byes (see comment above generateKnockoutBracket).
      const byeA = byeWinners.get(i * 2);
      const byeB = byeWinners.get(i * 2 + 1);
      if (byeA) await db.update(matches).set({ teamAId: byeA.id }).where(eq(matches.id, nextId));
      if (byeB) await db.update(matches).set({ teamBId: byeB.id }).where(eq(matches.id, nextId));
    }
    rounds.push({ round: KNOCKOUT_ROUND_NAMES[nextRoundSize] ?? `R${nextRoundSize}`, matchIds: nextMatchIds });
    currentMatchIds = nextMatchIds;
    roundSize = nextRoundSize;
  }

  return { bracketSize, byes: bracketSize - seeded.length, rounds };
}

export interface GenerateGroupsOptions {
  tournamentId: string;
  categoryId: string;
  teams: TeamRow[];
  groupSize: number;
  /** how many teams from each group advance into the knockout bracket that follows (0 = groups-only, no bracket). */
  advancePerGroup: number;
}

export interface GeneratedGroups {
  groupCount: number;
  groups: Array<{ groupId: string; name: string; teamIds: string[] }>;
  bracket: GeneratedBracket | null;
}

/**
 * Snake-seeds teams into groups (group 1 gets seeds 1, 2G, 2G+1, ...; group 2
 * gets seeds 2, 2G-1, ... — standard "snake draft" so group strength stays
 * balanced), generates the full round-robin schedule per group, and — when
 * advancePerGroup > 0 — generates the knockout bracket the qualifiers feed
 * into, wiring group_qualification_rules so the existing standings/
 * qualification engine (resolveGroupIfComplete in services/competition.ts)
 * automatically slots winners into it once each group finishes.
 */
export async function generateGroupStage(options: GenerateGroupsOptions): Promise<GeneratedGroups> {
  const { tournamentId, categoryId, groupSize, advancePerGroup } = options;
  const seeded = sortBySeed(options.teams);
  if (seeded.length < groupSize) {
    throw new DatabaseError("DATABASE_QUERY_FAILED", `Need at least ${groupSize} teams for a group of that size`, 400);
  }
  const groupCount = Math.ceil(seeded.length / groupSize);
  const db = getDb();

  // Snake seeding into groupCount groups.
  const buckets: TeamRow[][] = Array.from({ length: groupCount }, () => []);
  let g = 0;
  let direction = 1;
  for (const team of seeded) {
    buckets[g].push(team);
    if (g + direction >= groupCount || g + direction < 0) direction *= -1;
    else g += direction;
  }

  const createdGroups: Array<{ groupId: string; name: string; teamIds: string[] }> = [];
  // groupId -> ordered team ids by seed within the group, used later to wire qualification rules
  const groupSeedOrder = new Map<string, string[]>();

  for (let gi = 0; gi < buckets.length; gi++) {
    const bucketTeams = buckets[gi];
    const groupName = String.fromCharCode(65 + gi); // A, B, C...
    const groupId = crypto.randomUUID();
    await db.insert(groups).values({ id: groupId, tournamentId, categoryId, name: `Group ${groupName}`, sortOrder: gi });
    for (const [index, team] of bucketTeams.entries()) {
      await db.insert(groupTeams).values({ groupId, teamId: team.id, seedPosition: index + 1 });
    }
    groupSeedOrder.set(groupId, bucketTeams.map((t) => t.id));

    // Round robin: every pair plays once.
    for (let i = 0; i < bucketTeams.length; i++) {
      for (let j = i + 1; j < bucketTeams.length; j++) {
        await db.insert(matches).values({
          id: crypto.randomUUID(),
          tournamentId,
          categoryId,
          groupId,
          stage: "GROUP",
          round: "GROUP",
          teamAId: bucketTeams[i].id,
          teamBId: bucketTeams[j].id,
          status: "SCHEDULED",
          scheduleType: "FOLLOW"
        });
      }
    }
    createdGroups.push({ groupId, name: `Group ${groupName}`, teamIds: bucketTeams.map((t) => t.id) });
  }

  if (advancePerGroup <= 0) {
    return { groupCount, groups: createdGroups, bracket: null };
  }

  // Cross-pair qualifiers so group 1's winner doesn't face group 1's
  // runner-up in round 1: seed 1..G = each group's 1st place (group order),
  // seed G+1..2G = each group's 2nd place in REVERSE group order, and so on
  // for further qualification ranks. This is the standard approach used by
  // most tournament software for the common top-1/top-2-per-group case.
  const bracketSeeds: Array<{ groupId: string; position: number }> = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    const thisRank = createdGroups.map((grp, gi) => ({ groupId: grp.groupId, gi }));
    const ordered = rank % 2 === 0 ? thisRank : [...thisRank].reverse();
    for (const entry of ordered) bracketSeeds.push({ groupId: entry.groupId, position: rank + 1 });
  }

  // Build a placeholder "team" list matching bracketSeeds length, purely to
  // reuse generateKnockoutBracket's slot-seeding/round-structure logic —
  // teamWeight = qualification order, so seed 1 (best) is first group's
  // winner, exactly matching bracketSeeds ordering.
  const placeholderTeams: TeamRow[] = bracketSeeds.map((_, index) => ({ id: `qualifier-${index}`, name: "TBD", teamWeight: index }));
  const bracket = await generateKnockoutBracket({ tournamentId, categoryId, teams: placeholderTeams, stage: "MAIN_DRAW" });

  // Now replace the placeholder ids in round-1 matches with real
  // group_qualification_rules pointing at those exact match/slot pairs, and
  // clear the placeholder ids we never actually stored (round 1 matches were
  // created with teamAId/teamBId = null for non-bye slots since placeholder
  // ids aren't real teams — group_qualification_rules fills them in once
  // each group finishes).
  const round1 = bracket.rounds[0];
  for (let i = 0; i < round1.matchIds.length; i++) {
    const matchId = round1.matchIds[i];
    const seedA = bracketSeeds[i * 2];
    const seedB = bracketSeeds[i * 2 + 1];
    if (seedA) {
      await db.insert(groupQualificationRules).values({ id: crypto.randomUUID(), groupId: seedA.groupId, position: seedA.position, targetMatchId: matchId, targetSlot: "A" });
    }
    if (seedB) {
      await db.insert(groupQualificationRules).values({ id: crypto.randomUUID(), groupId: seedB.groupId, position: seedB.position, targetMatchId: matchId, targetSlot: "B" });
    }
    // Placeholder teams were never real rows, so clear any placeholder id
    // that generateKnockoutBracket might have set on this match.
    await db.update(matches).set({ teamAId: null, teamBId: null, status: "SCHEDULED", winnerTeamId: null, scoreStatus: null }).where(eq(matches.id, matchId));
  }

  return { groupCount, groups: createdGroups, bracket };
}
