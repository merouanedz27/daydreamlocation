---
name: daydream-ui
description: Design system for DayDream Location — colour tokens, typography, the mandatory RTL logical-properties rule, shadcn/ui conventions and mobile-first patterns. Use whenever writing styles, building a component, or laying out a screen in this project.
---

# Design system — « Ivoire & Or Ancien »

Boutique de location de costumes de mariage. Le style doit évoquer le faire-part de mariage :
papier ivoire, filets or, élégance sobre. **Jamais** le template SaaS générique.

## Tokens

Définis une seule fois dans `src/app/globals.css` via `@theme` (Tailwind v4, config CSS-first —
il n'y a **pas** de `tailwind.config.ts`).

| Rôle | Hex | Usage |
|---|---|---|
| `--color-background` | `#FBF8F3` | fond ivoire/papier |
| `--color-foreground` | `#2E1F2B` | encre aubergine profond |
| `--color-primary` | `#B08D57` | or ancien — actions, filets, accents |
| `--color-muted` | `#F2EDE4` | fonds secondaires |
| `--color-border` | `#E4DACB` | bordures fines |
| `--color-success` | `#7C8B7A` | sauge — pièce **disponible** |
| `--color-warning` | `#C08A8A` | rose poudré — retard, alerte |
| `--color-destructive` | `#7A2E3E` | bordeaux — suppression, annulation |

shadcn écrit ses tokens en OKLCH : convertir ces hex à l'installation et garder **les hex ci-dessus
comme référence**. Ne jamais écrire une couleur en dur dans un composant — toujours via un token.

Mode sombre non implémenté en v1, mais toute couleur passe par un token pour pouvoir l'ajouter
sans refonte.

## Typographie

- **Titres et montants** : serif display (Cormorant Garamond) — c'est la signature du produit.
  Un prix affiché en serif ressemble à un faire-part, pas à un tableur.
- **Données et UI** : sans (Inter).
- **Arabe** : Tajawal pour tout. Il n'existe pas d'équivalent serif display convaincant en arabe —
  le contraste s'obtient par la **graisse** et la taille, pas par un changement de famille.

## Signature visuelle

- Filets or d'un cheveu (`1px`) plutôt que des ombres.
- Séparateur ornemental : trait fin + petit losange centré. À réutiliser entre les sections.
- Bordures fines et beaucoup de blanc. Cartes plates.

### Interdits
Dégradés violet-bleu · glassmorphism · ombres épaisses · coins ultra-arrondis (`rounded-3xl`+) ·
émojis en guise d'icônes (utiliser `lucide-react`).

## RÈGLE ABSOLUE — propriétés logiques (RTL)

L'app est bilingue français / **arabe RTL**. Toute classe directionnelle physique casse la version
arabe. ESLint refuse le commit.

| Interdit | À utiliser |
|---|---|
| `pl-4` `pr-4` | `ps-4` `pe-4` |
| `ml-2` `mr-2` | `ms-2` `me-2` |
| `text-left` `text-right` | `text-start` `text-end` |
| `left-0` `right-0` | `start-0` `end-0` |
| `border-l` `border-r` | `border-s` `border-e` |
| `rounded-l-*` `rounded-r-*` | `rounded-s-*` `rounded-e-*` |

Les icônes directionnelles (chevrons, flèches « suivant ») doivent être **miroitées en RTL** :
`rtl:-scale-x-100`. Une flèche « retour » qui pointe à gauche en arabe est un bug.

Corollaire : `flex-row` s'inverse automatiquement en RTL — c'est voulu. N'essaie **jamais** de le
compenser avec `flex-row-reverse`.

## Mobile d'abord — l'équipe travaille au téléphone

Concevoir chaque écran à **390 px** de large. Le desktop est le cas secondaire.

- **Navigation** : barre d'onglets **basse** (zone du pouce) — Commandes · Stock · `+` · Tableau de bord.
  L'onglet Tableau de bord n'apparaît que pour le rôle `owner`.
- **Cibles tactiles** : 44 px minimum. Les boutons `size="sm"` de shadcn sont trop petits — les élargir.
- **`Drawer` / `Sheet` plutôt que `Dialog`.** Une modale centrée est inutilisable à une main.
- **Barre d'action collante** en bas des formulaires (`sticky bottom-0`), jamais un bouton perdu en
  bas d'un long scroll.
- **Listes plutôt que tableaux.** Un `<table>` ne passe pas à 390 px : sur mobile, une carte par
  ligne ; le tableau est réservé au desktop (`hidden md:table`).
- **Champs numériques** : `inputMode="numeric"` pour ouvrir le pavé numérique (prix, téléphone).

## Conventions shadcn

- Composants générés dans `src/components/ui/` — ne pas les éditer à la main sauf pour appliquer
  les règles RTL/tactiles ci-dessus. Les composants **métier** vont dans `src/components/`.
- Formulaires : `Form` shadcn + `react-hook-form` + résolveur Zod. Pas de `useState` par champ.
- Retours utilisateur : `sonner` pour les toasts. Toujours un message d'erreur **en langue de
  l'utilisateur**, jamais l'erreur Postgres brute (voir `daydream-db` pour le cas du conflit
  de réservation).

## Codes couleur métier — à respecter partout

Disponible → `success` (sauge) · Réservé → `primary` (or) · En retard → `warning` (rose poudré) ·
Retiré / annulé → `muted` (gris).

Ne jamais coder la disponibilité **uniquement** par la couleur : toujours doubler d'un texte ou
d'une icône (daltonisme, écran en plein soleil).
