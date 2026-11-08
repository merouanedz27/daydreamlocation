import { test as base, expect, type Page } from "@playwright/test";
import { stateFile, type Role } from "./accounts";

/**
 * Chaque test échoue sur une erreur JavaScript de la page ou une erreur de la
 * console : les erreurs React « silencieuses » remontent ainsi.
 */
const IGNORED = [
  // Bruit du serveur de dev, pas des bugs de l'app.
  /Download the React DevTools/,
  /\[HMR\]/,
  /\[Fast Refresh\]/,
  /webpack-hmr|turbopack-hmr/,
  // Le service worker n'est pas servi en dev.
  /service ?worker|serwist|sw\.js/i,
  // Abandons de requêtes à la navigation.
  /net::ERR_ABORTED/,
  /Failed to load resource: the server responded with a status of 404/,
  // Scripts externes (Vercel Speed Insights) : réseau du poste, pas l'app.
  /net::ERR_NAME_NOT_RESOLVED|net::ERR_INTERNET_DISCONNECTED/,
  /Vercel Speed Insights/,
];

type Fixtures = { errors: string[] };

export const test = base.extend<Fixtures>({
  errors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", async (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED.some((re) => re.test(text))) return;
        // Les avertissements React passent le composant en argument (`%s`) :
        // on les garde, c'est ce qui dit OÙ chercher.
        const args = await Promise.all(
          msg.args().slice(1).map((a) => a.jsonValue().catch(() => "?")),
        ).catch(() => []);
        const extra = args.map((a) => String(a).slice(0, 400)).join(" | ");
        errors.push(`console: ${text}${extra ? ` ⟶ ${extra}` : ""}`);
      });
      await use(errors);
      if (errors.length && !testInfo.annotations.some((a) => a.type === "allow-errors")) {
        expect(errors, "erreurs JavaScript dans la page").toEqual([]);
      }
    },
    { auto: true },
  ],
});

/** Connecte la suite de tests sous un rôle. */
export function as(role: Role) {
  test.use({ storageState: stateFile(role) });
}

/**
 * La page n'est pas « gelée » : aucun reste de `pointer-events: none` sur le
 * <body> (le symptôme du client) et aucun tiroir ouvert.
 */
export async function expectNotFrozen(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.body.style.pointerEvents), {
      message: "body pointer-events (page gelée ?)",
      timeout: 5_000,
    })
    .not.toBe("none");
  await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
}

export { expect };
