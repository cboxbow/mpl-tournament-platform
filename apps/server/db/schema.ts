import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  role: text("role").default("user"),
  username: text("username").unique(),
  displayUsername: text("displayUsername")
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull()
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
});

export const todos = sqliteTable(
  "todos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull(),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_todos_userId").on(table.userId)]
);

export const storageFiles = sqliteTable(
  "storage_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId"),
    gatewayFileId: text("gatewayFileId"),
    fileName: text("fileName").notNull(),
    fileSuffix: text("fileSuffix").notNull(),
    contentType: text("contentType").notNull().default("application/octet-stream"),
    fileSize: integer("fileSize").notNull(),
    objectKey: text("objectKey").notNull(),
    path: text("path").notNull(),
    downloadUrl: text("downloadUrl").notNull(),
    status: text("status", { enum: ["pending", "uploaded", "failed", "deleted"] }).notNull().default("pending"),
    errorMessage: text("errorMessage"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_storage_files_userId").on(table.userId),
    index("idx_storage_files_objectKey").on(table.objectKey),
    index("idx_storage_files_status").on(table.status)
  ]
);

export const aiBusinessScenes = sqliteTable(
  "ai_business_scenes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sceneKey: text("scene_key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    definition: text("definition").notNull().default("{}"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_ai_business_scenes_scene_key").on(table.sceneKey)]
);

export const venues = sqliteTable(
  "venues",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    address: text("address"),
    googleMapsUrl: text("googleMapsUrl"),
    logo: text("logo"),
    courts: text("courts").notNull().default("[]"),
    contact: text("contact").notNull().default("{}"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index("idx_venues_slug").on(table.slug)]
);

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortName: text("shortName"),
    season: integer("season").notNull(),
    level: text("level").notNull(),
    venueId: text("venueId").references(() => venues.id, { onDelete: "set null" }),
    startDate: text("startDate"),
    endDate: text("endDate"),
    registrationOpenDate: text("registrationOpenDate"),
    registrationCloseDate: text("registrationCloseDate"),
    status: text("status").notNull().default("DRAFT"),
    logo: text("logo"),
    coverImage: text("coverImage"),
    description: text("description"),
    organiser: text("organiser"),
    referee: text("referee"),
    publicUrl: text("publicUrl"),
    settings: text("settings").notNull().default("{}"),
    createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_tournaments_status").on(table.status),
    index("idx_tournaments_startDate").on(table.startDate)
  ]
);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  mplPlayerId: text("mplPlayerId"),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
  displayName: text("displayName").notNull(),
  slug: text("slug").notNull().unique(),
  gender: text("gender"),
  nationality: text("nationality"),
  status: text("status").notNull().default("ACTIVE"),
  currentRanking: integer("currentRanking"),
  photoUrl: text("photoUrl"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const playerAliases = sqliteTable("player_aliases", {
  id: text("id").primaryKey(),
  playerId: text("playerId").notNull().references(() => players.id, { onDelete: "cascade" }),
  aliasName: text("aliasName").notNull(),
  normalizedName: text("normalizedName").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("CONFIRMED")
});

export const tournamentCategories = sqliteTable("tournament_categories", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  gender: text("gender"),
  settings: text("settings").notNull().default("{}")
});

