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
  stockSize,
} from "./helpers";

/**
 * La saisie d'une commande — l'écran où le client voyait l'application « bloquer »
 * en choisissant une pièce dans un tiroir.
 *
 * Cases de la tenue : 0 veste, 1 gilet, 2 pantalon (taille puis pièce).
 */
as("owner");

test.describe("saisie d'une commande — tiroirs", () => {
  test("taille puis pièce enchaînées vite : la page ne gèle pas", async ({ page }) => {
    await openForm(page);
    await pickEventDate(page);

    // Le geste du client : taille, puis TOUT DE SUITE la pièce, sans attendre
    // la fin de l'animation du tiroir des tailles.
    const size = await stockSize(page, VESTE);
    await page.locator(`#q-size-${VESTE}`).click();
    await drawer(page).getByRole("radio", { name: size, exact: true }).click();
    await page.locator(`#q-slot-${VESTE}`).click();
    const row = drawer(page).locator('li[role="option"]:not([aria-disabled]) button').first();
    await row.click();
    await expect(page.locator(`#q-slot-${VESTE}`)).not.toHaveText("");

    await expectNotFrozen(page);
    // Le formulaire répond encore au toucher.
    await page.locator("#q-name").fill("Client réactif");
    await expect(page.locator("#q-name")).toHaveValue("Client réactif");
  });

  test("ouvrir / fermer les listes en rafale ne laisse pas la page gelée", async ({ page }) => {
    await openForm(page);
    for (let i = 0; i < 5; i++) {
      await page.locator(`#q-size-${i % 2 ? PANTALON : VESTE}`).click();
      await expect(drawer(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator(`#q-slot-${i % 2 ? PANTALON : VESTE}`).click();
      await expect(drawer(page)).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await expectNotFrozen(page);
    await page.locator("#q-phone").fill("0555000000");
    await expect(page.locator("#q-phone")).toHaveValue("0555000000");
  });

  test("« Autre taille » + OK ne soumet PAS la commande", async ({ page }) => {
    await openForm(page);
    // Une commande complète et valide : avant la correction, « OK » dans le
    // tiroir des tailles l'enregistrait et quittait l'écran.
    await fillCustomer(page, "Test autre taille");
    await pickEventDate(page);
    await pickStockSize(page, VESTE);
    await pickFirstUnit(page, VESTE);

    await page.locator(`#q-size-${PANTALON}`).click();
    const d = drawer(page);
    await d.getByLabel("Autre taille").fill("63");
    await d.getByRole("button", { name: "OK", exact: true }).click();

    await expect(d).toBeHidden();
    await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
    await expect(page.locator(`#q-size-${PANTALON}`)).toContainText("63");
    await expectNotFrozen(page);
  });

  test("« Autre taille » + Entrée reste dans le tiroir et choisit la taille", async ({ page }) => {
    await openForm(page);
    await page.locator(`#q-size-${PANTALON}`).click();
    const d = drawer(page);
    await d.getByLabel("Autre taille").fill("61");
    await d.getByLabel("Autre taille").press("Enter");
    await expect(d).toBeHidden();
    await expect(page.locator(`#q-size-${PANTALON}`)).toContainText("61");
    await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
    await expectNotFrozen(page);
  });

  test("recherche dans la liste des pièces", async ({ page }) => {
    await openForm(page);
    await pickEventDate(page);
    await page.locator(`#q-slot-${VESTE}`).click();
    const d = drawer(page);
    const first = d.locator('li[role="option"] button').first();
    await expect(first).toBeVisible();
    const label = (await first.locator("span.block.text-base").textContent())!.trim();
    await d.getByRole("searchbox").fill(label.slice(0, 4));
    await expect(d.locator('li[role="option"]').first()).toBeVisible();
    await d.getByRole("searchbox").fill("zzzz-introuvable");
    await expect(d.locator('li[role="option"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expectNotFrozen(page);
  });
});

test.describe("saisie d'une commande — enregistrement", () => {
  test("veste et pantalon de tailles différentes, puis double réservation refusée", async ({ page }) => {
    await openForm(page);
    await fillCustomer(page, "E2E Mariage");
    await pickEventDate(page, 20);

    await pickStockSize(page, VESTE);
    await pickFirstUnit(page, VESTE);
    // « Pièce du stock Gio-079-01 · Taille 50 » : la référence exacte prise.
    const status = await page.getByText(/Pièce du stock/).first().textContent();
    const vesteRef = status!.replace("Pièce du stock", "").split("·")[0].trim();
    await pickStockSize(page, PANTALON);
    await pickFirstUnit(page, PANTALON);

    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/commandes(\?.*)?$/, { timeout: 30_000 });
    await expect(page.getByText("E2E Mariage").first()).toBeVisible();

    // La même veste, même date : la base doit la refuser (EXCLUDE).
    await openForm(page);
    await fillCustomer(page, "E2E Doublon");
    await pickEventDate(page, 20);
    await page.locator(`#q-slot-${VESTE}`).click();
    // La recherche trouve la pièce par sa référence : elle est grisée, prise.
    await drawer(page).getByRole("searchbox").fill(vesteRef);
    const taken = drawer(page).locator('li[role="option"]').first();
    await expect(taken).toHaveAttribute("aria-disabled", "true");
    await expect(taken).toContainText(/Prise sur ces dates|Libre le/);
    await page.keyboard.press("Escape");
    await expectNotFrozen(page);
  });

  test("formulaire vide : les erreurs s'affichent, rien n'est envoyé", async ({ page }) => {
    await openForm(page);
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/commandes\/nouvelle$/);
    await expect(page.locator('[role="alert"], [data-slot=field-error]').first()).toBeVisible();
    await expectNotFrozen(page);
  });
});
