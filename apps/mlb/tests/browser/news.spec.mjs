import { test, expect, openApp, openSettings, ON_A_PHONE } from "./harness.mjs";
import { listLowContrastText } from "../../../../tests/browser/contrast.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";
import { listTapsOffButtons } from "../../../../tests/browser/tap-states.mjs";

test.use({ ...ON_A_PHONE, contextOptions: { reducedMotion: "reduce" } });

/**
 * @param {string} photoUrl
 * @param {Record<string, any>} fields
 */
const createStory = (photoUrl, fields) => ({
  url: `https://example.com/${fields.id}`,
  summary: "What happened, in a sentence.",
  author: "A Writer",
  publishedAt: "2026-09-24T14:00:00.000Z",
  photo: { url: photoUrl, credit: "Getty Images" },
  teams: ["NYM"],
  ...fields,
});

/**
 * The Athletic's story with ESPN's under it, and one only the Mets' own outlets carry.
 * @param {string} photoUrl
 */
const createCards = (photoUrl) => [
  {
    lead: createStory(photoUrl, {
      id: "athletic",
      title: "MLB proposes a 154-game season",
      outlet: "The Athletic",
      source: "athletic",
      teams: [],
    }),
    more: [
      createStory(photoUrl, {
        id: "espn",
        title: "MLB proposes shorter season, best-of-7 division series",
        outlet: "ESPN",
        source: "espn",
        teams: [],
      }),
    ],
  },
  {
    lead: createStory(photoUrl, {
      id: "post",
      title: "Mets fire hitting coach in staff shake-up",
      outlet: "NY Post",
      source: "nypost",
      teamFeed: "NYM",
      publishedAt: "2026-09-24T15:00:00.000Z",
    }),
    more: [],
  },
];

/** @param {import("@playwright/test").Page} page */
async function openNews(page) {
  const app = await openApp(page);
  await page.getByRole("tab", { name: "News" }).click();
  await expect(page.locator("#newsList")).toHaveText("No news yet");
  await app.writeFromWorker("news/cards", {
    cards: createCards(new URL("icon-180.png", page.url()).href),
  });
  await expect(page.locator(".news-card")).toHaveCount(2);
  return app;
}

/** @param {import("@playwright/test").Page} page */
const readHeadlines = (page) => page.locator(".news-card h3").allTextContents();

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function switchOff(page, name) {
  await openSettings(page);
  const toggle = page.getByRole("switch", { name });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsDialog")).toBeHidden();
}

test("the News tab shows a card for each piece of news the Worker saves, newest first, with the stories under its lead", async ({
  page,
}) => {
  await openNews(page);

  expect(await readHeadlines(page)).toEqual([
    "Mets fire hitting coach in staff shake-up",
    "MLB proposes a 154-game season",
  ]);
  const mets = page.locator(".news-card").first();
  await expect(mets.locator(".news-teams")).toHaveText("Mets");
  await expect(mets.getByRole("link", { name: /^Read on NY Post/ })).toHaveAttribute(
    "href",
    "https://example.com/post",
  );
  await expect(page.locator(".news-more-title")).toHaveText([
    "MLB proposes shorter season, best-of-7 division series",
  ]);
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listLowContrastText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);
  expect(await listTapsOffButtons(page)).toEqual([]);
});

test("switching off the Mets' own outlets or The Athletic leaves their stories out, and ESPN's leads in The Athletic's place", async ({
  page,
}) => {
  await openNews(page);

  await switchOff(page, "Include dedicated Mets sources");
  expect(await readHeadlines(page)).toEqual(["MLB proposes a 154-game season"]);
  await switchOff(page, "Include content from The Athletic");
  expect(await readHeadlines(page)).toEqual([
    "MLB proposes shorter season, best-of-7 division series",
  ]);
  await expect(page.locator(".news-more")).toHaveCount(0);

  await openSettings(page);
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listLowContrastText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);
});

test("after a reload, the news the page last showed answers the News switches while the store is still answering", async ({
  page,
}) => {
  const app = await openNews(page);
  const release = await app.holdStore();

  await page.reload();
  expect(await readHeadlines(page)).toEqual([
    "Mets fire hitting coach in staff shake-up",
    "MLB proposes a 154-game season",
  ]);
  await switchOff(page, "Include dedicated Mets sources");

  expect(await readHeadlines(page)).toEqual(["MLB proposes a 154-game season"]);
  release();
});
