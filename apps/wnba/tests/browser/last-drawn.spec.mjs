import { test, expect, openApp, matchPath } from "./harness.mjs";
import { holdRequests } from "../../../../tests/browser/hold-requests.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const holdPageCode = (page) => holdRequests(page, matchPath("/js/app.js"));

/** @param {import("@playwright/test").Page} page */
const findFinalWinner = (page) => page.locator('[data-series="1-0"] .team-line.won');

/**
 * @param {import("@playwright/test").Page} page
 * @param {Record<string, string>} items what the page's storage holds before it loads
 */
const storeBeforeLoad = (page, items) =>
  page.addInitScript((stored) => {
    for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
  }, items);

test("a reload shows what the page last drew before its code arrives", async ({ page }) => {
  await openApp(page);
  await expect(findFinalWinner(page)).toContainText("Liberty");
  const stamp = await page.locator("#stamp").textContent();
  const release = await holdPageCode(page);

  await page.reload({ waitUntil: "commit" });

  await expect(findFinalWinner(page)).toContainText("Liberty");
  await expect(page.locator("#stamp")).toBeVisible();
  await expect(page.locator("#stamp")).toHaveText(stamp);
  await page.clock.runFor(4000);
  await expect(page.locator("#loadNote")).toHaveCount(0);
  release();
});

test("a saved part the page doesn't draw whole keeps the markup the page has", async ({ page }) => {
  await storeBeforeLoad(page, {
    lastDrawn: JSON.stringify({ "view-bracket": { markup: "<p>Old</p>", hidden: false } }),
  });

  await openApp(page);

  await expect(findFinalWinner(page)).toContainText("Liberty");
  await expect(page.locator("#view-bracket")).not.toContainText("Old");
});

test("saved markup that can't be read leaves the page to open as it would", async ({ page }) => {
  await storeBeforeLoad(page, { lastDrawn: "{not json", lastTab: "games" });

  await openApp(page);

  await expect(page.locator("#view-games")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a reload on the Games view shows the day it was on before the page's code arrives, and today after two minutes off the screen", async ({
    page,
  }) => {
    await storeBeforeLoad(page, { lastTab: "games" });
    await openApp(page, { isWholeSeason: true });
    const list = page.locator("#seasonGames .day-list");
    const today = page.locator("#seasonGames .game-day.is-today");
    const earlier = page.locator('#seasonGames .listed-day[data-day="2026-09-20"]');
    await expect(today).toBeInViewport();
    await page.locator('#seasonGames .day-cell[data-day="2026-09-20"]').click();
    await expect(earlier).toBeInViewport();
    const top = await list.evaluate((element) => element.scrollTop);
    let release = await holdPageCode(page);

    await page.reload({ waitUntil: "commit" });

    await expect(earlier).toBeInViewport();
    expect(await list.evaluate((element) => element.scrollTop)).toBe(top);
    await expect(page.locator("#seasonGames .day-cell.is-chosen")).toHaveAttribute(
      "data-day",
      "2026-09-20",
    );
    release();
    // The stamp shows before the page's code runs, put back from the copy, so the code's own first
    // drawing says it's there to note when the page leaves the screen.
    await expect(page.locator("#loadNote")).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.runFor(2 * 60_000);
    release = await holdPageCode(page);

    await page.reload({ waitUntil: "commit" });

    await expect(today).toBeInViewport();
    await expect(earlier).not.toBeInViewport();
    release();
  });

  test("the standings sit as far under their pill before the page's code arrives as after", async ({
    page,
  }) => {
    await storeBeforeLoad(page, { lastTab: "standings" });
    await openApp(page);
    const readGap = async () => {
      const pill = await page.locator("#standingsPager [role=tablist]").boundingBox();
      const table = await page.locator("#standingsPager table").first().boundingBox();
      return table.y - (pill.y + pill.height);
    };
    await expect(page.locator("#standingsPager table").first()).toBeVisible();
    const placedGap = await readGap();
    const release = await holdPageCode(page);

    await page.reload({ waitUntil: "commit" });

    await expect(page.locator("#standingsPager table").first()).toBeVisible();
    expect(await readGap()).toBeCloseTo(placedGap, 0);
    release();
  });

  test("the tab bar's pill rests on the last tab before the page's code arrives, where the code keeps it", async ({
    page,
  }) => {
    await storeBeforeLoad(page, { lastTab: "games" });
    await openApp(page);
    const pill = page.locator(".tab-pill");
    await expect(page.locator("#view-games")).toBeVisible();
    const placed = await pill.boundingBox();
    const release = await holdPageCode(page);

    await page.reload({ waitUntil: "commit" });

    await expect(page.locator("#view-games")).toBeVisible();
    const resting = await pill.boundingBox();
    expect(resting.x).toBeCloseTo(placed.x, 0);
    expect(resting.width).toBeCloseTo(placed.width, 0);
    release();
  });
});
