import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Interdiction des classes Tailwind DIRECTIONNELLES PHYSIQUES.
 *
 * L'application est bilingue français / arabe RTL. Une classe `pl-4` reste à
 * gauche en arabe et casse la mise en page. Les propriétés logiques
 * (`ps-4`, `me-2`, `text-start`…) s'inversent automatiquement.
 *
 * Retrofitter le RTL après coup coûte beaucoup plus cher que l'imposer dès le
 * premier composant : d'où une erreur de lint, pas un avertissement.
 *
 * Voir le skill `daydream-ui`.
 */
const rtlForbidden = [
  {
    pattern: "(p|m)[lr]-",
    fix: "ps-/pe-/ms-/me-",
  },
  {
    pattern: "text-(left|right)",
    fix: "text-start / text-end",
  },
  {
    pattern: "(left|right)-",
    fix: "start- / end-",
  },
  {
    pattern: "border-[lr](-|$|\\s)",
    fix: "border-s / border-e",
  },
  {
    pattern: "rounded-[lr]-",
    fix: "rounded-s-* / rounded-e-*",
  },
  {
    pattern: "(float|clear)-(left|right)",
    fix: "float-start / float-end",
  },
];

/**
 * Le sélecteur cible toute chaîne littérale située sous un attribut
 * `className` — ce qui couvre aussi `cn("...")` et `clsx("...")` puisque les
 * littéraux y sont des descendants de l'attribut.
 *
 * Limite connue : les chaînes définies hors JSX (variantes `cva` dans un
 * fichier séparé) ne sont pas couvertes. Les composants `ui/` générés par
 * shadcn sont déjà écrits en propriétés logiques.
 */
const rtlRules = rtlForbidden.map(({ pattern, fix }) => ({
  selector: `JSXAttribute[name.name="className"] Literal[value=/(^|[\\s])-?${pattern}/]`,
  message: `RTL : classe directionnelle physique interdite. Utilisez ${fix}. Voir le skill daydream-ui.`,
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...rtlRules],
      // Interdit `next/link` et `next/navigation` : ces versions perdent la
      // locale. Passer par `@/i18n/navigation`. Voir le skill daydream-i18n.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message:
                "Importez `Link` depuis `@/i18n/navigation` pour conserver la locale.",
            },
            {
              name: "next/navigation",
              importNames: ["redirect", "permanentRedirect", "useRouter", "usePathname"],
              message:
                "Importez ces helpers depuis `@/i18n/navigation` pour conserver la locale.",
            },
          ],
        },
      ],
    },
  },
  {
    // Le provider de locale et les composants shadcn générés ont besoin des
    // primitives brutes de Next.
    files: ["src/i18n/**", "src/components/ui/**", "src/proxy.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
