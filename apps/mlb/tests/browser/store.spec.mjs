import {
  test,
  expect,
  EVENING_FIXTURE,
  ON_A_PHONE,
  openApp,
  openSettings,
  readKept,
} from "./harness.mjs";

const listShownRanking = (page) =>
  page
    .locator("#rankList .rank-item")
    .evaluateAll((items) => items.map((item) => /** @type {HTMLElement} */ (item).dataset.id));

const LOCKED_AT = new Date(Date.parse(EVENING_FIXTURE.now) - 60 * 60 * 1000).toISOString();
const SEASON_WITH_AN_UPDATE = {
  year: 2026,
  teams: {},
  series: {},
  log: [{ kind: "lock", at: LOCKED_AT }],
};

test("loading the page reads each saved document once", async ({ page }) => {
  const app = await openApp(page);
  await expect(page.locator("#bracketWrap .matchup-row")).toHaveCount(22);
  await expect.poll(() => app.countOpenSockets()).toBe(1);
  await page.waitForLoadState("networkidle");

  expect(app.listStoreReads().sort()).toEqual([
    "/store/live/2026",
    "/store/live/current",
    "/store/live/status",
    "/store/readings-2026?limit=100",
    "/store/seasons/2026",
    "/store/seasons?limit=50",
    "/store/standings/2026",
  ]);
});

test("a store answer the page can't read stops reading instead of showing an empty season", async ({
  page,
}) => {
  await openApp(page, { portalReadsDocuments: true });
  await expect(page.locator("#stamp")).toContainText("Couldn't load the season.");
});

test.describe("on a phone", () => {
  test.use(ON_A_PHONE);

  test("each device keeps its own ranking and Updates dismissal, and the store keeps neither", async ({
    page,
  }) => {
    const storeWrites = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/store/"))
        storeWrites.push(request.url());
    });
    const app = await openApp(page, { store: { "seasons/2026": SEASON_WITH_AN_UPDATE } });
    await page.getByRole("button", { name: "Dismiss updates" }).click();
    await expect(page.locator("#updates")).toBeHidden();
    await openSettings(page);
    await expect(page.locator("#rankList .rank-item")).toHaveCount(12);
    const byName = await listShownRanking(page);
    await page.locator("#rankList .rank-item").first().locator(".grip").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#rankList .rank-item").nth(1)).toHaveAttribute("data-id", byName[0]);

    expect(Object.keys(await app.readDocument("seasons/2026")).sort()).toEqual([
      "log",
      "series",
      "teams",
      "year",
    ]);
    expect(storeWrites).toEqual([]);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator("#updates")).toContainText("The official bracket is set");
    await openSettings(page);
    await expect.poll(() => listShownRanking(page)).toEqual(byName);
    expect(await readKept(page, "rankings")).toBeNull();
  });

  test("a change the Worker saves shows up without a reload", async ({ page }) => {
    const app = await openApp(page);
    await app.updateFromWorker();
    await expect.poll(() => app.countOpenSockets()).toBeGreaterThan(0);

    await app.lockBracket();

    await expect(page.locator("#updates")).toContainText("The official bracket is set");
  });

  test("a page that loses its connection catches up when it reconnects", async ({ page }) => {
    const app = await openApp(page);
    await app.updateFromWorker();
    await expect.poll(() => app.countOpenSockets()).toBe(1);

    await app.dropConnections();
    await app.lockBracket();
    await page.clock.runFor(2000);
    await expect(page.locator("#updates")).toContainText("The official bracket is set");
    await expect.poll(() => app.countOpenSockets()).toBe(1);
  });
});
