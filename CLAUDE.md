# DayDream Location

Plateforme de gestion pour un loueur de costumes de mariage (Algérie).
Remplace un Google Sheet. Utilisée **sur téléphone** par l'équipe.

Le problème central : les commandes **mélangent les pièces** (veste du Costume n°12 + chemise du n°7).
Toute la conception découle de là — la disponibilité se calcule **par pièce physique**, jamais par
costume.

## Stack

- Next.js 16 (App Router) + TypeScript `strict`
- Tailwind CSS v4 (config CSS-first via `@theme`) + shadcn/ui
- Supabase : Postgres + Auth + Storage
- **Pas de framework backend séparé** — Server Actions et Route Handlers Next.js uniquement
- Déploiement Vercel
- PWA installable (Serwist)
- i18n : Français (défaut) + Arabe **RTL** (next-intl)

## Commandes

Gestionnaire de paquets : **npm** (pnpm ne s'installe pas sans droits admin sur ce poste).
La CLI Supabase s'utilise via `npx`, pas d'installation globale.

```bash
npm run dev               # serveur de dev
npm run build             # build de production
npm run lint              # ESLint (inclut la règle RTL, voir plus bas)
npm run typecheck         # tsc --noEmit

# Supabase LOCAL (Docker) — développement et tests
npm run db:start          # démarre les conteneurs (migrations + seed au 1er lancement)
npm run db:env            # écrit les clés locales dans .env.local
npm run db:migrate        # applique les nouvelles migrations en local
npm run db:reset          # repart de zéro : migrations + seed + comptes de test
npm run db:test           # rejoue les tests SQL (rollback, sans trace)
npm run db:types          # régénère src/lib/supabase/database.types.ts
npm run db:stop

# PRODUCTION — explicite, lit .env.production.local
npm run db:push:prod      # applique les migrations
npm run db:advisors:prod  # audit sécurité + performance

npx supabase migration new <nom>

# Tests de bout en bout (Playwright, téléphone 390 px, Supabase LOCAL)
npm run test:e2e          # db:reset puis tous les écrans (~20 min, `next dev`)
E2E_NO_RESET=1 npx playwright test e2e/order-create.spec.ts   # un fichier, sans reset
```

**Tests E2E** : `e2e/`. Ils écrivent dans la base, donc `global-setup` refuse de
tourner si `.env.local` ne pointe pas sur le Supabase local. Toujours `next dev`,
jamais `next start` : en mode production, Next charge `.env.production.local`
(base, SMTP et push de PRODUCTION). Une erreur JavaScript ou console fait
échouer le test.

**Version stable** : tag `v1.0.0-stable` et branche `stable` — 47/47 E2E verts,
schéma à `20261108100000_tailor_undo_alteration.sql`. Revenir en arrière :
redéployer ce tag sur Vercel (ou `git checkout v1.0.0-stable`). Le code revient,
**pas la base** : une migration appliquée après le tag reste en place, donc toute
nouvelle migration doit rester compatible avec ce code.

**Deux environnements.** En développement, Supabase tourne dans Docker (API
`http://127.0.0.1:56321`, Studio `:56323`, Postgres `:56322` — ports 563xx car
d'autres projets occupent les 543xx et 553xx). Comptes de test :
`owner@daydream.local`, `staff@daydream.local` et `tailleur@daydream.local`, mot de passe `daydream-local`
(`supabase/seed-local.sql`). Le stock de démonstration vient de `supabase/data/`
et `seed.sql`.

La production lit `.env.production.local` (outillage) et les variables Vercel
(application) ; les scripts n'y touchent qu'avec `--prod`. Son `SUPABASE_DB_URL`
pointe sur le *session pooler*, port **5432** — le 6543 est en mode transaction et
gère mal le DDL. Cette variable n'a PAS de préfixe `NEXT_PUBLIC_` : elle contient
le mot de passe de la base et ne doit jamais atteindre le navigateur.

**Toute modification du schéma = un fichier dans `supabase/migrations/`**, testé
en local (`db:migrate` ou `db:reset`), puis appliqué en production par
`db:push:prod`. Jamais l'inverse.

## Règles non négociables

1. **RTL** — jamais `pl-` `pr-` `ml-` `mr-` `text-left` `text-right` `left-` `right-`.
   Uniquement les propriétés logiques : `ps-` `pe-` `ms-` `me-` `text-start` `text-end` `start-` `end-`.
   ESLint le refuse. Voir le skill `daydream-i18n`.
2. **Aucun texte en dur dans le JSX.** Toute chaîne passe par next-intl, ajoutée dans `fr.json` **et**
   `ar.json` en même temps.
3. **Le schéma vit dans `supabase/migrations/`.** Jamais de modification par le dashboard Supabase.
4. **RLS activée sur toutes les tables**, sans exception. La clé `service_role` ne quitte jamais le serveur.
5. **La disponibilité est garantie par la base**, pas par le JavaScript. Ne jamais contourner la
   contrainte `EXCLUDE` sur `order_lines`. Voir le skill `daydream-db`.
6. **Mobile d'abord.** Chaque écran se conçoit à 390 px de large et s'utilise au pouce.

## Skills du projet

| Skill | Quand |
|---|---|
| `daydream-ui` | Écrire du style, des composants, un écran |
| `daydream-db` | Toucher au schéma, aux migrations, aux policies RLS |
| `daydream-i18n` | Ajouter du texte, formater une date, un montant |
| `daydream-feature` | Ajouter une fonctionnalité de bout en bout |

Skills installés dans `.agents/skills/` et liés dans `.claude/skills/` :

| Skill | Quand |
|---|---|
| `supabase` | Client, auth, storage, realtime, CLI Supabase |
| `supabase-postgres-best-practices` | **Avant toute migration** : schéma, index, policies RLS, types de colonnes |
| `shadcn` | Ajouter ou composer des composants |

Skills globaux utiles : `dataviz` (tableau de bord), `security-review` (audit RLS), `run`.

## Structure

```
src/app/[locale]/(auth)/login
src/app/[locale]/(app)/commandes            liste, recherche, filtres
src/app/[locale]/(app)/commandes/nouvelle   saisie rapide (une ligne d'AppSheet)
src/app/[locale]/(app)/commandes/calendrier jour / semaine / mois, sur la date de l'événement
src/app/[locale]/(app)/commandes/demain     événements du lendemain, ✈ en un toucher
src/app/[locale]/(app)/commandes/pas-rentres sorties non revenues, ✓ en un toucher
src/app/[locale]/(app)/commandes/[id]
src/app/[locale]/(app)/stock                modèles, pièces, ensembles
src/app/[locale]/(app)/tableau-de-bord      CA / dépenses / bénéfice   (owner)
src/app/[locale]/(app)/depenses             (owner)
src/app/[locale]/(app)/frais                ajout de frais par toute l'équipe ; chacun ne relit que les siens
src/app/[locale]/(app)/retouches            pièces chez le tailleur, impression des étiquettes QR
src/app/[locale]/(atelier)/atelier          l'écran du TAILLEUR : sa liste + scan « taillée »
src/app/[locale]/(print)/imprimer/retouches étiquettes QR, 10 par feuille 4 × 6

src/components/ui/          shadcn (généré, ne pas éditer à la main sans raison)
src/components/             composants métier
src/lib/supabase/           clients server / browser + types générés
src/lib/actions/            Server Actions (une par domaine)
src/lib/validation/         schémas Zod
messages/fr.json messages/ar.json
supabase/migrations/
```

## Vocabulaire du domaine — à ne pas confondre

- **modèle** (`article_models`) — « Gio-079 », code fournisseur. Un type de vêtement, pas un objet réel.
- **pièce** (`article_units`) — « Gio-079-01 », un vrai vêtement sur un cintre, avec sa taille.
  **C'est la seule chose qui se loue et qui bloque des dates.**
- **ensemble** (`ensembles`) — « Costume n°12 ». Un simple raccourci de saisie qui se déplie en pièces.
  **Un ensemble ne se réserve jamais.**
- **versement** (`amount_paid`) — acompte déjà payé. Le **reste** (`balance`) est une colonne
  **générée**, jamais saisie.
- **caution** — garantie laissée par le client, rendue au retour.
- **frais** — retouche, pressing. Une `expenses` avec un `order_id` renseigné.
- **pièce externe** — sous-louée chez un confrère : une ligne de commande **sans** `unit_id`.
  N'entre pas dans le stock.
- **vente** — un modèle a un usage (`article_models.purpose` : `location` | `vente`). Une pièce de
  vente se pioche dans une commande comme les autres ; sa ligne (`line_kind = 'vente'`, posé par
  trigger) bloque la pièce **sans fin** (`rental_range = [retrait, ∞)`) : la même contrainte
  `EXCLUDE` interdit de la vendre deux fois. Une commande sans aucune location (`has_rental = false`)
  n'a rien à rendre : « Allez Valid » coche aussi le retour.

- **retouche** (`line_alterations`) — ajustement d'UNE pièce d'une commande — **le pantalon
  seulement** (la saisie n'offre la case que sur lui) — lu par le tailleur sur une étiquette QR
  collée au vêtement, et sur le même QR imprimé en bas du ticket du costume (bon, page 2). `a_faire` → `taillee` quand il la scanne (e-mail aux
  administrateurs). Liée à `order_id` + `order_line_id` nullable : `update_order` réinsère les lignes,
  `sync_line_alterations` rattache la retouche par son `id`, que le formulaire renvoie.

**Ni la caution ni le versement ne sont du chiffre d'affaires.** La recette est `total_price`.

## Règles métier issues de son tableur actuel

- Il ne saisit qu'**une date** : celle de l'événement. L'app en déduit retrait = J−1 et retour = J+1
  (modifiable), plus 1 jour de nettoyage avant la remise en location.
- Veste et pantalon ont des **tailles différentes** sur la même commande (50 / 52) — c'est la preuve
  que la disponibilité se calcule à la pièce.
- Catégories réellement utilisées : costume (veste + pantalon), chemise, chaussures.
- « Allez Valid » / « Retour Val » restent **deux cases à cocher** dans l'UI — c'est son geste actuel.
  Le statut de la commande en est déduit, jamais saisi directement.

## Rôles

- `staff` — lit le stock, crée et modifie les commandes.
- `owner` — tout, plus les dépenses et le tableau de bord financier.
- `tailleur` — l'atelier SEUL (`/atelier`) : la liste des retouches et le scan. `private.is_staff()`
  l'exclut, donc aucune policy ne lui ouvre une table ; il ne passe que par `list_alterations()` et
  `mark_altered()`, qui ne rendent ni prix ni téléphone.

Pas d'inscription publique : les comptes sont créés par le propriétaire.
