---
name: daydream-i18n
description: Bilingual FR/AR-RTL conventions for DayDream Location — adding translated strings with next-intl, key naming, and formatting money, dates and numbers for Algeria. Use whenever adding user-visible text or formatting a value.
---

# i18n — Français (défaut) + Arabe RTL

`next-intl`, segment de route `src/app/[locale]/`. Locales : `fr` (défaut) et `ar`.
`<html lang dir>` est dérivé de la locale dans le layout racine.

## Règle absolue

**Aucun texte en dur dans le JSX.** Chaque chaîne visible passe par next-intl et est ajoutée dans
`messages/fr.json` **et** `messages/ar.json` **dans le même changement**. Une clé présente d'un seul
côté est un bug — pas une tâche pour plus tard.

```tsx
// NON
<Button>Nouvelle commande</Button>

// OUI
const t = useTranslations('orders');
<Button>{t('new')}</Button>
```

Server Component : `getTranslations`. Client Component : `useTranslations`.

## Nommage des clés

`domaine.element` — plat sur deux niveaux, jamais imbriqué plus profond.

```
orders.new            orders.status.reserved      orders.pickupDate
stock.addPiece        stock.available             stock.sizeJacket
dashboard.revenue     dashboard.profit            dashboard.expenses
common.save           common.cancel               common.delete
errors.unitUnavailable
```

Les domaines suivent l'arborescence des routes : `orders`, `stock`, `dashboard`, `expenses`,
`auth`, `common`, `errors`.

## Vocabulaire métier — traductions figées

Ne pas réinventer ces termes d'un écran à l'autre.

| Concept | FR | AR |
|---|---|---|
| commande | commande | طلبية |
| pièce (vêtement physique) | pièce | قطعة |
| ensemble / costume complet | ensemble | طقم |
| disponible | disponible | متوفر |
| réservé | réservé | محجوز |
| versement | versement | تسبيق |
| reste dû | reste | الباقي |
| caution | caution | الضمان |
| frais | frais | مصاريف |
| bénéfice | bénéfice | الربح |

## Chiffres, monnaie, dates

**Chiffres occidentaux (0-9) même en arabe** — c'est l'usage au Maghreb, et l'équipe lit des prix
toute la journée. Locale de formatage : `ar-DZ-u-nu-latn`.

```ts
// src/lib/format.ts — passer par ces helpers, jamais par Intl directement dans un composant
formatMoney(7000, locale)   // « 7 000 DA »
formatDate(d, locale)       // « 26/08/2026 » dans les deux langues
```

Monnaie **DZD**, affichée `DA`. Dates **toujours `dd/MM/yyyy`** dans les deux langues : le format
US `MM/dd` provoquerait de vraies erreurs de réservation.

### Séparateur de milliers imposé — ne pas « corriger »

`Intl` seul donne **« 7 000 » en `fr-DZ` mais « 7.000 » en `ar-DZ`**. La même équipe verrait deux
écritures du même montant selon la langue, et un point se lit comme une virgule décimale. Sur des
prix relus toute la journée, c'est une source d'erreur réelle.

`formatGrouped()` dans `src/lib/format.ts` remplace donc le séparateur de groupe par une **espace
fine insécable** (`U+202F`) dans les deux langues. Ce n'est pas un oubli de localisation, c'est
délibéré : ne pas le retirer.

`date-fns` avec les locales `fr` et `ar-DZ` pour les dates relatives (« dans 3 jours »).

## Pièges

- **Pluriels** : syntaxe ICU de next-intl. L'arabe a **six** formes plurielles — ne jamais bricoler
  avec `count > 1 ? 's' : ''`.
- **Interpolation** : `t('greeting', {name})`, jamais de concaténation de chaînes — l'ordre des mots
  diffère en arabe.
- **Texte mixte arabe + codes latins** (`Gio-079-01` dans une phrase arabe) : l'ordre d'affichage se
  brise. Isoler le code dans un `<bdi>`.
- Les données saisies par l'équipe (nom du client, description d'une pièce) **ne sont pas traduites** —
  elles s'affichent telles quelles. Seule l'interface est bilingue.
