import type { Page } from "@playwright/test";
import { as, expect, test } from "./fixtures";
import { STATIC_ROUTES } from "./routes";

/**
 * Chaque écran s'ouvre, sans erreur serveur ni erreur JavaScript, à 390 px,
 * et sans défilement horizontal.
 */
async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} → HTTP`).toBeLessThan(400);
  // Pas `networkidle` : des requêtes de fond (catalogue hors ligne, mesures)
  // le repoussent sans fin.
  await page.waitForLoadState("load");
  // L'overlay d'erreur de Next (dev) n'est pas là.
  await expect(page.locator("nextjs-portal [data-nextjs-dialog]")).toHaveCount(0);
  // Les graphiques prennent leur largeur après coup : on laisse la page se poser.
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      { message: `${path} déborde à 390 px`, timeout: 10_000 },
    )
    .toBeLessThanOrEqual(1);
}

/** Le premier lien vers une fiche (`/fr/commandes/123`) de la liste. */
async function firstHref(page: Page, listPath: string, pattern: RegExp) {
  await page.goto(listPath);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const href = hrefs.find((h) => pattern.test(h));
  expect(href, `aucun lien ${pattern} sur ${listPath}`).toBeTruthy();
  return href!;
}


test.describe("propriétaire — tous les écrans", () => {
  as("owner");

  for (const path of STATIC_ROUTES) {
    test(`ouvre ${path}`, async ({ page }) => {
      await visit(page, path);
    });
  }

  test("fiches : commande, modèle, ensemble", async ({ page }) => {
    const order = await firstHref(page, "/fr/commandes", /^\/fr\/commandes\/\d+$/);
    await visit(page, order);
    await visit(page, `${order}/modifier`);
    await visit(page, order.replace("/commandes/", "/imprimer/commande/"));

    const model = await firstHref(page, "/fr/stock", /^\/fr\/stock\/\d+$/);
    await visit(page, model);
    await visit(page, `${model}/modifier`);
    await visit(page, `${model}/piece`);

    const ensemble = await firstHref(page, "/fr/stock/ensembles", /^\/fr\/stock\/ensembles\/\d+$/);
    await visit(page, ensemble);
  });
});

test.describe("employé — droits", () => {
  as("staff");

  test("crée des commandes", async ({ page }) => {
    await visit(page, "/fr/commandes/nouvelle");
    await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
  });

  for (const path of ["/fr/tableau-de-bord", "/fr/equipe", "/fr/parametres"]) {
    test(`renvoyé de ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
    });
  }

  test("frais : son propre écran", async ({ page }) => {
    await visit(page, "/fr/frais");
  });
});

test.describe("tailleur — l'atelier seul", () => {
  as("tailleur");

  test("ouvre l'atelier", async ({ page }) => {
    await visit(page, "/fr/atelier");
    await visit(page, "/fr/atelier/taillees");
  });

  test("renvoyé du magasin vers l'atelier", async ({ page }) => {
    await page.goto("/fr/commandes");
    await expect(page).toHaveURL(/\/fr\/atelier/);
    await page.goto("/fr/stock");
    await expect(page).toHaveURL(/\/fr\/atelier/);
  });
});

test.describe("connexion", () => {
  test("mauvais mot de passe refusé", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByLabel("E-mail").fill("owner@daydream.local");
    await page.getByLabel("Mot de passe", { exact: true }).fill("faux-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/fr\/login/);
    await expect(page.getByRole("alert").or(page.locator("[data-slot=field-error]")).first()).toBeVisible();
  });

  test("sans session → login", async ({ page }) => {
    await page.goto("/fr/commandes");
    await expect(page).toHaveURL(/\/fr\/login/);
  });

  test("arabe : page en RTL", async ({ page }) => {
    await page.goto("/ar/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});
