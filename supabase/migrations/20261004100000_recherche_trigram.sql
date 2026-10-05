-- =============================================================================
-- Recherche des commandes plus rapide.
--
-- La barre de recherche cherche « %terme% » (ilike) dans le nom du client, son
-- téléphone, le numéro de commande et le nom des pièces. Sans index adapté,
-- chaque recherche relisait TOUTES les commandes et TOUTES leurs lignes.
-- Un index trigramme (pg_trgm, GIN) sert justement les ilike '%…%'.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create index if not exists orders_customer_name_trgm
  on public.orders using gin (customer_name extensions.gin_trgm_ops);
create index if not exists orders_customer_phone_trgm
  on public.orders using gin (customer_phone extensions.gin_trgm_ops);
create index if not exists orders_order_no_trgm
  on public.orders using gin (order_no extensions.gin_trgm_ops);

create index if not exists order_lines_model_name_trgm
  on public.order_lines using gin (model_name_snapshot extensions.gin_trgm_ops);
create index if not exists order_lines_external_label_trgm
  on public.order_lines using gin (external_label extensions.gin_trgm_ops);
