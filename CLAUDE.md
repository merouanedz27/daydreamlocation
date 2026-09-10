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

npx supabase start        # Postgres local (nécessite Docker)
npx supabase migration new <nom>
npx supabase db reset     # rejoue toutes les migrations + seed
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

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
src/app/[locale]/(app)/commandes/nouvelle   assistant pas-à-pas
src/app/[locale]/(app)/commandes/[id]
src/app/[locale]/(app)/stock                modèles, pièces, ensembles
src/app/[locale]/(app)/tableau-de-bord      CA / dépenses / bénéfice   (owner)
src/app/[locale]/(app)/depenses             (owner)

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

Pas d'inscription publique : les comptes sont créés par le propriétaire.
