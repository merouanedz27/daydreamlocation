-- =============================================================================
-- DayDream Location — schéma initial
--
-- Principe directeur : ce qui se loue et bloque des dates, c'est la PIÈCE
-- PHYSIQUE (`article_units`), jamais le costume. Le tableur du client montre
-- une veste taille 50 avec un pantalon taille 52 sur la même commande : les
-- pièces se mélangent entre costumes, donc la disponibilité se calcule pièce
-- par pièce. Voir le skill `daydream-db`.
--
-- Conventions (skill `supabase-postgres-best-practices`) :
--   * clés primaires `bigint generated always as identity` — un UUIDv4
--     aléatoire fragmente les index sans bénéfice ici ;
--   * `text` plutôt que `varchar(n)`, `timestamptz` plutôt que `timestamp` ;
--   * montants en `numeric(12,2)`, jamais en `float` ;
--   * statuts en `text` + contrainte `check` (un type enum se modifie mal).
-- =============================================================================

create extension if not exists btree_gist;

-- Schéma privé : helpers SECURITY DEFINER, jamais exposés à PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- =============================================================================
-- Paramètres de la boutique
-- =============================================================================

create table public.settings (
  id boolean primary key default true,
  -- Le client ne saisit qu'une date : celle de l'événement. L'app en déduit
  -- retrait et retour. Voir `orders`.
  days_before_event integer not null default 1,
  days_after_event integer not null default 1,
  -- Jours de battement après le retour avant qu'une pièce soit relouable.
  cleaning_buffer_days integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id),
  constraint settings_windows_positive check (
    days_before_event >= 0
    and days_after_event >= 0
    and cleaning_buffer_days >= 0
  )
);

comment on table public.settings is
  'Ligne unique. Fenêtre de location par défaut et battement de nettoyage.';

insert into public.settings (id) values (true);

-- =============================================================================
-- Comptes et rôles
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_role_valid check (role in ('owner', 'staff'))
);

comment on table public.profiles is
  'Un profil par compte auth. `owner` voit les finances, `staff` non.';

-- =============================================================================
-- Catalogue
-- =============================================================================

-- Table et non enum : le client doit pouvoir ajouter une catégorie.
create table public.categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name_fr text not null,
  name_ar text not null,
  position integer not null default 0
);

insert into public.categories (slug, name_fr, name_ar, position) values
  ('veste',      'Veste',           'سترة',   1),
  ('pantalon',   'Pantalon',        'سروال',  2),
  ('chemise',    'Chemise',         'قميص',   3),
  ('gilet',      'Gilet',           'صدرية',  4),
  ('chaussures', 'Chaussures',      'حذاء',   5),
  ('noeud',      'Nœud papillon',   'ربطة',   6),
  ('accessoire', 'Accessoire',      'إكسسوار', 7);

-- LE MODÈLE — « Gio-079 ». Un type de vêtement, pas un objet réel.
create table public.article_models (
  id bigint generated always as identity primary key,
  ref_code text not null unique,
  name_fr text not null,
  name_ar text,
  category_id bigint not null references public.categories (id),
  color text,
  brand text,
  description text,
  base_price numeric(12, 2) not null default 0,
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint article_models_base_price_positive check (base_price >= 0)
);

comment on column public.article_models.ref_code is
  'Code fournisseur repris tel quel du tableur : « Gio-079 », « TK-405 ».';

create index article_models_category_idx
  on public.article_models (category_id);

-- LA PIÈCE PHYSIQUE — « Gio-079-01 ». Un vrai vêtement sur un cintre.
-- C'est la seule chose qui se loue et qui bloque des dates.
create table public.article_units (
  id bigint generated always as identity primary key,
  model_id bigint not null references public.article_models (id) on delete restrict,
  ref_code text not null unique,
  size text,
  -- Le « (90cm) » du tableur : longueur, distincte de la taille.
  length_cm numeric(5, 1),
  -- NULL => on retombe sur `article_models.base_price`.
  price_override numeric(12, 2),
  purchase_price numeric(12, 2),
  purchase_date date,
  condition text not null default 'bon',
  status text not null default 'disponible',
  notes text,
  created_at timestamptz not null default now(),
  constraint article_units_condition_valid
    check (condition in ('neuf', 'bon', 'use', 'retire')),
  constraint article_units_status_valid
    check (status in ('disponible', 'nettoyage', 'reparation', 'retire')),
  constraint article_units_prices_positive check (
    (price_override is null or price_override >= 0)
    and (purchase_price is null or purchase_price >= 0)
  )
);

comment on table public.article_units is
  'Un enregistrement = un vêtement réel. Deux vestes taille 50 = deux lignes.';
comment on column public.article_units.status is
  'État matériel de la pièce. La DISPONIBILITÉ à une date donnée se déduit '
  'de `order_lines`, pas de cette colonne.';

create index article_units_model_idx on public.article_units (model_id);
create index article_units_status_idx on public.article_units (status);

