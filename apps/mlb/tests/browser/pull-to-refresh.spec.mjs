import { openFromHomeScreen, pullDown } from "../../../../tests/browser/touch.mjs";
import { test, expect, openApp } from "./harness.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("pulling the page down on the Home Screen reads what it missed, without reloading", async ({
  page,
}) => {
  await openFromHomeScreen(page);
  const app = await openApp(page);
  await app.updateFromWorker();
  await expect.poll(() => app.countOpenSockets()).toBeGreaterThan(0);
  await app.lockBracketWhileAway();
  await page.evaluate(() => Object.assign(window, { isSameLoad: true }));

  await pullDown(page, 200);

  await expect(page.locator("#updates")).toContainText("The official bracket is set");
  expect(await page.evaluate(() => "isSameLoad" in window)).toBe(true);
});
