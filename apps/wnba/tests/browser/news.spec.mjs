import { test, expect, openApp } from "./harness.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

/**
 * @param {string} photoUrl
 * @param {Record<string, any>} fields
 */
const createStory = (photoUrl, fields) => ({
  url: `https://example.com/${fields.id}`,
  summary: "What happened, in a sentence.",
  author: "A Writer",
  publishedAt: "2026-09-30T14:00:00.000Z",
  photo: { url: photoUrl, credit: "Getty Images" },
  teams: ["NYL", "ATL"],
  ...fields,
});

/**
 * Two topics: one The Athletic leads, with ESPN's story on it too, and one only the Liberty's own
 * outlets carry.
 * @param {string} photoUrl
 */
const createTopics = (photoUrl) => [
  {
    id: "film",
    stories: [
      createStory(photoUrl, {
        id: "athletic",
        title: "The Liberty's defense held the Dream to 30 percent",
        outlet: "The Athletic",
        source: "athletic",
        kind: "report",
      }),
      createStory(photoUrl, {
        id: "espn",
        title: "Film review: how the Dream changed their approach",
        outlet: "ESPN",
        source: "espn",
        kind: "analysis",
      }),
    ],
  },
  {
    id: "practice",
    stories: [
      createStory(photoUrl, {
        id: "post",
        title: "Stewart sat out practice with a sore knee",
        outlet: "NY Post",
        source: "nypost",
        teamFeed: "NYL",
        kind: "report",
        publishedAt: "2026-09-30T15:00:00.000Z",
      }),
    ],
  },
];

/** @param {import("@playwright/test").Page} page */
async function openNewsWithStories(page) {
  const app = await openApp(page);
  await page.getByRole("tab", { name: "News" }).click();
  await expect(page.locator("#newsList")).toHaveText("No news yet.");
  await app.writeDocument("news/topics", {
    topics: createTopics(new URL("icon-180.png", page.url()).href),
  });
  await expect(page.locator(".news-card")).toHaveCount(2);
  return app;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function switchOff(page, name) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settingsDialog")).toBeHidden();
}

const readHeadlines = (page) => page.locator(".news-card h3").allTextContents();

test("the News tab shows the news the Worker saves, newest topic first, with its two stories", async ({
  page,
}) => {
  await openNewsWithStories(page);

  expect(await readHeadlines(page)).toEqual([
    "Stewart sat out practice with a sore knee",
    "The Liberty's defense held the Dream to 30 percent",
  ]);
  const film = page.locator(".news-card").nth(1);
  await expect(film.locator(".news-teams")).toHaveText("LibertyDream");
  await expect(film.locator(".news-more h4")).toHaveText(
    "Film review: how the Dream changed their approach",
  );
  await expect(film.getByRole("link", { name: /^Read on ESPN/ })).toHaveAttribute(
    "href",
    "https://example.com/espn",
  );
  expect(await listOffScaleText(page)).toEqual([]);
});

test("switching off The Athletic or the Liberty's own outlets leaves their stories out, and the choice stays", async ({
  page,
}) => {
  await openNewsWithStories(page);

  await switchOff(page, "Include content from The Athletic");
  expect(await readHeadlines(page)).toEqual([
    "Stewart sat out practice with a sore knee",
    "Film review: how the Dream changed their approach",
  ]);
  await expect(page.locator(".news-more")).toHaveCount(0);

  await switchOff(page, "Include dedicated Liberty sources");
  expect(await readHeadlines(page)).toEqual(["Film review: how the Dream changed their approach"]);

  await page.reload();
  await expect(page.locator(".news-card h3")).toHaveText([
    "Film review: how the Dream changed their approach",
  ]);
});

test("a card's lead photo runs its full width, and the second story's sits beside its text", async ({
  page,
}) => {
  await openNewsWithStories(page);
  const card = page.locator(".news-card").nth(1);
  await expect(card.locator(".news-thumb")).toBeVisible();

  const cardBox = await card.boundingBox();
  const photoBox = await card.locator(".news-photo img").boundingBox();
  const textBox = await card.locator(".news-more-text").boundingBox();
  const thumbBox = await card.locator(".news-thumb").boundingBox();
  expect(Math.abs(photoBox.width - (cardBox.width - 2))).toBeLessThan(1);
  expect(thumbBox.x).toBeGreaterThan(textBox.x + textBox.width);
  expect(Math.abs(thumbBox.y - textBox.y)).toBeLessThan(1);
});
