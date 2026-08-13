# MPL Tournament Platform — Audit et Phase 1

## Statut d’exécution

L’audit de l’application publique `https://mpl-m1000-cana-2026.vercel.app/` est terminé.

La modification directe de la base Supabase, du dépôt source et de la production n’a pas pu être exécutée dans cette session, car aucun code source n’est présent dans le workspace et aucun Website ID canonique n’est lié à cette session. Le CLI confirme qu’il n’existe pas de Website courant (`currentVersion: null`) et rejette les identifiants non UUID7.

Aucune donnée de production n’a donc été écrasée et aucune seconde application n’a été créée.

## 1. Current architecture observable

L’application actuelle est une application Next.js rendue comme un produit de tournoi complet, avec une identité fortement spécialisée CANA.

### Routes publiques observées

- `/`
- `/live`
- `/schedule`
- `/round-robin`
- `/men`
- `/women`
- `/brackets`
- `/ranking-brackets`
- `/teams`
- `/results`
- `/info`
- `/match/[matchId]`
- `/teams/[teamId]`
- `/posters/[asset]`

### Administration observée

- `/admin`
- Accès par PIN officiel.
- La surface actuelle est centrée sur le scoring live.

### Capacités déjà réutilisables

- Match engine et affichage des scores.
- Centre live avec plusieurs courts.
- Statuts de match et prochain match.
- Groupes / round robin.
- Tableaux et tableaux de classement.
- Equipes et pages équipes.
- Planning / order of play.
- Pages de résultats.
- Responsive mobile avec bottom navigation.
- Rafraîchissement automatique des scores.
- Branding premium déjà établi : navy/near-black, blanc, cyan/bleu, accents gold.
- Structure de navigation et conventions de partage URL.

### Dépendances CANA visibles

Les éléments suivants sont encore couplés au tournoi M1000 CANA :

- Titre HTML et métadonnées : `AfrAsia Bank Padel League · M1000 CANA 2026`.
- Dates globales : `13—15 AUGUST 2026`.
- Venue : `CANA Club`.
- Logo et images CANA.
- Compteurs statiques : `35 Men teams`, `13 Women teams`, `96 Players`, `5 Courts`.
- Programme fixe : qualifying hommes, main draw, classification, finales.
- Labels et liens qui supposent un seul tournoi.
- Admin ne présente pas de sélection de tournoi.
- Pas de route globale `/tournaments`.
- Pas de clé de résolution `[slug]` pour les pages tournoi.

## 2. Target architecture

La cible Phase 1 est une application unique multi-tournois conservant les moteurs sportifs actuels.

```text
MPL Platform
├── Public
│   ├── /tournaments
│   ├── /tournaments/[slug]
│   └── /tournaments/[slug]/
│       ├── live
│       ├── schedule
│       ├── draws
│       ├── groups
│       ├── teams
│       ├── players
│       ├── results
│       └── info
├── Player ecosystem
│   └── /players/[slug]
├── Personal view
│   └── /my-tournament
└── Admin
    ├── /admin/tournaments
    ├── /admin/tournaments/new
    └── /admin/tournaments/[id]
```

Le layout MPL reste partagé. Le tournoi injecte uniquement :

- identité ;
- venue ;
- dates ;
- statut ;
- catégories ;
- branding ;
- données sportives déjà existantes.

## 3. Modèle de données Phase 1

### `tournaments`

Champs minimum recommandés :

- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `short_name text`
- `season integer not null`
- `level text not null` avec contrainte `M25|M50|M100|M250|M500|M1000`
- `venue_id uuid`
- `start_date date`
- `end_date date`
- `registration_open_date date`
- `registration_close_date date`
- `status text not null` avec contrainte `DRAFT|REGISTRATION|DRAW_PENDING|PUBLISHED|LIVE|COMPLETED|ARCHIVED`
- `logo text`
- `cover_image text`
- `description text`
- `organiser text`
- `referee text`
- `public_url text`
- `settings jsonb not null default '{}'`
- `created_at timestamptz`
- `updated_at timestamptz`

### `venues`

- `id`
- `name`
- `slug`
- `address`
- `google_maps_url`
- `logo`
- `contact`
- `created_at`
- `updated_at`

### Liaison legacy

