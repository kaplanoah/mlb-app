import { test, expect, openApp } from "./harness.mjs";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  contextOptions: { reducedMotion: "reduce" },
});

const RECORD_MS = 5000;

/** @param {import("@playwright/test").Page} page */
const openSettings = (page) => page.getByRole("button", { name: "Settings", exact: true }).click();

/** @param {import("@playwright/test").Page} page */
const findSwitch = (page) => page.getByRole("switch", { name: "Diagnostics" });

/** @param {import("@playwright/test").Page} page */
const findRecords = (page) => page.locator("#diagnostics");

/** @param {import("@playwright/test").Page} page */
async function turnOnDiagnostics(page) {
  await openSettings(page);
  await findSwitch(page).click();
  await expect(findSwitch(page)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsDialog")).toBeHidden();
}

/** @param {import("@playwright/test").Page} page */
async function reloadAndRecord(page) {
  await page.reload();
  await expect(page.locator('[data-series="1-0"] .team-line.won')).toContainText("Liberty");
  await page.clock.runFor(RECORD_MS + 1000);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {boolean} isHidden
 */
const setHidden = (page, isHidden) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }, isHidden);

test("Diagnostics sit past the end of settings, off, with nothing recorded", async ({ page }) => {
  await openApp(page);

  await openSettings(page);

  await expect(page.locator("#settingsDialog")).toContainText("Noah Kaplan");
  await expect(findSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(findSwitch(page)).not.toBeInViewport();
  await expect(findRecords(page)).toBeHidden();
});

test("with Diagnostics on, a reload is recorded with its tab, what the store sent, and what each part showed", async ({
  page,
}) => {
  await openApp(page);
  await turnOnDiagnostics(page);

  await reloadAndRecord(page);
  await openSettings(page);

  const record = findRecords(page).locator(".diagnostics-record").first();
  await expect(record.locator("summary")).toContainText("Bracket");
  await expect(record.locator("summary")).toContainText("Steady");
  await expect(record).toContainText("Store sent seasons/2026");
  await expect(record).toContainText(/Shows .*bracketWrap \d+\/\d+px/);
});

test("a reload's first reading is what the page put back from its last showing, before its code redraws it", async ({
  page,
}) => {
  await openApp(page);
  await turnOnDiagnostics(page);

  await reloadAndRecord(page);
  await openSettings(page);

  const record = findRecords(page).locator(".diagnostics-record").first();
  await expect(record).toContainText(/Shows .*gamePager \d+\/\d+px/);
  await expect(record).not.toContainText("gamePager: text");
  await expect(record).not.toContainText("standingsPager: text");
});

test("a reload is recorded with its first paint and when each font file arrived", async ({
  page,
}) => {
  await openApp(page);
  await turnOnDiagnostics(page);

  await reloadAndRecord(page);
  await openSettings(page);

  const record = findRecords(page).locator(".diagnostics-record").first();
  await expect(record).toContainText(/First (contentful )?paint/);
  await expect(record).toContainText("Font barlow-condensed-600.woff2 arrived");
});

test("a part that empties and fills again while recording is flagged as a dip", async ({
  page,
}) => {
  await openApp(page);
  await turnOnDiagnostics(page);
  await page.reload();
  await expect(page.locator('[data-series="1-0"] .team-line.won')).toContainText("Liberty");
  const markup = await page.locator("#bracketWrap").evaluate((wrap) => {
    const shown = wrap.innerHTML;
    wrap.replaceChildren();
    return shown;
  });
  await page.clock.runFor(300);

  await page.locator("#bracketWrap").evaluate((wrap, shown) => {
    wrap.innerHTML = shown;
  }, markup);
  await page.clock.runFor(RECORD_MS);
  await openSettings(page);

  const record = findRecords(page).locator(".diagnostics-record").first();
  await expect(record.locator("summary")).toContainText("Dip");
  await expect(record.locator(".diagnostics-dip")).toContainText(/bracketWrap: text \d+ to 0/);
});

test("a return to the page is recorded with how long it was away", async ({ page }) => {
  await openApp(page);
  await turnOnDiagnostics(page);
  await setHidden(page, true);
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + 5 * 60 * 1000);

  await setHidden(page, false);
  await page.clock.runFor(RECORD_MS + 1000);
  await openSettings(page);

  await expect(findRecords(page).locator("summary").first()).toContainText("Back after 5 min");
});

/** @param {import("@playwright/test").Page} page */
const findViewportLog = (page) =>
  findRecords(page).locator(".diagnostics-record", { hasText: "Viewport" });

test("with Diagnostics on, the viewport is logged as the page opens, and again when it changes", async ({
  page,
}) => {
  await openApp(page);
  await turnOnDiagnostics(page);
  await reloadAndRecord(page);

  await page.setViewportSize({ width: 390, height: 700 });
  await page.clock.runFor(100);
  await openSettings(page);

  const lines = findViewportLog(page).locator("li");
  await expect(findViewportLog(page).locator("summary")).toContainText("Steady");
  await expect(lines.first()).toContainText(/layout 700, .*sheet ends 700/);
  const resized = lines.filter({ hasText: "layout 700", hasNotText: "sheet ends" });
  await expect(resized).toContainText(/tab bar ends \d+/);
  await expect(lines.filter({ hasText: "layout 844, visual 844 from 0" })).not.toHaveCount(0);
});

for (const [moved, moveViewport] of [
  ["as the page scrolls", () => scrollTo(0, 1)],
  ["as the visual viewport moves", () => visualViewport?.dispatchEvent(new Event("scroll"))],
]) {
  test(`a visual viewport out of line with the layout one is flagged as off ${moved}`, async ({
    page,
  }) => {
    await openApp(page);
    await turnOnDiagnostics(page);
    await reloadAndRecord(page);

    await page.evaluate(() =>
      Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => 110 }),
    );
    await page.evaluate(moveViewport);
    await page.clock.runFor(100);
    await openSettings(page);

    const log = findViewportLog(page);
    await expect(log.locator("summary")).toContainText("Off");
    const offBeforeSettings = log.locator(".diagnostics-dip", { hasNotText: "sheet ends" });
    await expect(offBeforeSettings).toContainText("visual 844 from 110");
  });
}

test("turning Diagnostics off forgets what it recorded", async ({ page }) => {
  await openApp(page);
  await turnOnDiagnostics(page);
  await reloadAndRecord(page);
  await openSettings(page);
  await expect(findRecords(page).locator(".diagnostics-record")).toHaveCount(2);
  await expect(findViewportLog(page)).toHaveCount(1);

  await findSwitch(page).click();
  await expect(findRecords(page)).toBeHidden();
  await findSwitch(page).click();

  await expect(findRecords(page)).toContainText("Nothing yet");
  await expect(findRecords(page).locator(".diagnostics-record")).toHaveCount(0);
});

test("Copy puts the recorded opens on the clipboard as text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);
  await turnOnDiagnostics(page);
  await reloadAndRecord(page);
  await openSettings(page);

  await page.getByRole("button", { name: "Copy" }).click();

  await expect(page.locator("#diagnosticsCopy")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Today \d+:\d\d\s[AP]M, \w+, Bracket$/m);
  expect(copied).toMatch(/^\+\d+ Shows /m);
  expect(copied).toMatch(/^Viewport\n\d+:\d\d:\d\d\s[AP]M screen \d+, layout 844, /m);
});
