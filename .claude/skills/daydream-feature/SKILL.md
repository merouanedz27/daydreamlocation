---
name: daydream-feature
description: End-to-end recipe for adding a feature to DayDream Location — migration, generated types, Zod schema, Server Action, RSC page, shadcn UI, i18n keys, RLS check. Use when implementing any new feature or screen in this project.
---

# Ajouter une fonctionnalité — recette de bout en bout

Ordre imposé : **la base d'abord, l'écran en dernier**. Commencer par l'UI conduit à découvrir un
problème de schéma une fois les composants écrits.

## 1. Migration

```bash
supabase migration new <nom_explicite>
```

Dans le même fichier SQL : la table/colonne, **et** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`,
**et** les policies. Une migration qui ajoute une table sans policy est incomplète.

```bash
supabase db reset    # vérifier que tout rejoue depuis zéro
```

Voir `daydream-db` pour le schéma, les conventions et le gabarit de policy.

## 2. Types

```bash
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Sans ça TypeScript décrit l'ancien schéma et valide du code faux.

## 3. Validation Zod — `src/lib/validation/`

Un schéma par formulaire. Il sert **deux fois** : côté client via le résolveur `react-hook-form`,
et côté serveur à l'entrée de la Server Action. La validation client est du confort ; celle du
serveur est la vraie.

Messages d'erreur : des **clés i18n**, pas des phrases en dur.

## 4. Server Action — `src/lib/actions/<domaine>.ts`

```ts
'use server';
```

Structure invariable :

1. `parse` de l'entrée avec le schéma Zod
2. client Supabase **serveur** (jamais `service_role`, voir `daydream-db`)
3. l'écriture
4. interception des erreurs Postgres attendues — en particulier **`23P01`** (pièce déjà réservée)
   à traduire en `errors.unitUnavailable`
5. `revalidatePath` du chemin concerné
6. retour d'un résultat typé `{ ok: true } | { ok: false, error: <clé i18n> }`

Ne jamais laisser remonter un message Postgres brut jusqu'à l'écran.

## 5. Page — `src/app/[locale]/(app)/...`

Server Component par défaut. La lecture se fait **dans la page**, pas dans un `useEffect`.
`'use client'` seulement pour les feuilles interactives (formulaire, filtre, sélecteur).

Pas de route API sauf nécessité réelle (webhook, upload) — les Server Actions suffisent.

## 6. UI

Suivre `daydream-ui` : tokens de couleur, propriétés logiques RTL, cibles 44 px, `Drawer` plutôt que
`Dialog`, carte-par-ligne sur mobile plutôt que tableau.

## 7. i18n

Suivre `daydream-i18n` : toute chaîne dans `messages/fr.json` **et** `messages/ar.json`, dans le même
changement.

## 8. Vérification avant de considérer la tâche finie

- [ ] `pnpm typecheck` et `pnpm lint` passent (le lint bloque les classes RTL physiques)
- [ ] `supabase db reset` rejoue proprement depuis zéro
- [ ] écran parcouru **en arabe** : pas de débordement, chevrons miroirs corrects
- [ ] écran testé à **390 px** de large, utilisable au pouce
- [ ] connecté en `staff` : les données réservées à `owner` sont bien inaccessibles
- [ ] si la fonctionnalité touche aux réservations : deux commandes concurrentes sur la même pièce et
      des dates qui se chevauchent → la seconde **échoue**
- [ ] `/run` pour valider dans l'app réelle, pas seulement en test

## Erreurs déjà commises à ne pas répéter

- Réserver un **ensemble** au lieu de ses pièces → la disponibilité devient fausse dès qu'un costume
  est éclaté. Un ensemble se déplie **toujours** en lignes de pièces.
- Compter la **caution** ou le **versement** comme chiffre d'affaires. La recette est `total_price`.
- Écrire `balance` à la main — c'est une colonne générée.
- Vérifier la disponibilité uniquement en JavaScript et faire confiance au résultat.
- `DELETE` sur une pièce du stock → l'historique des commandes est détruit. Utiliser `is_active`.
