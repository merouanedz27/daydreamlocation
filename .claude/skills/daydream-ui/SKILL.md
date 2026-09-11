---
name: daydream-ui
description: Design system for DayDream Location — colour tokens, typography, the mandatory RTL logical-properties rule, shadcn/ui conventions and mobile-first patterns. Use whenever writing styles, building a component, or laying out a screen in this project.
---

# Design system — « Jaune & Brun sur blanc »

Boutique de location de costumes de mariage. Blanc franc, jaune en accent, brun en appui.
**Jamais** le template SaaS générique.

## Tokens

Définis une seule fois dans `src/app/globals.css` via `@theme` (Tailwind v4, config CSS-first —
il n'y a **pas** de `tailwind.config.ts`).

| Rôle | Hex | Contraste | Usage |
|---|---|---|---|
| `background` | `#FFFFFF` | — | blanc |
| `nav` | `#6B4F3A` | voir la section « Barres » | **surface** des barres et du pied de page |
| `nav-foreground` | `#FFFFFF` | 6,09:1 au pire | texte principal et onglet actif SUR la barre |
| `nav-muted` | `#E9DFD5` | 4,63:1 au pire | texte secondaire SUR la barre |
| `nav-border` | blanc 18 % | — | filet de séparation des barres |
| `cream` | `#FAF5EA` | encre 14,47:1 · muted-fg 6,32:1 | surface chaude disponible (plus utilisée par les barres) |
| `foreground` | `#2B2119` | 15,7:1 | encre brun-noir |
| `primary` | `#EAB308` | — | **jaune 500** : remplissages UNIQUEMENT |
| `primary-foreground` | `#2B2119` | 8,21:1 sur jaune | texte SUR le jaune |
| `gold-strong` | `#A16207` | 4,92:1 | jaune **lisible en texte / trait / icône** |
| `gold-soft` | `#FEF9C3` | encre dessus 14,65:1 | voile jaune (pastilles, survol) |
| `ring` | `#A16207` | 4,92:1 | anneau de focus (jamais le jaune vif) |
| `secondary` | `#6B4F3A` | — | **brun** |
| `secondary-foreground` | `#FFFFFF` | 7,49:1 sur brun | texte SUR le brun |
| `brown-soft` | `#F1E9E1` | — | surface brune très claire |
| `muted` | `#F6F2EC` | — | fonds secondaires |
| `muted-foreground` | `#645850` | 6,88:1 | texte secondaire |
| `border` | `#E7DFD3` | — | bordures fines |
| `success` | `#4A6141` | 6,82:1 | vert — **disponible** |
| `success-soft` | `#EAF0E7` | texte dessus 5,89:1 | pastille disponible |
| `warning` | `#C2410C` | 5,18:1 | terre cuite — retard, reste dû |
| `warning-soft` | `#FFEDD5` | texte dessus 4,52:1 | pastille alerte |
| `destructive` | `#8B2F2F` | blanc dessus 8,25:1 | suppression, annulation |

### Trois pièges mesurés — ne pas les redécouvrir

1. **Le blanc sur le jaune ne passe pas** : 1,84:1. Un bouton jaune porte du texte **encre**
   (8,21:1). `primary-foreground` vaut donc l'encre, jamais le blanc.
2. **Le jaune vif ne vaut que 1,92:1 sur blanc.** `primary` est une couleur de **remplissage**.
   Dès que le jaune devient du **texte**, un **trait fin**, une **icône** ou un **anneau de
   focus**, utiliser `gold-strong` (`#A16207`, 4,92:1). C'est la règle qui a motivé le
   passage de `text-primary` à `text-gold-strong` dans `bottom-nav`, `.ornament`, les
   variantes `link` et les survols de lien.
3. **`warning` a dû quitter l'ambre.** À côté d'un jaune vif de marque, une pastille « Reste dû »
   en nuance de jaune ne se lit plus comme une alerte : d'où la terre cuite `#C2410C`, chaude
   mais franchement distincte du jaune comme du rouge `destructive`.

Les ratios ci-dessus sont **mesurés**, pas estimés. La palette a échoué deux fois à cet examen :
ivoire-sur-or à 2,92:1, puis l'or entier sous 4,5:1 sur blanc. **Mesurer avant d'affirmer.**

Ne jamais écrire une couleur en dur dans un composant — toujours via un token.

Mode sombre non exposé en v1, mais toute couleur passe par un token pour pouvoir l'activer
sans refonte.

## Typographie

| Langue | Corps de texte | Titres |
|---|---|---|
| Français | **Inter** (variable) | Inter, graisse 500 |
| Arabe | **Cairo** (variable) | Cairo, graisse 500 |

Deux variables portent ce choix, posées sur `<html>` dans
`src/app/[locale]/layout.tsx` : `--font-sans` (corps) et `--font-heading` (titres).
**C'est le seul endroit du produit qui connaisse la locale** — aucune autre règle CSS ne doit
tester la langue. Utiliser `font-sans` et `font-heading`, jamais une famille en dur.

**Une seule famille par langue.** La hiérarchie se fait à la **graisse**, jamais au changement de
police. Les deux variables restent malgré tout distinctes : un caractère de titre pourra revenir
sans toucher un seul composant. Aucune famille serif dans le produit.

Cairo charge le sous-ensemble **latin en plus de l'arabe**, et ce n'est pas décoratif : même en
arabe, l'application affiche des chiffres occidentaux et des références latines (« Gio-079-01 »).
Sans ce sous-ensemble, ces caractères tombent sur la police système.

### Chiffres tabulaires — mesuré, pas supposé

`font-variant-numeric: tabular-nums` est posé sur `html` dans `globals.css`, pour tout le produit.
Mesure des chasses de chiffres (sur 1000) :

| Police | Chiffres de largeur égale ? | `tnum` |
|---|---|---|
| Inter | **non** — 407 pour le « 1 », 646 pour le « 4 » | oui |
| Cairo | **oui** — 560 partout | non |
| Roboto (ancien) | oui — 562 partout | oui |
| Tajawal (ancien) | non — 375 à 553 | **non** |

Sans la règle globale, passer de Roboto à Inter aurait mis en dents de scie toute colonne de prix
ou de dates non marquée `.tabular`. Et Tajawal ne pouvait s'aligner d'aucune façon : ni chasses
égales, ni fonction `tnum` à activer — les montants arabes n'ont jamais été alignés jusqu'ici.

Avant de changer une police de ce produit, **remesurer** : c'est un registre de comptes, les
colonnes de nombres sont la lecture principale.

L'arabe ne connaît pas la casse : ne jamais lui appliquer `uppercase`, `capitalize` ou une approche
resserrée héritée du latin (`tracking-tight` est déjà neutralisé pour les titres arabes).

## Signature visuelle

- Filets or d'un cheveu (`1px`) plutôt que des ombres.
- Séparateur ornemental : trait fin + petit losange centré (`.ornament` + `.ornament-diamond`).
- Bordures fines et beaucoup de blanc. Cartes plates : sur fond blanc, ce sont les **bordures**
  qui structurent, pas les ombres.

### Barres de navigation : brun translucide et flouté

En-tête et barre basse sont `bg-nav` (brun `#6B4F3A`) **à 92 %** avec `backdrop-blur-md`.
Le contenu défile visiblement dessous : la barre appartient à la page au lieu de flotter
par-dessus. Le pied de page reprend le même brun, **opaque** — il ne surplombe rien.

```
bg-nav supports-[backdrop-filter]:bg-nav/92 backdrop-blur-md
```

Trois points à ne pas simplifier :

1. **92 %, mesuré — et non 85 % comme du temps du crème.** Une barre SOMBRE inverse le risque de
   la translucidité : ce qui la menace n'est plus un aplat sombre qui passerait dessous, mais le
   fond **blanc** de la page, c'est-à-dire le cas ordinaire. Pire cas (brun 92 % sur blanc) :

   | Sur la barre | Contraste au pire | Verdict |
   |---|---|---|
   | `nav-foreground` `#FFFFFF` | 6,09:1 | texte |
   | `nav-muted` `#E9DFD5` | 4,63:1 | texte — le beige le plus sombre qui tienne AA |
   | pastille `gold-soft` `#FEF9C3` | 5,67:1 (encre dessus 14,65:1) | onglet actif |
   | jaune vif `#EAB308` | 3,17:1 | **trait ou pastille seulement, jamais du texte** |

2. **Aucune couleur de texte de la page ne survit sur ce brun.** `muted-foreground` y tombe à
   **1,09:1**, l'encre à 2,10:1. Tout composant placé dans une barre doit reposer explicitement
   sa couleur en `nav-foreground` / `nav-muted` — y compris les boutons shadcn, dont les
   variantes `ghost` supposent un fond clair.
3. **`bg-nav` opaque reste le repli**, d'où le `supports-[backdrop-filter]`. Sans flou, une
   barre translucide laisse le texte de la page traverser le sien : illisible.

Le survol éclaircit le **fond ET le texte** (`hover:bg-nav-foreground/8 hover:text-nav-foreground`) :
à 8 % de voile blanc, `nav-muted` seul repasserait sous 4,5:1.

Ce n'est **pas** du glassmorphism : ni halo, ni ombre portée, ni bord lumineux. C'est le filet de
bordure qui sépare, comme partout ailleurs dans le produit.

`themeColor` dans `src/app/[locale]/layout.tsx` suit `--nav`, pas le fond de page : sinon un
bandeau blanc de navigateur se colle au-dessus d'un en-tête brun sur le téléphone de l'équipe.

### Titres de page : pas deux fois la même information

Un écran qui figure dans la barre de navigation (Commandes, Stock, Tableau de bord, Dépenses)
n'affiche **pas** de titre visible : l'onglet actif le dit déjà, et sur un écran de 390 px cette
ligne est volée au contenu. Le `<h1>` reste dans le DOM en `sr-only` — un document sans `h1`
casse la navigation par titres des lecteurs d'écran.

Les écrans qui **ne** figurent pas dans la barre (fiche commande, fiche modèle, nouveau modèle,
ajout de pièce) gardent leur titre visible : lui n'est répété nulle part.

### Interdits
Dégradés violet-bleu · glassmorphism (halos, bords lumineux, cartes « en verre » — la translucidité
mesurée des barres de navigation ci-dessus est la seule exception) · ombres épaisses ·
coins ultra-arrondis (`rounded-3xl`+) · émojis en guise d'icônes (utiliser `lucide-react`).

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
