import { as, expect, expectNotFrozen, test } from "./fixtures";
import {
  PANTALON,
  VESTE,
  drawer,
  fillCustomer,
  openOrderForm as openForm,
  pickEventDate,
  pickFirstUnit,
  pickStockSize,
} from "./helpers";

/**
 * Commandes EN ATTENTE : plusieurs clients servis en même temps sur un seul
 * téléphone. Le client A est mis de côté, B est enregistré, puis A reprend.
 * Rien ne part en base avant « Enregistrer ».
 */
as("owner");

const DAY = 24;

test("mettre un client en attente, servir le suivant, reprendre le premier", async ({ page }) => {
  // --- Client A : une veste, puis « En attente ».
  await openForm(page);
  await fillCustomer(page, "E2E Attente A");
  await pickEventDate(page, DAY);
  await pickStockSize(page, VESTE);
  await pickFirstUnit(page, VESTE);
  const status = await page.getByText(/Pièce du stock/).first().textContent();
  const vesteRef = status!.replace("Pièce du stock", "").split("·")[0].trim();

  await page.getByRole("button", { name: /Mettre E2E Attente A en attente/ }).click();
  await expect(page.locator("#q-name")).toHaveValue("");
  const chipA = page.getByRole("button", { name: "Reprendre E2E Attente A" });
  await expect(chipA).toBeVisible();

  // Survit au rechargement : la saisie vit dans le téléphone.
  await page.reload();
  await expect(chipA).toBeVisible();

  // --- Client B, même date : la veste de A est grisée, tenue par A.
  await fillCustomer(page, "E2E Attente B");
  await pickEventDate(page, DAY);
  await page.locator(`#q-slot-${VESTE}`).click();
  await drawer(page).getByRole("searchbox").fill(vesteRef);
  const held = drawer(page).locator('li[role="option"]').first();
  await expect(held).toHaveAttribute("aria-disabled", "true");
  await expect(held).toContainText("en attente — E2E Attente A");
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();

  await pickStockSize(page, VESTE);
  await pickFirstUnit(page, VESTE);
  await pickStockSize(page, PANTALON);
  await pickFirstUnit(page, PANTALON);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  // --- Un seul client attendait : la saisie le reprend aussitôt, sans
  // passer par la liste des commandes.
  await expect(page.locator("#q-name")).toHaveValue("E2E Attente A", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
  await expect(page.getByText(new RegExp(`Pièce du stock ${vesteRef}`))).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reprendre / })).toHaveCount(0);

  await pickStockSize(page, PANTALON);
  await pickFirstUnit(page, PANTALON);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // Plus personne n'attend : retour à la liste, comme avant.
  await expect(page).toHaveURL(/\/fr\/commandes(\?.*)?$/, { timeout: 60_000 });
  await expectNotFrozen(page);
});

test("plusieurs clients en attente : « Enregistrer » ouvre la page En attente", async ({ page }) => {
  await openForm(page);
  for (const name of ["E2E Attente D", "E2E Attente E"]) {
    await fillCustomer(page, name);
    await page.getByRole("button", { name: new RegExp(`Mettre ${name} en attente`) }).click();
    await expect(page.locator("#q-name")).toHaveValue("");
  }

  await fillCustomer(page, "E2E Attente F");
  await pickEventDate(page, DAY + 1);
  await pickStockSize(page, VESTE);
  await pickFirstUnit(page, VESTE);
  await pickStockSize(page, PANTALON);
  await pickFirstUnit(page, PANTALON);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  await expect(page).toHaveURL(/\/fr\/commandes\/en-attente$/, { timeout: 60_000 });
  await expect(page.getByRole("link", { name: /^Reprendre la commande de / })).toHaveCount(2);
  // L'onglet de la barre basse compte les clients qui attendent.
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toContainText("En attente (2)");

  await page.getByRole("link", { name: "Reprendre la commande de E2E Attente D" }).click();
  await expect(page.locator("#q-name")).toHaveValue("E2E Attente D", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
  await expect(page.getByRole("button", { name: "Reprendre E2E Attente E" })).toBeVisible();
  await expectNotFrozen(page);
});

test("retirer un client de l'attente", async ({ page }) => {
  await openForm(page);
  await fillCustomer(page, "E2E Attente C");
  await page.getByRole("button", { name: /Mettre E2E Attente C en attente/ }).click();
  await expect(page.getByRole("button", { name: "Reprendre E2E Attente C" })).toBeVisible();

  await page.getByRole("button", { name: "Retirer E2E Attente C de l'attente" }).click();
  await drawer(page).getByRole("button", { name: "Retirer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reprendre E2E Attente C" })).toHaveCount(0);
});

test("sans nom, rien n'est mis en attente", async ({ page }) => {
  await openForm(page);
  await page.locator("#q-phone").fill("0555000111");
  await page.getByRole("button", { name: "En attente" }).click();
  await expect(page.locator("#q-name")).toBeFocused();
  await expect(page.getByRole("button", { name: /^Reprendre / })).toHaveCount(0);
});
