-- Phase A/B — normalized competition data for all MPL tournaments.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  mplPlayerId TEXT,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  displayName TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  gender TEXT,
  nationality TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  currentRanking INTEGER,
  photoUrl TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_players_mpl_id ON players(mplPlayerId);
CREATE INDEX IF NOT EXISTS idx_players_display_name ON players(displayName);

CREATE TABLE IF NOT EXISTS player_aliases (
  id TEXT PRIMARY KEY,
  playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  aliasName TEXT NOT NULL,
  normalizedName TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  UNIQUE(playerId, normalizedName, source)
);
CREATE INDEX IF NOT EXISTS idx_player_aliases_normalized ON player_aliases(normalizedName);

CREATE TABLE IF NOT EXISTS tournament_categories (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  UNIQUE(tournamentId, code)
);

CREATE TABLE IF NOT EXISTS tournament_players (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  playerId TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  categoryId TEXT NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  officialRanking INTEGER,
  tournamentRanking INTEGER,
  isAssimilated INTEGER NOT NULL DEFAULT 0,
  assimilationReason TEXT,
  eligibilityStatus TEXT NOT NULL DEFAULT 'CONFIRMED',
  seedOverride INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournamentId, playerId, categoryId)
);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournamentId);

CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  venueId TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(venueId, name)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  sourceTeam TEXT,
  name TEXT NOT NULL,
  teamWeight INTEGER,
  weightMode TEXT NOT NULL DEFAULT 'AUTOMATIC',
  weightOverride INTEGER,
  seed INTEGER,
  seedBand TEXT,
  entryType TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  UNIQUE(tournamentId, categoryId, name)
);
CREATE INDEX IF NOT EXISTS idx_teams_tournament_category ON teams(tournamentId, categoryId);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  playerId TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  slot INTEGER NOT NULL CHECK(slot IN (1,2)),
  tournamentRanking INTEGER,
  UNIQUE(teamId, slot),
  UNIQUE(teamId, playerId)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournamentId, categoryId, name)
);

CREATE TABLE IF NOT EXISTS group_teams (
  groupId TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  seedPosition INTEGER,
  PRIMARY KEY(groupId, teamId),
  UNIQUE(groupId, seedPosition)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  groupId TEXT REFERENCES groups(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  code TEXT,
  round TEXT,
  teamAId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  teamBId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  slotA TEXT,
  slotB TEXT,
  courtId TEXT REFERENCES courts(id) ON DELETE SET NULL,
  scheduledAt TEXT,
  notBefore TEXT,
  scheduleType TEXT NOT NULL DEFAULT 'EXACT',
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  winnerTeamId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  loserTeamId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  scoreStatus TEXT,
  sourceSheet TEXT,
  sourceRow INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_status ON matches(tournamentId, status);
CREATE INDEX IF NOT EXISTS idx_matches_schedule ON matches(tournamentId, scheduledAt);

CREATE TABLE IF NOT EXISTS match_sets (
  id TEXT PRIMARY KEY,
  matchId TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  setNumber INTEGER NOT NULL,
  teamAGames INTEGER,
  teamBGames INTEGER,
  teamATiebreak INTEGER,
  teamBTiebreak INTEGER,
  UNIQUE(matchId, setNumber)
);

CREATE TABLE IF NOT EXISTS match_dependencies (
  id TEXT PRIMARY KEY,
  sourceMatchId TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK(outcome IN ('WINNER','LOSER')),
  targetMatchId TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  targetSlot TEXT NOT NULL CHECK(targetSlot IN ('A','B')),
  UNIQUE(sourceMatchId, outcome, targetMatchId, targetSlot)
);

CREATE TABLE IF NOT EXISTS group_qualification_rules (
  id TEXT PRIMARY KEY,
  groupId TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  targetMatchId TEXT,
  targetSlot TEXT,
  UNIQUE(groupId, position)
);

CREATE TABLE IF NOT EXISTS group_tiebreak_rules (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT REFERENCES tournament_categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,
  metric TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS match_formats (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  UNIQUE(tournamentId, code)
);

CREATE TABLE IF NOT EXISTS points_rules (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT REFERENCES tournament_categories(id) ON DELETE CASCADE,
  teamsMin INTEGER,
  teamsMax INTEGER,
  finalPosition INTEGER NOT NULL,
  points INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_results (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  categoryId TEXT NOT NULL REFERENCES tournament_categories(id) ON DELETE CASCADE,
  teamId TEXT REFERENCES teams(id) ON DELETE SET NULL,
  position INTEGER,
  positionMin INTEGER,
  positionMax INTEGER,
  status TEXT NOT NULL DEFAULT 'STILL_COMPETING',
  points INTEGER,
  UNIQUE(tournamentId, categoryId, teamId)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tournamentId TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
  actorUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId TEXT,
  beforeState TEXT,
  afterState TEXT,
  severity TEXT NOT NULL DEFAULT 'INFO',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
