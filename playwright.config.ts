import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout — contre le Supabase LOCAL (Docker) et `next dev`.
 *
 *   npm run db:start      # une fois, Docker démarré
 *   npm run test:e2e      # repart d'une base propre (db:reset), puis teste
 *
 * `E2E_NO_RESET=1` saute le db:reset (relance rapide pendant qu'on écrit un test).
 * Un seul worker : les tests partagent la même base.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // L'écran de référence du projet : un téléphone de 390 px.
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Africa/Algiers",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "mobile-fr", use: { browserName: "chromium" } }],
  webServer: {
    // `next dev` et SURTOUT PAS `next build && next start` : en mode production,
    // Next charge `.env.production.local` — la base, le SMTP et les clés push de
    // PRODUCTION. Le dev ne lit que `.env.local` (Supabase local).
    // global-setup ouvre chaque page une fois d'avance (compilation à froid).
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/fr/login`,
    // Jamais un serveur déjà lancé : il pourrait tourner sur la config de prod.
    // `E2E_REUSE=1` : réutiliser un `next dev` déjà lancé SUR CE PROJET (jamais
    // un `next start`). Le garde-fou de global-setup vérifie quand même .env.local.
    reuseExistingServer: Boolean(process.env.E2E_REUSE),
    // Premier démarrage après un cache `.next` vide : plusieurs minutes.
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