Les tables sportives actuelles doivent recevoir une colonne nullable :

- `tournament_id uuid references tournaments(id)`

À appliquer sur les tables correspondant à :

- catégories ;
- équipes ;
- groupes ;
- standings ;
- matches ;
- schedules ;
- brackets ;
- résultats ;
- annonces.

La migration doit d’abord créer et remplir `tournament_id`, puis seulement ensuite rendre la colonne obligatoire pour les nouvelles données.

## 4. Migration SQL proposée

> À exécuter dans une branche de migration Supabase après sauvegarde et validation du schéma réel. Les noms de tables legacy doivent être ajustés aux noms réellement présents dans le dépôt.

```sql
create extension if not exists pgcrypto;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  google_maps_url text,
  logo text,
  contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text,
  season integer not null,
  level text not null check (level in ('M25','M50','M100','M250','M500','M1000')),
  venue_id uuid references public.venues(id) on delete set null,
  start_date date,
  end_date date,
  registration_open_date date,
  registration_close_date date,
  status text not null default 'DRAFT'
    check (status in (
      'DRAFT','REGISTRATION','DRAW_PENDING','PUBLISHED',
      'LIVE','COMPLETED','ARCHIVED'
    )),
  logo text,
  cover_image text,
  description text,
  organiser text,
  referee text,
  public_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_status_dates_idx
  on public.tournaments(status, start_date, end_date);

insert into public.venues (name, slug)
values ('CANA Club', 'cana-club')
on conflict (slug) do nothing;

insert into public.tournaments (
  slug, name, short_name, season, level, venue_id,
  start_date, end_date, status, organiser, referee, settings
)
select
  'm1000-cana-2026',
  'MPL M1000 CANA 2026',
  'M1000 CANA',
  2026,
  'M1000',
  v.id,
  date '2026-08-13',
  date '2026-08-15',
  'PUBLISHED',
  'Mauritius Padel League',
  'Pascal Hoffmann',
  jsonb_build_object(
    'legacySource', 'm1000-cana-2026',
    'migrationStatus', 'pending-legacy-table-link',
    'branding', jsonb_build_object(
      'accent', '#D6B46A',
      'logo', '/brands/logo-cana.png',
      'coverImage', '/og-cana-green.png'
    )
  )
from public.venues v
where v.slug = 'cana-club'
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  season = excluded.season,
  level = excluded.level,
  venue_id = excluded.venue_id,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  organiser = excluded.organiser,
  referee = excluded.referee,
  settings = excluded.settings,
  updated_at = now();
```

### Migration safety rules

1. Faire une copie de sauvegarde des tables legacy.
2. Ajouter `tournament_id` nullable.
3. Backfiller toutes les lignes CANA avec le tournoi `m1000-cana-2026`.
4. Vérifier les comptes avant/après.
5. Ne pas supprimer les colonnes ou tables legacy pendant Phase 1.
6. Activer les contraintes strictes uniquement après validation de production.
7. Ajouter un warning de dépendance avant toute correction d’un match terminé.

## 5. Routing migration

### Compatibilité immédiate

Les anciennes routes doivent rester fonctionnelles pendant la transition :

- `/live`
- `/schedule`
- `/round-robin`
- `/brackets`
- `/ranking-brackets`
- `/teams`
- `/results`
- `/info`

Elles résolvent temporairement le tournoi CANA par défaut.

### Nouvelles routes

- `/tournaments` : Tournament Hub global.
- `/tournaments/m1000-cana-2026` : homepage CANA.
- `/tournaments/m1000-cana-2026/live`
- `/tournaments/m1000-cana-2026/schedule`
- `/tournaments/m1000-cana-2026/draws`
- `/tournaments/m1000-cana-2026/groups`
- `/tournaments/m1000-cana-2026/teams`
- `/tournaments/m1000-cana-2026/players`
- `/tournaments/m1000-cana-2026/results`
- `/tournaments/m1000-cana-2026/info`

Le pattern de résolution doit être :

```ts
const tournament = await getTournamentBySlug(params.slug);
if (!tournament) notFound();
```

Toutes les queries sportives doivent recevoir `tournament.id` comme filtre obligatoire pour les nouvelles routes.

## 6. Phase 1 implementation

### A. Services à créer

