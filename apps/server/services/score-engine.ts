// Format-aware score engine for the M1000 CANA flow.
// Exact sporting definitions for FORMAT A/B/C/D were not present in the supplied
// source (see audit_logs CONFIGURATION_REQUIRED / FORMAT_A_B_C_D). This engine
// therefore ships a configurable, sane default (best-of-3 standard sets, 6 games,
// tiebreak at 6-6) and reads overrides from match_formats.settings when present.
// It supports: standard set, tie break (set score decided by tiebreak points when
// present), super tie break (a set that is itself just a to-N tiebreak, common as
// a padel "3rd set"), and WALKOVER / RETIRED statuses where the winner cannot be
// derived from set counts alone.

export type SetScoreInput = {
  teamAGames: number;
  teamBGames: number;
  teamATiebreak?: number | null;
  teamBTiebreak?: number | null;
};

export type MatchStatus = "COMPLETED" | "WALKOVER" | "RETIRED" | "ABANDONED";

export interface FormatSettings {
  setsToWin: number;
  gamesToWinSet: number;
  tiebreakAtGamesAll: number;
  finalSetIsSuperTiebreak: boolean;
  superTiebreakPoints: number;
  configurationRequired?: boolean;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  setsToWin: 2,
  gamesToWinSet: 6,
  tiebreakAtGamesAll: 6,
  finalSetIsSuperTiebreak: false,
  superTiebreakPoints: 10
};

export function parseFormatSettings(raw: string | null | undefined): FormatSettings {
  if (!raw) return DEFAULT_FORMAT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<FormatSettings>;
    return { ...DEFAULT_FORMAT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_FORMAT_SETTINGS;
  }
}

export class ScoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreValidationError";
  }
}

/** Determine which team won a single set. Returns 'A' | 'B' | null (undecided/invalid). */
function setWinner(set: SetScoreInput, format: FormatSettings, isFinalSet: boolean): "A" | "B" | null {
  const { teamAGames: a, teamBGames: b, teamATiebreak: tbA, teamBTiebreak: tbB } = set;
  if (a < 0 || b < 0) throw new ScoreValidationError("Set games cannot be negative");

  if (isFinalSet && format.finalSetIsSuperTiebreak) {
    // Deciding set is a single super tiebreak to N points, win by 2 — games fields carry the points.
    if (a === b) return null;
    if (Math.max(a, b) < format.superTiebreakPoints) return null;
    if (Math.abs(a - b) < 2) return null;
    return a > b ? "A" : "B";
  }

  if (a === b) return null; // never a valid set result unless tiebreak resolves it below
  const winner = a > b ? "A" : "B";
  const winnerGames = Math.max(a, b);
  const loserGames = Math.min(a, b);

  if (winnerGames === format.gamesToWinSet && loserGames <= format.gamesToWinSet - 2) return winner;
  if (winnerGames === format.gamesToWinSet + 1 && loserGames === format.gamesToWinSet - 1) return winner; // e.g. 7-5
  if (winnerGames === format.gamesToWinSet + 1 && loserGames === format.tiebreakAtGamesAll) {
    // e.g. 7-6: must be resolved by a tiebreak score if provided; if omitted, trust the game score.
    if (tbA != null && tbB != null) {
      if (tbA === tbB) throw new ScoreValidationError("Tiebreak score cannot be tied");
      const tbWinner = tbA > tbB ? "A" : "B";
      if (tbWinner !== winner) throw new ScoreValidationError("Tiebreak winner does not match set game score");
    }
    return winner;
  }
  // Anything else (e.g. 6-4 vs required 6-0..6-4 already covered, or malformed scores like 8-6) is invalid.
  return null;
}

export interface DeterminedResult {
  winnerSide: "A" | "B";
  setsWonA: number;
  setsWonB: number;
  setResults: ("A" | "B" | null)[];
}

/**
 * Determine the match winner from a completed set-by-set score under the given format.
 * Throws ScoreValidationError if the score is malformed or does not reach a decision.
 * Never derives a winner from Set 1 alone — always counts sets won per match_format.
 */
export function determineMatchResult(sets: SetScoreInput[], format: FormatSettings): DeterminedResult {
  if (!sets.length) throw new ScoreValidationError("At least one set is required");
  let setsWonA = 0;
  let setsWonB = 0;
  const setResults: ("A" | "B" | null)[] = [];
  const decisiveSets = format.setsToWin * 2 - 1;

  sets.forEach((set, index) => {
    const isFinalSet = index === decisiveSets - 1 || index === sets.length - 1;
    const winner = setWinner(set, format, isFinalSet);
    setResults.push(winner);
    if (winner === "A") setsWonA += 1;
    if (winner === "B") setsWonB += 1;
  });

  if (setsWonA < format.setsToWin && setsWonB < format.setsToWin) {
    throw new ScoreValidationError(
      `Score does not reach a decision under this format (needs ${format.setsToWin} sets, got A:${setsWonA} B:${setsWonB})`
    );
  }
  if (setsWonA >= format.setsToWin && setsWonB >= format.setsToWin) {
    throw new ScoreValidationError("Both teams cannot reach the required number of sets won");
  }

  return { winnerSide: setsWonA > setsWonB ? "A" : "B", setsWonA, setsWonB, setResults };
}

/**
 * Resolve winner/loser team ids for any supported match status.
 * WALKOVER / RETIRED / ABANDONED require an explicitly declared winner (a set-count
 * cannot express "the match never finished"); COMPLETED derives it from the sets.
 */
export function resolveMatchWinner(input: {
  status: MatchStatus;
  sets: SetScoreInput[];
  teamAId: string;
  teamBId: string;
  declaredWinnerId?: string;
  format: FormatSettings;
}): { winnerTeamId: string; loserTeamId: string; setsWonA: number; setsWonB: number } {
  const { status, sets, teamAId, teamBId, declaredWinnerId, format } = input;

  if (status !== "COMPLETED") {
    if (!declaredWinnerId || (declaredWinnerId !== teamAId && declaredWinnerId !== teamBId)) {
      throw new ScoreValidationError(`${status} requires an explicit winnerTeamId matching one of the two teams`);
    }
    return {
      winnerTeamId: declaredWinnerId,
      loserTeamId: declaredWinnerId === teamAId ? teamBId : teamAId,
      setsWonA: 0,
      setsWonB: 0
    };
  }

  const result = determineMatchResult(sets, format);
  const winnerTeamId = result.winnerSide === "A" ? teamAId : teamBId;
  const loserTeamId = result.winnerSide === "A" ? teamBId : teamAId;
  if (declaredWinnerId && declaredWinnerId !== winnerTeamId) {
    throw new ScoreValidationError("Declared winnerTeamId does not match the winner derived from the sets");
  }
  return { winnerTeamId, loserTeamId, setsWonA: result.setsWonA, setsWonB: result.setsWonB };
}
