import { test, expect, openApp } from "./harness.mjs";
import {
  countFramesAcross,
  expectAtRest,
  forgetResizeLoops,
  listResizeLoops,
  swipeToNextList,
  waitForLoadToSettle,
} from "../../../../tests/browser/at-rest.mjs";

// In full motion, every slide ends, and then nothing moves or asks for a frame. Each test counts
// ResizeObserver loops from its first gesture, since what the page does as it loads isn't theirs.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (let attempt = 1; attempt <= 15; attempt++) {
  test(`a tab tap, a tap on a day, and a tap on Today each leave the page at rest, with no ResizeObserver loop ${attempt}`, async ({
    page,
  }) => {
    const readResizeLoops = await listResizeLoops(page);
    await openApp(page, { isWholeSeason: true });
    await waitForLoadToSettle(page);
    await expectAtRest(page);
    await forgetResizeLoops(page);

    await page.getByRole("tab", { name: "Games" }).click();
    await expect(page.locator("#seasonGames .game-day.is-today")).toBeInViewport();
    await expectAtRest(page);

    await page.locator('#seasonGames .day-cell[data-day="2026-09-27"]').click();
    await expect(page.locator('#seasonGames .day-cell[data-day="2026-09-27"]')).toHaveClass(
      /is-chosen/,
    );
    await page.clock.runFor(2000);
    await expect(page.locator('#seasonGames .listed-day[data-day="2026-09-27"]')).toBeInViewport();
    await expectAtRest(page);

    await page.locator("#seasonGames .go-today").click();
    await page.clock.runFor(2000);
    await expect(page.locator("#seasonGames .game-day.is-today")).toBeInViewport();
    await expectAtRest(page);

    expect(await readResizeLoops()).toEqual([]);
  });
}

test("a pill tap and a swipe between the standings' lists each leave the page at rest", async ({
  page,
  browserName,
}) => {
  const readResizeLoops = await listResizeLoops(page);
  await openApp(page);
  await waitForLoadToSettle(page);
  await page.getByRole("tab", { name: "Standings" }).click();
  await expect(page.locator("#standings-league")).toBeInViewport();
  await expectAtRest(page);
  await forgetResizeLoops(page);

  await page.getByRole("tab", { name: "East" }).click();
  await expect(page.locator("#standings-east")).toBeInViewport();
  await expect(page.locator("#standings-pages")).toHaveAttribute("data-settled-by", "scrollend");
  await expectAtRest(page);

  await swipeToNextList(page, browserName, { x: 340, y: 500 });
  await expect(page.getByRole("tab", { name: "West" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#standings-west")).toBeInViewport();
  await expectAtRest(page);

  expect(await readResizeLoops()).toEqual([]);
});

test("the page's redraw each minute, which keeps its times current, asks for no frame", async ({
  page,
}) => {
  await openApp(page);
  await waitForLoadToSettle(page);

  expect(await countFramesAcross(page, 60_000)).toBe(0);
});

test("a shown list that grows loops no ResizeObserver", async ({ page }) => {
  const readResizeLoops = await listResizeLoops(page);
  await openApp(page);
  await waitForLoadToSettle(page);
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.locator("#seasonGames .game-day.is-today")).toBeInViewport();
  await expectAtRest(page);
  await forgetResizeLoops(page);

  await page
    .locator("#seasonGames .listed-day")
    .first()
    .evaluate((day) => {
      const filler = document.createElement("div");
      filler.style.height = "3000px";
      day.append(filler);
    });
  await page.clock.runFor(500);

  await expect
    .poll(() => page.locator("#seasonGames .day-list").evaluate((list) => list.scrollHeight))
    .toBeGreaterThan(3000);
  expect(await readResizeLoops()).toEqual([]);
});
