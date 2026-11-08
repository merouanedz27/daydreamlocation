import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { ACCOUNTS, PASSWORD, stateFile, type Role } from "./accounts";
import { STATIC_ROUTES } from "./routes";

/**
 * 0. Garde-fou : les tests écrivent dans la base — jamais ailleurs qu'en LOCAL.
 * 1. Base propre : migrations + seed + comptes de test (sauf E2E_NO_RESET=1).
 * 2. Une session par rôle, gardée dans e2e/.auth/ — les tests partent connectés.
 * 3. Chaque écran ouvert une fois : `next dev` compile au premier passage.
 */
export default async function globalSetup(config: FullConfig) {
  const env = readFileSync(".env.local", "utf8");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error(
      `Tests E2E refusés : .env.local pointe sur ${url || "(rien)"} — seulement le Supabase LOCAL (npm run db:env).`,
    );
  }

  if (!process.env.E2E_NO_RESET) {
    execSync("npx supabase db reset --local", { stdio: "inherit" });
  }

  mkdirSync("e2e/.auth", { recursive: true });
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();

  for (const role of Object.keys(ACCOUNTS) as Role[]) {
    const context = await browser.newContext({ baseURL, locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/fr/login");
    await page.getByLabel("E-mail").fill(ACCOUNTS[role]);
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(role === "tailleur" ? /\/fr\/atelier/ : /\/fr\/commandes/, {
      timeout: 120_000,
    });
    await context.storageState({ path: stateFile(role) });

    if (role === "owner") {
      // Préchauffage : chaque page compilée avant que les tests ne chronomètrent.
      for (const path of STATIC_ROUTES) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await page.goto(path, { timeout: 180_000 }).catch(() => null);
          if (res && res.status() < 400) break;
        }
      }
    }
    await context.close();
  }

  await browser.close();
}
