---
name: daydream-ui
description: Design system for DayDream Location — colour tokens, typography, the mandatory RTL logical-properties rule, shadcn/ui conventions and mobile-first patterns. Use whenever writing styles, building a component, or laying out a screen in this project.
---

# Design system — « Or & Brun sur blanc »

Boutique de location de costumes de mariage. Blanc franc, or en accent, brun en appui.
**Jamais** le template SaaS générique.

## Tokens

Définis une seule fois dans `src/app/globals.css` via `@theme` (Tailwind v4, config CSS-first —
il n'y a **pas** de `tailwind.config.ts`).

| Rôle | Hex | Contraste | Usage |
|---|---|---|---|
| `background` | `#FFFFFF` | — | blanc |
| `foreground` | `#2B2119` | 15,7:1 | encre brun-noir |
| `primary` | `#BE9B45` | — | **or** : remplissages, accents, anneaux de focus |
| `primary-foreground` | `#2B2119` | 5,97:1 sur or | texte SUR l'or |
| `gold-strong` | `#8A6A1F` | 5,05:1 | or **lisible en texte** |
| `gold-soft` | `#F7EFDD` | — | voile doré (pastilles, survol) |
| `secondary` | `#6B4F3A` | — | **brun** |
| `secondary-foreground` | `#FFFFFF` | 7,49:1 sur brun | texte SUR le brun |
| `brown-soft` | `#F1E9E1` | — | surface brune très claire |
| `muted` | `#F6F2EC` | — | fonds secondaires |
| `muted-foreground` | `#645850` | 6,88:1 | texte secondaire |
| `border` | `#E7DFD3` | — | bordures fines |
| `success` | `#4A6141` | 6,82:1 | vert — **disponible** |
| `success-soft` | `#EAF0E7` | texte dessus 5,89:1 | pastille disponible |
| `warning` | `#8A5A22` | 5,89:1 | ambre — retard, reste dû |
| `warning-soft` | `#FBEEDD` | texte dessus 5,15:1 | pastille alerte |
| `destructive` | `#8B2F2F` | blanc dessus 8,25:1 | suppression, annulation |

### Deux pièges mesurés — ne pas les redécouvrir

1. **Le blanc sur l'or ne passe pas** : 2,64:1. Un bouton or porte du texte **encre** (5,97:1).
   `primary-foreground` vaut donc l'encre, jamais le blanc.
2. **AUCUN or n'atteint 4,5:1 sur blanc** — le meilleur candidat plafonne à 3,50. L'or convient
   aux remplissages, bordures et grands titres, **pas au texte courant**. Pour de l'or lisible,
   utiliser `gold-strong` (`#8A6A1F`, 5,05:1).

Ne jamais écrire une couleur en dur dans un composant — toujours via un token.

Mode sombre non exposé en v1, mais toute couleur passe par un token pour pouvoir l'activer
sans refonte.

## Typographie

- **Latin** : **Roboto** (400 / 500 / 700).
- **Arabe** : **Noto Kufi Arabic** (400 / 500 / 700).
- Aucune famille *display* distincte : la hiérarchie se fait à la **graisse** et à l'approche.
  `font-heading` est un alias de `font-sans`.
- `--font-sans` est posée sur `<html>` selon la locale, dans `src/app/[locale]/layout.tsx`.
  **C'est le seul endroit qui connaît la locale** — aucune autre règle CSS ne doit tester la langue.

Noto Kufi Arabic est une police **kufique**, très dessinée : excellente en titres, plus dense que la
moyenne en corps de texte. Si l'équipe trouve les listes fatigantes, basculer le corps en
Noto Sans Arabic et garder le Kufi pour les titres — un seul changement, dans le layout.

## Signature visuelle

- Filets or d'un cheveu (`1px`) plutôt que des ombres.
- Séparateur ornemental : trait fin + petit losange centré (`.ornament` + `.ornament-diamond`).
- Bordures fines et beaucoup de blanc. Cartes plates : sur fond blanc, ce sont les **bordures**
  qui structurent, pas les ombres.

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

Disponible → `success` (vert) · Réservé → `primary` / `gold-soft` (or) · En retard → `warning`
(ambre) · Retiré / annulé → `muted` (gris).

Ne jamais coder la disponibilité **uniquement** par la couleur : toujours doubler d'un texte ou
d'une icône (daltonisme, écran en plein soleil).
