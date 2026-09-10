---
name: daydream-db
description: Database reference for DayDream Location — full schema, Supabase migration workflow, RLS policy patterns, and the EXCLUDE constraint that makes double-booking impossible. Use whenever touching the schema, writing a migration, a query, or an RLS policy.
---

# Base de données — Supabase / Postgres

## Workflow — non négociable

Le schéma vit dans `supabase/migrations/`. **Jamais de modification par le dashboard Supabase** :
un changement cliqué n'est pas reproductible et n'existe pas en local.

```bash
supabase start                       # Postgres local
supabase migration new <nom>         # crée le fichier SQL
supabase db reset                    # rejoue tout depuis zéro + seed
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Régénérer les types **après chaque migration**, sinon TypeScript ment.

## Schéma

```
categories        veste, pantalon, chemise, chaussures, accessoire…
                  (table, pas enum → extensible par le client)

article_models    LE MODÈLE — n'est pas un objet réel
                  ref_code            « Gio-079 »  ← code fournisseur, saisi tel quel
                  name_fr, name_ar, category_id, color, brand, description
                  base_price, photo_path, is_active

article_units     LA PIÈCE PHYSIQUE — un vrai vêtement sur un cintre
                  model_id, ref_code  « Gio-079-01 »  ← généré, un par exemplaire
                  size, length_cm
                  price_override      NULL → on retombe sur base_price
                  purchase_price, purchase_date
                  condition           neuf | bon | usé | retiré
                  status              disponible | en_nettoyage | réparation | retiré

ensembles         « Costume n°12 » — raccourci de saisie, PAS une unité louable
                  name, description, photo_path, package_price, is_active
ensemble_items    ensemble_id → unit_id

orders            order_no, customer_name, customer_phone
                  event_date, pickup_date, return_due_date, actual_return_date
                  subtotal, discount, total_price
                  amount_paid                                    ← « VERS » du sheet
                  balance GENERATED ALWAYS AS (total_price - amount_paid) STORED
                  caution_amount, caution_returned
                  picked_up, returned                            ← « Allez Valid » / « Retour Val »
                  status, notes, created_by, created_at

order_lines       order_id
                  unit_id             NULLABLE  ← NULL = pièce sous-louée chez un confrère
                  external_source, external_label, external_cost
                  unit_price, line_note
                  model_name_snapshot, size_snapshot   ← l'historique survit aux modifs du stock
                  rental_range daterange, is_active    ← dénormalisés par trigger
                  CHECK (unit_id IS NOT NULL OR external_label IS NOT NULL)

expenses          date, category, amount, description, created_by
                  order_id  NULLABLE  ← renseigné = « les frais » d'une commande
                                        NULL = charge générale (loyer, achat stock)
```

## LE point critique — double-réservation impossible

```sql
ALTER TABLE order_lines ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (unit_id WITH =, rental_range WITH &&)
  WHERE (is_active AND unit_id IS NOT NULL);
```

`rental_range` = `[pickup_date, return_due_date + buffer_nettoyage]`, maintenu par un trigger sur
`orders` (dates ou statut modifiés → resynchronisation des lignes). `is_active` passe à faux quand la
commande est annulée, ce qui **libère** les pièces.

**Ne jamais contourner cette contrainte.** C'est Postgres qui refuse le conflit : deux employés qui
valident la même veste au même instant depuis deux téléphones, la seconde transaction échoue. Une
vérification uniquement en JavaScript laisse une fenêtre de course — donc de vraies double-locations
un samedi de mariage.

L'UI vérifie **aussi** en amont, pour griser les pièces et afficher un message propre. C'est du
confort, pas la garantie.

### Traiter l'erreur correctement

La violation remonte en code Postgres **`23P01`** (`exclusion_violation`). Toujours l'intercepter et
la traduire en `errors.unitUnavailable`, jamais laisser passer l'erreur brute vers l'écran.

### Les pièces externes (« FETHI LOC ») ne sont pas dans le stock
`unit_id IS NULL` + `external_label` : on ne gère pas le planning d'un autre magasin, d'où le
`WHERE ... unit_id IS NOT NULL` de la contrainte. `external_cost` alimente les frais de la commande.

## Règles de calcul financier

- **Recette** rattachée au `pickup_date`, statut ≠ `annulée`.
- **La caution n'est JAMAIS une recette** — c'est de l'argent détenu temporairement.
- **`amount_paid` n'est pas la recette non plus** — la recette est `total_price`. `amount_paid` sert
  au suivi des impayés.
- `Bénéfice(période) = Σ total_price − Σ expenses.amount` (frais de commande **et** charges générales).
- `balance` est une colonne **générée** : ne jamais l'écrire à la main.

## RLS

Activée sur **toutes** les tables, sans exception — y compris les nouvelles. Une table sans policy est
une fuite de données.

Table `profiles (id → auth.users, full_name, role)` avec `role` ∈ `owner` | `staff`.

- `staff` — lecture du stock, création et modification des commandes.
- `owner` — tout, plus `expenses` et le tableau de bord financier.

Pas d'inscription publique : la désactiver dans la config Supabase, les comptes sont créés par le
propriétaire.

La clé `service_role` **ne quitte jamais le serveur** : ni dans un Client Component, ni dans une
variable `NEXT_PUBLIC_*`. Le client navigateur utilise la clé anon, soumise à RLS.

Lancer `/security-review` avant toute mise en ligne.

### Gabarit de policy — à suivre systématiquement

Deux pièges de performance, documentés par le skill `supabase-postgres-best-practices`
(`references/security-rls-performance.md`) :

1. **Toujours envelopper les fonctions d'auth dans un `select`.** Écrit nu, `auth.uid()` est évalué
   **une fois par ligne**. Enveloppé, il est évalué une seule fois.
2. **Ne jamais interroger `profiles` directement dans une policy** : la policy de `profiles`
   s'appliquerait à son tour (récursion). Passer par une fonction `SECURITY DEFINER` dans un schéma
   privé, non exposé, avec `EXECUTE` révoqué pour les rôles publics.

```sql
create or replace function private.is_owner()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke execute on function private.is_owner() from public, anon, authenticated;

-- Dépenses et finances : propriétaire uniquement
create policy expenses_owner_all on public.expenses
  for all to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- Commandes : toute l'équipe connectée
create policy orders_staff_read on public.orders
  for select to authenticated using (true);
```

Indexer toute colonne utilisée dans une policy ou une clé étrangère
(`references/schema-foreign-key-indexes.md`).

## Conventions

- Montants : `numeric(12,2)`, jamais `float` (erreurs d'arrondi sur de l'argent réel).
- Dates de location : `date`, pas `timestamptz` — une location se compte en jours.
- Suppression : préférer `is_active = false` à un `DELETE` sur le stock. Une pièce supprimée
  détruirait l'historique des commandes.
- Toute nouvelle table : `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`,
  RLS activée, policies écrites dans la **même** migration.
