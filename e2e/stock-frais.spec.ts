import type { Page } from "@playwright/test";
import { as, expect, expectNotFrozen, test } from "./fixtures";
import { drawer } from "./helpers";

test.describe("stock — propriétaire", () => {
  as("owner");

  test("crée un modèle", async ({ page }) => {
    await page.goto("/fr/stock/nouveau");
    await page.locator("#ref_code").fill(`E2E-${Date.now() % 100000}`);
    await page.locator("#name_fr").fill("Veste E2E");
    await page.locator("#category_id").click();
    await page.getByRole("option").first().click();
    await page.locator("#base_price").fill("2500");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/fr\/stock(\/\d+)?$/, { timeout: 30_000 });
    await page.goto("/fr/stock");
    await expect(page.getByText("Veste E2E").first()).toBeVisible();
    await expectNotFrozen(page);
  });
});

async function addFrais(page: Page, amount: string, detail: string) {
  await page.goto("/fr/frais");
  await page.getByRole("button", { name: "Ajouter le frais" }).first().click();
  const d = drawer(page);
  await expect(d).toBeVisible();
  await d.locator("#f-amount").fill(amount);
  await d.getByRole("radio").first().click();
  await d.locator("#f-detail").fill(detail);
  await d.getByRole("button", { name: "Ajouter le frais" }).click();
  await expect(d).toBeHidden();
  await expectNotFrozen(page);
  await page.reload();
  await expect(page.getByText(detail).first()).toBeVisible();
}

test.describe("frais — chacun les siens", () => {
  test.describe("propriétaire", () => {
    as("owner");
    test("ajoute un frais", async ({ page }) => {
      await addFrais(page, "700", "E2E frais patron");
    });
  });

  test.describe("employé", () => {
    as("staff");
    test("ajoute le sien et ne voit pas celui du patron", async ({ page }) => {
      await addFrais(page, "450", "E2E frais employé");
      await expect(page.getByText("E2E frais patron")).toHaveCount(0);
    });
  });
});