export const tournamentPlayers = sqliteTable("tournament_players", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  playerId: text("playerId").notNull().references(() => players.id),
  categoryId: text("categoryId").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  officialRanking: integer("officialRanking"),
  tournamentRanking: integer("tournamentRanking"),
  isAssimilated: integer("isAssimilated", { mode: "boolean" }).notNull().default(false),
  assimilationReason: text("assimilationReason"),
  eligibilityStatus: text("eligibilityStatus").notNull().default("CONFIRMED"),
  seedOverride: integer("seedOverride"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const courts = sqliteTable("courts", {
  id: text("id").primaryKey(),
  venueId: text("venueId").notNull().references(() => venues.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  status: text("status").notNull().default("ACTIVE")
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  sourceTeam: text("sourceTeam"),
  name: text("name").notNull(),
  teamWeight: integer("teamWeight"),
  weightMode: text("weightMode").notNull().default("AUTOMATIC"),
  weightOverride: integer("weightOverride"),
  seed: integer("seed"),
  seedBand: text("seedBand"),
  entryType: text("entryType"),
  status: text("status").notNull().default("CONFIRMED")
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("teamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
  playerId: text("playerId").notNull().references(() => players.id),
  slot: integer("slot").notNull(),
  tournamentRanking: integer("tournamentRanking")
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0)
});

export const groupTeams = sqliteTable("group_teams", {
  groupId: text("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  teamId: text("teamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
  seedPosition: integer("seedPosition")
});

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  groupId: text("groupId").references(() => groups.id, { onDelete: "set null" }),
  stage: text("stage").notNull(),
  code: text("code"),
  round: text("round"),
  teamAId: text("teamAId").references(() => teams.id, { onDelete: "set null" }),
  teamBId: text("teamBId").references(() => teams.id, { onDelete: "set null" }),
  slotA: text("slotA"),
  slotB: text("slotB"),
  courtId: text("courtId").references(() => courts.id, { onDelete: "set null" }),
  scheduledAt: text("scheduledAt"),
  notBefore: text("notBefore"),
  scheduleType: text("scheduleType").notNull().default("EXACT"),
  status: text("status").notNull().default("SCHEDULED"),
  winnerTeamId: text("winnerTeamId").references(() => teams.id, { onDelete: "set null" }),
  loserTeamId: text("loserTeamId").references(() => teams.id, { onDelete: "set null" }),
  scoreStatus: text("scoreStatus"),
  sourceSheet: text("sourceSheet"),
  sourceRow: integer("sourceRow"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const matchSets = sqliteTable("match_sets", {
  id: text("id").primaryKey(),
  matchId: text("matchId").notNull().references(() => matches.id, { onDelete: "cascade" }),
  setNumber: integer("setNumber").notNull(),
  teamAGames: integer("teamAGames"),
  teamBGames: integer("teamBGames"),
  teamATiebreak: integer("teamATiebreak"),
  teamBTiebreak: integer("teamBTiebreak")
});

export const matchDependencies = sqliteTable("match_dependencies", {
  id: text("id").primaryKey(),
  sourceMatchId: text("sourceMatchId").notNull().references(() => matches.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(),
  targetMatchId: text("targetMatchId").notNull().references(() => matches.id, { onDelete: "cascade" }),
  targetSlot: text("targetSlot").notNull()
});

export const groupQualificationRules = sqliteTable("group_qualification_rules", {
  id: text("id").primaryKey(),
  groupId: text("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  targetMatchId: text("targetMatchId"),
  targetSlot: text("targetSlot")
});

export const groupTiebreakRules = sqliteTable("group_tiebreak_rules", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").references(() => tournamentCategories.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull(),
  metric: text("metric").notNull()
});

export const matchFormats = sqliteTable("match_formats", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  settings: text("settings").notNull().default("{}")
});

export const pointsRules = sqliteTable("points_rules", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").references(() => tournamentCategories.id, { onDelete: "cascade" }),
  teamsMin: integer("teamsMin"),
  teamsMax: integer("teamsMax"),
  finalPosition: integer("finalPosition").notNull(),
  points: integer("points").notNull()
});

export const tournamentResults = sqliteTable("tournament_results", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: text("categoryId").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  teamId: text("teamId").references(() => teams.id, { onDelete: "set null" }),
  position: integer("position"),
  positionMin: integer("positionMin"),
  positionMax: integer("positionMax"),
  status: text("status").notNull().default("STILL_COMPETING"),
  points: integer("points")
});

export const matchResultBindings = sqliteTable("match_result_bindings", {
  id: text("id").primaryKey(),
  matchId: text("matchId").notNull().references(() => matches.id, { onDelete: "cascade" }),
  outcome: text("outcome").notNull(),
  positionMin: integer("positionMin").notNull(),
  positionMax: integer("positionMax").notNull()
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  tournamentId: text("tournamentId").references(() => tournaments.id, { onDelete: "set null" }),
  actorUserId: text("actorUserId").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId"),
  beforeState: text("beforeState"),
  afterState: text("afterState"),
  severity: text("severity").notNull().default("INFO"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type StorageFile = typeof storageFiles.$inferSelect;
export type NewStorageFile = typeof storageFiles.$inferInsert;
export type AiBusinessScene = typeof aiBusinessScenes.$inferSelect;
export type NewAiBusinessScene = typeof aiBusinessScenes.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