-- L'ENSEMBLE — « Costume n°12 ». Raccourci de saisie, PAS une unité louable.
create table public.ensembles (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  photo_path text,
  package_price numeric(12, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint ensembles_package_price_positive
    check (package_price is null or package_price >= 0)
);

comment on table public.ensembles is
  'Un ensemble ne se réserve JAMAIS : l''ajouter à une commande le déplie en '
  'lignes de pièces, que l''employé peut ensuite retirer ou remplacer.';

create table public.ensemble_items (
  ensemble_id bigint not null references public.ensembles (id) on delete cascade,
  unit_id bigint not null references public.article_units (id) on delete cascade,
  primary key (ensemble_id, unit_id)
);

create index ensemble_items_unit_idx on public.ensemble_items (unit_id);

-- =============================================================================
-- Commandes
-- =============================================================================

create sequence public.order_no_seq;

create table public.orders (
  id bigint generated always as identity primary key,
  order_no text not null unique
    default 'CMD-' || lpad(nextval('public.order_no_seq')::text, 5, '0'),

  customer_name text not null,
  customer_phone text,

  -- Seule date saisie par le client ; les deux suivantes en sont déduites
  -- puis restent modifiables au cas par cas.
  event_date date not null,
  pickup_date date not null,
  return_due_date date not null,
  actual_return_date date,

  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null default 0,
  -- « VERS » du tableur.
  amount_paid numeric(12, 2) not null default 0,
  -- « REST » du tableur : colonne GÉNÉRÉE, jamais saisie à la main.
  balance numeric(12, 2) generated always as (total_price - amount_paid) stored,

  -- Garantie détenue temporairement. N'est JAMAIS du chiffre d'affaires.
  caution_amount numeric(12, 2) not null default 0,
  caution_returned boolean not null default false,

  -- « Allez Valid » / « Retour Val » : les deux cases du tableur.
  picked_up boolean not null default false,
  returned boolean not null default false,

  status text not null default 'reservee',
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_status_valid
    check (status in ('reservee', 'en_cours', 'retournee', 'annulee')),
  constraint orders_dates_coherent check (return_due_date >= pickup_date),
  constraint orders_amounts_positive check (
    subtotal >= 0 and discount >= 0 and total_price >= 0
    and amount_paid >= 0 and caution_amount >= 0
  )
);

comment on column public.orders.balance is
  'Colonne générée (total_price - amount_paid). Ne jamais tenter de l''écrire.';

create index orders_event_date_idx on public.orders (event_date desc);
create index orders_pickup_date_idx on public.orders (pickup_date desc);
create index orders_status_idx on public.orders (status);
create index orders_created_by_idx on public.orders (created_by);

-- =============================================================================
-- Lignes de commande — le cœur de la disponibilité
-- =============================================================================

create table public.order_lines (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,

  -- NULL => pièce sous-louée chez un confrère (colonne « FETHI LOC »).
  -- On ne gère pas le planning d'un autre magasin, donc pas de blocage.
  unit_id bigint references public.article_units (id) on delete restrict,
  external_source text,
  external_label text,
  external_cost numeric(12, 2),

  unit_price numeric(12, 2) not null default 0,
  line_note text,

  -- Instantané : l'historique d'une commande survit au renommage ou au
  -- retrait d'une pièce du stock.
  model_name_snapshot text,
  size_snapshot text,

  -- Dénormalisés depuis `orders` par trigger — indispensables à la contrainte
  -- d'exclusion, qui ne peut pas faire de jointure.
  rental_range daterange,
  is_active boolean not null default true,

  constraint order_lines_unit_or_external check (
    unit_id is not null or external_label is not null
  ),
  constraint order_lines_prices_positive check (
    unit_price >= 0 and (external_cost is null or external_cost >= 0)
  )
);

create index order_lines_order_idx on public.order_lines (order_id);
create index order_lines_unit_idx on public.order_lines (unit_id);

-- -----------------------------------------------------------------------------
-- LA contrainte : double-réservation impossible.
--
-- Postgres lui-même refuse deux lignes actives portant la même pièce sur des
-- plages qui se chevauchent. Deux employés qui valident la même veste au même
-- instant depuis deux téléphones : la seconde transaction échoue. Une
-- vérification faite seulement en JavaScript laisserait une fenêtre de course,
-- donc de vraies double-locations un samedi de mariage.
--
-- Partielle sur `unit_id is not null` : les pièces externes ne nous appartiennent
-- pas. Partielle sur `is_active` : une commande annulée libère ses pièces.
-- -----------------------------------------------------------------------------
alter table public.order_lines
  add constraint order_lines_no_double_booking
  exclude using gist (unit_id with =, rental_range with &&)
  where (is_active and unit_id is not null);

-- =============================================================================
-- Dépenses — charges générales ET « les frais » d'une commande
-- =============================================================================

create table public.expenses (
  id bigint generated always as identity primary key,
  spent_on date not null default current_date,
  category text not null,
  amount numeric(12, 2) not null,
  description text,
  -- Renseigné => frais de cette commande (retouche, pressing, sous-location).
  -- NULL      => charge générale (loyer, achat de stock).
  order_id bigint references public.orders (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint expenses_category_valid check (
    category in ('achat_stock', 'nettoyage', 'retouche', 'sous_location',
                 'loyer', 'salaire', 'transport', 'autre')
  ),
  constraint expenses_amount_positive check (amount >= 0)
);

comment on table public.expenses is
  'Sert deux usages : frais rattachés à une commande (order_id renseigné) et '
  'charges générales (order_id NULL). Bénéfice = recettes - somme des deux.';

create index expenses_spent_on_idx on public.expenses (spent_on desc);
create index expenses_order_idx on public.expenses (order_id);
create index expenses_created_by_idx on public.expenses (created_by);
