import { test, expect, openApp, ON_A_PHONE } from "./harness.mjs";
import {
  expectAtRest,
  listResizeLoops,
  swipeToNextList,
} from "../../../../tests/browser/at-rest.mjs";

// In full motion, every slide ends, and then nothing moves or asks for a frame. The bracket redraws
// as the body resizes, which loops the observer as the page loads, so only later loops count.

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<() => Promise<string[]>>}
 */
async function openAndListLaterResizeLoops(page) {
  const readResizeLoops = await listResizeLoops(page);
  await openApp(page);
  await page.clock.runFor(500);
  const atLoad = (await readResizeLoops()).length;
  return async () => (await readResizeLoops()).slice(atLoad);
}

test.use(ON_A_PHONE);

test("a tab tap, a pill tap, and a swipe each leave the page at rest, with no ResizeObserver loop", async ({
  page,
  browserName,
}) => {
  const readResizeLoops = await openAndListLaterResizeLoops(page);
  await expectAtRest(page);

  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.locator("#games-today")).toBeInViewport();
  await expectAtRest(page);

  await page.getByRole("tab", { name: "Previous" }).click();
  await expect(page.locator("#games-previous")).toBeInViewport();
  await expect(page.locator("#games-pages")).toHaveAttribute("data-settled-by", "scrollend");
  await expectAtRest(page);

  await swipeToNextList(page, browserName, { x: 340, y: 500 });
  await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#games-today")).toBeInViewport();
  await expectAtRest(page);

  expect(await readResizeLoops()).toEqual([]);
});

test("a shown list that grows loops no ResizeObserver", async ({ page }) => {
  const readResizeLoops = await openAndListLaterResizeLoops(page);
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.locator("#games-today")).toBeInViewport();

  await page.locator("#games-today").evaluate((list) => {
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    list.append(filler);
  });
  await page.clock.runFor(500);

  await expect
    .poll(() =>
      page.locator("#games-pages").evaluate((pages) => pages.getBoundingClientRect().height),
    )
    .toBeGreaterThan(3000);
  expect(await readResizeLoops()).toEqual([]);
});
