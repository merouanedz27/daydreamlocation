import { as, expect, expectNotFrozen, test } from "./fixtures";
import { createOrder, drawer } from "./helpers";

/**
 * La vie d'une commande sur sa fiche : « Aller validé », versement,
 * « Retour validé », modification, annulation — chaque geste survit au
 * rechargement (il est bien en base).
 */
as("staff");

test("aller, versement, retour, modification, annulation", async ({ page }) => {
  const url = await createOrder(page, "E2E Cycle", 8);

  // --- Aller validé -------------------------------------------------------
  const allez = page.getByRole("switch", { name: /Aller validé/ });
  await expect(allez).toHaveAttribute("aria-checked", "false");
  await allez.click();
  await expect(allez).toHaveAttribute("aria-checked", "true");
  await expect(allez).toBeEnabled(); // enregistré en base, plus « en cours »
  await page.reload();
  await expect(page.getByRole("switch", { name: /Aller validé/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // --- Versement (tiroir) -------------------------------------------------
  await page
    .getByRole("button", { name: /Encaisser le reste|Enregistrer un versement/ })
    .first()
    .click();
  const d = drawer(page);
  await expect(d).toBeVisible();
  await d.getByLabel("Montant reçu").fill("1000");
  await d.getByRole("button", { name: "Encaisser", exact: true }).click();
  await expect(d).toBeHidden();
  await expectNotFrozen(page);
  await page.reload();
  await expect(page.getByText(/1\s?000\s?DA/).first()).toBeVisible();

  // --- Retour validé ------------------------------------------------------
  const retour = page.getByRole("switch", { name: /Retour validé/ });
  await retour.click();
  await expect(retour).toHaveAttribute("aria-checked", "true");
  await expect(retour).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("switch", { name: /Retour validé/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // --- Modification -------------------------------------------------------
  await page.getByRole("link", { name: "Modifier" }).click();
  await expect(page).toHaveURL(/\/modifier$/);
  await page.locator("#q-name").fill("E2E Cycle modifié");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page).toHaveURL(url, { timeout: 30_000 });
  await expect(page.getByText("E2E Cycle modifié").first()).toBeVisible();

  // --- Annulation puis remise en service ----------------------------------
  await page.getByRole("button", { name: "Annuler la commande" }).click();
  const confirm = page.getByRole("alertdialog").or(drawer(page)).first();
  await confirm.getByRole("button", { name: "Annuler la commande" }).click();
  await expect(page.getByRole("button", { name: "Remettre en service" })).toBeVisible();
  await page.getByRole("button", { name: "Remettre en service" }).click();
  await expect(page.getByRole("button", { name: "Annuler la commande" })).toBeVisible();
  await expectNotFrozen(page);
});

test("listes : commandes, demain, pas rentrés, impayés, calendrier", async ({ page }) => {
  await createOrder(page, "E2E Listes", 9);
  await page.goto("/fr/commandes");
  await expect(page.getByText("E2E Listes").first()).toBeVisible();
  for (const path of [
    "/fr/commandes/demain",
    "/fr/commandes/pas-rentres",
    "/fr/commandes/impayes",
    "/fr/commandes/calendrier",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }
});
