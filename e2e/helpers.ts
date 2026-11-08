import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Cases de la tenue : 0 veste, 1 gilet, 2 pantalon (taille puis pièce). */
export const VESTE = 0;
export const PANTALON = 2;

/** Le tiroir (vaul) ouvert. */
export const drawer = (page: Page) => page.locator('[role="dialog"][data-state="open"]');

export async function openOrderForm(page: Page) {
  await page.goto("/fr/commandes/nouvelle");
  await expect(page.locator("#q-name")).toBeVisible();
}

/** Un jour du mois prochain : toujours dans le futur, quelle que soit la date. */
export async function pickEventDate(page: Page, day = 15) {
  await page.locator("#q-date").click();
  const popover = page.locator("[data-slot=popover-content]");
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "Aller au mois suivant" }).click();
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  const month = next.toLocaleString("fr-FR", { month: "long" });
  // « lundi 15 décembre 2026 »
  await popover
    .getByRole("button", { name: new RegExp(`\\s${day} ${month} ${next.getFullYear()}`) })
    .click();
  await expect(popover).toBeHidden();
  await waitAvailability(page);
}

/**
 * La disponibilité des pièces sur ces dates est arrivée (le sablier de la
 * section « Tenue » a disparu) : avant, rien n'est encore grisé.
 */
export async function waitAvailability(page: Page) {
  await expect(page.locator("#q-outfit [data-slot=spinner]")).toHaveCount(0, {
    timeout: 20_000,
  });
}

export async function fillCustomer(page: Page, name: string, phone = "0555123456") {
  await page.locator("#q-name").fill(name);
  await page.locator("#q-phone").fill(phone);
}

/**
 * Une taille qui EXISTE en stock pour cette case : lue sur la première pièce
 * libre de sa liste (sans taille choisie, la liste montre tout le stock).
 */
export async function stockSize(page: Page, slot: number) {
  await page.locator(`#q-slot-${slot}`).click();
  const d = drawer(page);
  const row = d.locator('li[role="option"]:not([aria-disabled])').first();
  await expect(row).toBeVisible();
  // La ligne secondaire seule : « Taille 50 · … » (le prix suit, collé, sinon).
  const secondary = await row.locator("span.text-muted-foreground.block").textContent();
  const size = secondary!.match(/Taille ([^\s·]+)/)?.[1];
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  expect(size, "taille de la première pièce").toBeTruthy();
  return size!;
}

/** Choisit une taille de stock pour la case, dans la grille du tiroir. */
export async function pickStockSize(page: Page, slot: number) {
  const size = await stockSize(page, slot);
  await page.locator(`#q-size-${slot}`).click();
  await drawer(page).getByRole("radio", { name: size, exact: true }).click();
  await expect(page.locator(`#q-size-${slot}`)).toContainText(size);
  return size;
}

/** La première pièce libre de la liste ; rend son libellé. */
export async function pickFirstUnit(page: Page, slot: number) {
  await page.locator(`#q-slot-${slot}`).click();
  const d = drawer(page);
  await expect(d).toBeVisible();
  const row = d.locator('li[role="option"]:not([aria-disabled]) button').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(d).toBeHidden();
  return (await page.locator(`#q-slot-${slot}`).textContent())!.trim();
}

/**
 * Une commande complète (veste + pantalon du stock) par l'écran de saisie ;
 * ouvre sa fiche et rend son URL.
 */
export async function createOrder(page: Page, name: string, day: number) {
  await openOrderForm(page);
  await fillCustomer(page, name);
  await pickEventDate(page, day);
  await pickStockSize(page, VESTE);
  await pickFirstUnit(page, VESTE);
  await pickStockSize(page, PANTALON);
  await pickFirstUnit(page, PANTALON);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // Larges : en dev, la 1re soumission et la 1re fiche se compilent.
  await expect(page).toHaveURL(/\/fr\/commandes(\?.*)?$/, { timeout: 60_000 });
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await expect(page).toHaveURL(/\/fr\/commandes\/\d+$/, { timeout: 60_000 });
  return page.url();
}
