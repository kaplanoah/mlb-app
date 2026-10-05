import { test, expect, openApp } from "./harness.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** @param {string | null | undefined} time */
const moveBackAYear = (time) => time && new Date(Date.parse(time) - YEAR_MS).toISOString();

/**
 * The afternoon's season as last year's record, its finals a year earlier and nothing still to
 * play.
 * @param {any} season
 */
const keepAsLastSeason = (season) => ({
  ...season,
  season: 2025,
  games: season.games
    .filter((game) => game.state === "final")
    .map((game) => ({ ...game, start: moveBackAYear(game.start), end: moveBackAYear(game.end) })),
});

const ONE_PAST_SEASON = { pastSeasons: { 2025: keepAsLastSeason } };

/** @param {import("@playwright/test").Page} page */
const openSettings = (page) => page.getByRole("button", { name: "Settings", exact: true }).click();

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} year
 */
async function chooseSeason(page, year) {
  await openSettings(page);
  await page.getByRole("combobox", { name: "Season" }).selectOption(String(year));
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsDialog")).toBeHidden();
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} list
 */
const expectGameList = (page, list) =>
  expect(page.getByRole("tab", { name: list })).toHaveAttribute("aria-selected", "true");

test("with only the current season kept, settings show no Season picker", async ({ page }) => {
  await openApp(page);
  await openSettings(page);

  await expect(page.locator("#settingsDialog")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Season" })).toHaveCount(0);
});

test("settings list each season the store keeps, newest first, on the current one", async ({
  page,
}) => {
  await openApp(page, ONE_PAST_SEASON);
  await openSettings(page);

  const picker = page.getByRole("combobox", { name: "Season" });
  await expect(picker.locator("option")).toHaveText(["2026", "2025"]);
  await expect(picker).toHaveValue("2026");
});

test("a past season's Games tab starts on its results, and the current season's on today", async ({
  page,
}) => {
  await openApp(page, ONE_PAST_SEASON);
  await page.getByRole("tab", { name: "Games" }).click();
  await expectGameList(page, "Today");

  await chooseSeason(page, 2025);

  await expectGameList(page, "Previous");
  await expect(page.locator("#games-previous")).toContainText("Final");
  await expect(page.locator("#games-today")).toHaveText("No games today");
  await expect(page.locator("#games-next")).toHaveText("No more games scheduled");

  await page.getByRole("tab", { name: "Next" }).click();
  await expectGameList(page, "Next");
  await page.getByRole("tab", { name: "Games" }).click();
  await expectGameList(page, "Previous");

  await chooseSeason(page, 2026);
  await expectGameList(page, "Today");
  await expect(page.locator("#games-today")).toContainText("Dream");
});

test("a past season's header names its last game, and leaves out the current season's problems", async ({
  page,
}) => {
  const app = await openApp(page, ONE_PAST_SEASON);
  await app.writeDocument("live/status", { error: "upstream_error" });
  const stamp = page.locator("#stamp");
  await expect(stamp).toContainText("The WNBA isn't answering right now.");

  await chooseSeason(page, 2025);

  await expect(stamp).toContainText("Last game");
  await expect(stamp).not.toContainText("The WNBA isn't answering");
  await expect(stamp).not.toContainText("Next tip-off");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a past season shows no Updates box, and the current one shows it again", async ({
    page,
  }) => {
    await openApp(page, { ...ONE_PAST_SEASON, isShowingUpdates: true });
    const updates = page.locator("#updates");
    await expect(updates).toBeVisible();

    await chooseSeason(page, 2025);
    await expect(updates).toBeHidden();

    await chooseSeason(page, 2026);
    await expect(updates).toBeVisible();
  });
});
