import { test, expect, openApp } from "./harness.mjs";
import { listLayoutChanges, readLayout } from "../../../../tests/browser/theme-layout.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

// A week of news with a card of each shape: one with a photo and stories under its lead, and one
// with neither.
/** @param {string} photoUrl */
const createStories = (photoUrl) =>
  [photoUrl, null].map((url, index) => ({
    id: `story-${index}`,
    url: `https://example.com/story-${index}`,
    title: "A report on the Dream's approach against the Liberty",
    summary: "What happened, in a sentence or two.",
    author: "A Writer",
    outlet: index ? "ESPN" : "The IX",
    source: index ? "espn" : "ix",
    publishedAt: `2026-09-30T1${4 - index}:00:00.000Z`,
    photo: url && { url, credit: "Getty Images" },
    teams: ["NYL", "ATL"],
  }));

/**
 * @param {import("@playwright/test").Page} page
 * @param {"light" | "dark"} theme
 */
async function showTheme(page, theme) {
  await page.emulateMedia({ colorScheme: theme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/** @param {import("@playwright/test").Page} page */
async function listThemeLayoutChanges(page) {
  await showTheme(page, "light");
  const maple = await readLayout(page);
  await showTheme(page, "dark");
  const walnut = await readLayout(page);
  await showTheme(page, "light");
  return listLayoutChanges(maple, walnut);
}

/** Each view, opened from the last, and what shows once it's drawn. */
const VIEWS = [
  {
    name: "Bracket",
    open: (page) => page.getByRole("tab", { name: "Bracket" }).click(),
    shown: (page) => page.locator('[data-series="1-0"] .team-line.won'),
  },
  {
    name: "Games",
    open: (page) => page.getByRole("tab", { name: "Games" }).click(),
    shown: (page) => page.locator("#seasonGames .game-day.is-today .game-row").first(),
  },
  {
    name: "Standings",
    open: (page) => page.getByRole("tab", { name: "Standings" }).click(),
    shown: (page) => page.locator("#standings-league tr").nth(2),
  },
  {
    name: "a team's sheet",
    open: (page) =>
      page.getByRole("button", { name: "Team details: Minnesota Lynx" }).first().click(),
    shown: (page) => page.locator("#teamSheet table.players"),
    close: (page) => page.keyboard.press("Escape"),
  },
  {
    name: "a team's roster",
    open: async (page) => {
      await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
      await page.locator("#teamSheet").getByRole("tab", { name: "Roster" }).click();
    },
    shown: (page) => page.locator("#rosterSection .roster-coach"),
    close: (page) => page.keyboard.press("Escape"),
  },
  {
    name: "a player's sheet",
    open: async (page) => {
      await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
      await page.locator("#teamSheet").getByRole("tab", { name: "Roster" }).click();
      await page.locator("#rosterSection").getByRole("button", { name: "Breanna Stewart" }).click();
    },
    shown: (page) => page.locator("#playerSheet .player-curve b").first(),
    close: (page) => page.keyboard.press("Escape"),
  },
  {
    name: "News",
    open: (page) => page.getByRole("tab", { name: "News" }).click(),
    shown: (page) => page.locator(".news-more").first(),
  },
  {
    name: "settings",
    open: (page) => page.getByRole("button", { name: "Settings", exact: true }).click(),
    shown: (page) => page.locator("#settingsDialog .appearance-row"),
    close: (page) => page.keyboard.press("Escape"),
  },
];

for (const [screen, viewport] of Object.entries({
  "a phone": { width: 390, height: 844 },
  "a wide screen": { width: 1280, height: 900 },
})) {
  test(`on ${screen}, every view lays out the same in Walnut as in Maple, which change only colors`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "light" });
    const app = await openApp(page);
    const [withPhoto, withoutPhoto] = createStories(new URL("icon-180.png", page.url()).href);
    await app.writeDocument("news/cards", {
      cards: [
        { lead: withPhoto, more: [withoutPhoto] },
        { lead: { ...withoutPhoto, id: "alone" }, more: [] },
      ],
    });
    for (const view of VIEWS) {
      await view.open(page);
      await expect(view.shown(page)).toBeVisible();
      // Past the tab bar's pill sliding to the tab, and any other motion, before the page is read.
      await page.clock.runFor(2000);
      expect(await listThemeLayoutChanges(page), view.name).toEqual([]);
      if (view.close) {
        await view.close(page);
        await expect(view.shown(page)).toBeHidden();
      }
    }
  });
}
