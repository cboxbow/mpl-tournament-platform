-- Phase 1 — MPL Tournament Platform core entities.
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  address TEXT,
  googleMapsUrl TEXT,
  logo TEXT,
  courts TEXT NOT NULL DEFAULT '[]',
  contact TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues (slug);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  shortName TEXT,
  season INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('M25','M50','M100','M250','M500','M1000')),
  venueId TEXT REFERENCES venues(id) ON DELETE SET NULL,
  startDate TEXT,
  endDate TEXT,
  registrationOpenDate TEXT,
  registrationCloseDate TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','REGISTRATION','DRAW_PENDING','PUBLISHED','LIVE','COMPLETED','ARCHIVED')),
  logo TEXT,
  coverImage TEXT,
  description TEXT,
  organiser TEXT,
  referee TEXT,
  publicUrl TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status);
CREATE INDEX IF NOT EXISTS idx_tournaments_startDate ON tournaments (startDate);

INSERT OR IGNORE INTO venues (id, name, slug, address, courts)
VALUES ('venue-cana-club', 'CANA Club', 'cana-club', 'Mauritius', '["Court 1","Court 2","Court 3","Court 4","Court C"]');

INSERT OR IGNORE INTO tournaments (
  id, slug, name, shortName, season, level, venueId, startDate, endDate,
  status, logo, coverImage, description, organiser, referee, publicUrl, settings
)
VALUES (
  'tournament-m1000-cana-2026',
  'm1000-cana-2026',
  'MPL M1000 CANA 2026',
  'M1000 CANA',
  2026,
  'M1000',
  'venue-cana-club',
  '2026-08-13',
  '2026-08-15',
  'PUBLISHED',
  '/brands/logo-cana.png',
  '/og-cana-green.png',
  'The official MPL M1000 tournament at CANA Club, Mauritius.',
  'Mauritius Padel League',
  'Pascal Hoffmann',
  '/tournaments/m1000-cana-2026',
  '{"legacySource":"m1000-cana-2026","migrationStatus":"phase1-seed","branding":{"accent":"#D6B46A"},"stats":{"teams":48,"players":96,"courts":5,"matches":0}}'
);