```ts
getTournamentBySlug(slug: string)
listTournamentsByStatus(status?: TournamentStatus)
getTournamentSummary(tournamentId: string)
getTournamentNavigation(tournament: Tournament)
```

### B. Types centralisés

```ts
export type TournamentLevel = 'M25' | 'M50' | 'M100' | 'M250' | 'M500' | 'M1000';

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION'
  | 'DRAW_PENDING'
  | 'PUBLISHED'
  | 'LIVE'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  shortName?: string | null;
  season: number;
  level: TournamentLevel;
  venueId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: TournamentStatus;
  logo?: string | null;
  coverImage?: string | null;
  description?: string | null;
  organiser?: string | null;
  referee?: string | null;
  settings: Record<string, unknown>;
}
```

### C. Tournament Hub

La page `/tournaments` doit regrouper :

- LIVE NOW : `status = LIVE`
- UPCOMING : `status in (REGISTRATION, DRAW_PENDING, PUBLISHED)`
- RECENT RESULTS : `status = COMPLETED`, tri décroissant par date
- ARCHIVE : `status = ARCHIVED`

Le hub ne doit plus reprendre de compteurs CANA codés en dur.

### D. Homepage tournoi

La homepage dynamique reprend la qualité visuelle actuelle et remplace :

- `M1000 CANA` par `tournament.name`;
- `CANA Club` par `venue.name`;
- dates statiques par `start_date/end_date`;
- compteurs statiques par un agrégat filtré `tournament_id`;
- statut local par le statut de l’entité Tournament.

### E. Admin tournaments

Créer `/admin/tournaments` avec :

- filtres Draft / Upcoming / Live / Completed ;
- CTA `CREATE TOURNAMENT` ;
- action `DUPLICATE TOURNAMENT` ;
- ouverture d’un tournoi existant ;
- indicateurs : équipes, joueurs, matchs, courts.

Créer `/admin/tournaments/new` avec un premier wizard Phase 1 limité à :

1. General ;
2. Categories (structure seulement) ;
3. Courts (import venue) ;
4. Branding ;
5. Review ;
6. Create.

Les étapes points, règles avancées, scheduling et draw restent affichées comme `Phase 2`.

## 7. Ce qui doit rester inchangé en Phase 1

- Match engine.
- Score entry.
- Standings et brackets existants.
- Classification et dépendances de matchs.
- Realtime Supabase.
- UI mobile publique.
- PIN/admin scoring actuel.
- Données CANA existantes.

La règle d’implémentation est d’ajouter le contexte tournoi autour de ces moteurs, pas de les réécrire.

## 8. Tests de non-régression obligatoires

Avant migration :

- build actuel ;
- lecture homepage ;
- lecture `/live` ;
- lecture `/schedule` ;
- ouverture d’un match ;
- accès admin PIN.

Après migration :

- mêmes tests sur les anciennes routes ;
- `/tournaments` charge ;
- `/tournaments/m1000-cana-2026` restitue les mêmes données ;
- un tournoi DRAFT vide ne montre aucun match CANA ;
- un filtre par `tournament_id` ne mélange jamais les équipes ;
- le statut `ARCHIVED` conserve les résultats.

## 9. Blocage à lever pour l’implémentation réelle

Fournir l’un des éléments suivants dans une prochaine session :

1. Le dépôt Git/source checkout du Website existant dans le workspace ; ou
2. Le Website ID UUID7 canonique de l’application ; ou
3. Une archive du code source avec le schéma Supabase/migrations.

Dès que l’un de ces éléments est disponible, l’implémentation pourra suivre ce séquencement sans recréation :

- `website inspect` ;
- `website status` ;
- `website source checkout` ;
- audit du schéma réel ;
- migration SQL ajustée aux tables existantes ;
- routes dynamiques ;
- hub et admin Phase 1 ;
- validation locale ;
- déploiement et publication Artifact.

## 10. Décision d’architecture

Le M1000 CANA 2026 devient le premier enregistrement `Tournament`, avec le slug permanent :

```text
m1000-cana-2026
```

Toutes les données sportives doivent rester historisées et être attachées à cet identifiant. La prochaine compétition pourra ensuite être créée depuis Admin sans dupliquer un projet Vercel.
