import type { Page } from "@playwright/test";
import { as, expect, test } from "./fixtures";

/**
 * MESURE, pas un test : les chiffres de vitesse de la liste des commandes
 * sur un téléphone lent (processeur ralenti ×4). Ne s'exécute qu'à la
 * demande, et n'échoue jamais sur un chiffre :
 *
 *   E2E_PERF=1 E2E_NO_RESET=1 npx playwright test e2e/perf.spec.ts
 *
 * En `next dev` (voir playwright.config) : les valeurs absolues sont plus
 * lentes qu'en production ; on compare AVANT / APRÈS une modification.
 *
 * - html : poids de la page envoyée par le serveur ;
 * - dom / cells : nœuds et cellules du tableau, ce que le téléphone doit
 *   construire puis « hydrater » ;
 * - fcp / lcp / cls : Web Vitals du chargement ;
 * - tap : durée du toucher sur ✓ « Allez » (ce que mesure l'INP), au
 *   chargement puis après avoir fait défiler la liste.
 */
test.skip(!process.env.E2E_PERF, "mesure à la demande : E2E_PERF=1");
as("owner");

const RUNS = 3;

type Vitals = { fcp: number; lcp: number; cls: number; events: number[] };

declare global {
  interface Window {
    __perf: Vitals;
  }
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

function observeVitals() {
  window.__perf = { fcp: 0, lcp: 0, cls: 0, events: [] };
  const observe = (type: string, fn: (e: PerformanceEntry) => void, extra = {}) =>
    new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({
      type,
      buffered: true,
      ...extra,
    } as PerformanceObserverInit);
  observe("paint", (e) => {
    if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime;
  });
  observe("largest-contentful-paint", (e) => (window.__perf.lcp = e.startTime));
  observe("layout-shift", (e) => {
    const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!shift.hadRecentInput) window.__perf.cls += shift.value;
  });
  observe(
    "event",
    (e) => {
      if (["pointerdown", "pointerup", "click"].includes(e.name)) {
        window.__perf.events.push(e.duration);
      }
    },
    { durationThreshold: 16 },
  );
}

/** Bascule ✓ « Allez » de la première ligne, puis la remet : la base ne change pas. */
async function tapSwitch(page: Page): Promise<number> {
  const toggle = page.getByRole("switch").first();
  await page.evaluate(() => (window.__perf.events = []));
  await toggle.click({ timeout: 60_000 });
  await expect(toggle).toBeEnabled({ timeout: 60_000 });
  // Laisse l'Event Timing publier sa mesure.
  await page.waitForTimeout(500);
  const worst = await page.evaluate(() => Math.max(0, ...window.__perf.events));
  await toggle.click({ timeout: 60_000 });
  await expect(toggle).toBeEnabled({ timeout: 60_000 });
  return worst;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("vitesse de /commandes (téléphone lent)", async ({ page }) => {
  // Trois passages ralentis ×4 en `next dev` : bien plus que les 3 min de la suite.
  test.setTimeout(900_000);
  // Compilation à froid de `next dev` : hors mesure.
  await page.goto("/fr/commandes");
  await page.getByRole("switch").first().waitFor();
  // Et l'action serveur du ✓, et la fiche que le toucher précharge.
  await page.addInitScript(observeVitals);
  await page.reload();
  await page.getByRole("switch").first().waitFor();
  await tapSwitch(page);

  const html = (await (await page.request.get("/fr/commandes")).body()).length;

  const samples: Record<string, number>[] = [];
  await throttle(page);
  for (let run = 0; run < RUNS; run++) {
    await page.goto("/fr/commandes", { waitUntil: "load" });
    await page.getByRole("switch").first().waitFor();
    await page.waitForTimeout(1500);

    const load = await page.evaluate(() => ({
      fcp: window.__perf.fcp,
      lcp: window.__perf.lcp,
      cls: window.__perf.cls,
      dom: document.getElementsByTagName("*").length,
      cells: document.querySelectorAll("tbody td").length,
    }));
    const tap = await tapSwitch(page);

    // Défiler la liste jusqu'à ~120 lignes, comme l'équipe qui cherche une commande.
    for (let i = 0; i < 6; i++) {
      await page.locator("tbody tr").last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
    }
    const rowsAfterScroll = await page.locator("tbody tr").count();
    await page.locator("tbody").evaluate((el) => el.closest("div")!.scrollTo({ top: 0 }));
    const tapAfterScroll = await tapSwitch(page);

    samples.push({ ...load, tap, rowsAfterScroll, tapAfterScroll });
  }

  const result = Object.fromEntries(
    Object.keys(samples[0]).map((k) => [k, Math.round(median(samples.map((s) => s[k])) * 1000) / 1000]),
  );
  console.log("\n[perf /commandes]", JSON.stringify({ html, ...result }, null, 2));
});
