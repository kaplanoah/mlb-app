import { test, expect, openApp } from "./harness.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";
import { touchAndCancel } from "../../../../tests/browser/touch.mjs";

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

/**
 * An older topic than the others, with one short story.
 * @param {string} photoUrl
 */
const createAwardTopic = (photoUrl) => ({
  id: "award",
  stories: [
    createStory(photoUrl, {
      id: "award",
      title: "Collier named Defensive Player of the Year",
      outlet: "ESPN",
      source: "espn",
      kind: "report",
      publishedAt: "2026-09-30T13:00:00.000Z",
    }),
  ],
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {(photoUrl: string) => any[]} [buildTopics]
 */
async function openNewsWithStories(page, buildTopics = createTopics) {
  const app = await openApp(page);
  await page.getByRole("tab", { name: "News" }).click();
  await expect(page.locator("#newsList")).toHaveText("No news yet");
  const topics = buildTopics(new URL("icon-180.png", page.url()).href);
  await app.writeDocument("news/topics", { topics });
  await expect(page.locator(".news-card")).toHaveCount(topics.length);
  return app;
}

/** @param {string} photoUrl */
const createThreeTopics = (photoUrl) => [...createTopics(photoUrl), createAwardTopic(photoUrl)];

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} title
 */
const findCardBox = (page, title) =>
  page.locator(".news-card").filter({ hasText: title }).boundingBox();

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
  expect(await listStrayPeriods(page)).toEqual([]);
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
  const photoBox = await card.locator(".news-photo").boundingBox();
  const textBox = await card.locator(".news-more-text").boundingBox();
  const thumbBox = await card.locator(".news-thumb").boundingBox();
  expect(Math.abs(photoBox.width - (cardBox.width - 2))).toBeLessThan(1);
  expect(thumbBox.x).toBeGreaterThan(textBox.x + textBox.width);
  expect(Math.abs(thumbBox.y - textBox.y)).toBeLessThan(1);
});

test("a story opened from its Read button shows a check in place of its arrow, as wide a label, and keeps it after a reload", async ({
  page,
}) => {
  await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "" }));
  await openNewsWithStories(page);
  const film = page.locator(".news-card").nth(1);
  const espn = film.getByRole("link", { name: /^Read on ESPN/ });
  const athletic = film.getByRole("link", { name: /^Read on The Athletic/ });
  const unreadLabel = await espn.locator(".read-label").boundingBox();

  const popup = page.waitForEvent("popup");
  await espn.click();
  await (await popup).close();

  await expect(espn.locator(".read-check")).toBeVisible();
  await expect(espn.locator(".read-arrow")).toHaveCount(0);
  await expect(athletic.locator(".read-arrow")).toBeVisible();
  const openedLabel = await espn.locator(".read-label").boundingBox();
  expect(Math.abs(openedLabel.width - unreadLabel.width)).toBeLessThan(0.5);
  expect(await listOffScaleText(page)).toEqual([]);

  await page.reload();
  await expect(page.locator(".news-card").nth(1).locator(".read-check")).toHaveCount(1);
});

test("on a wide screen, each of two columns stacks its own cards, as far apart as the page's sides", async ({
  page,
}) => {
  await openNewsWithStories(page, createThreeTopics);

  const practice = await findCardBox(page, "Stewart sat out practice");
  const film = await findCardBox(page, "The Liberty's defense");
  const award = await findCardBox(page, "Collier named");
  const pageSide = await page.locator("#newsList").boundingBox();
  expect(film.x - (practice.x + practice.width)).toBeCloseTo(16, 0);
  expect(Math.abs(award.x - practice.x)).toBeLessThan(1);
  expect(award.y - (practice.y + practice.height)).toBeCloseTo(16, 0);
  expect(award.y).toBeLessThan(film.y + film.height);
  expect(Math.abs(practice.x - pageSide.x)).toBeLessThan(1);
});

test.describe("on a phone, the news", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("lists one card under another, newest first, as far apart as the page's sides", async ({
    page,
  }) => {
    await openNewsWithStories(page, createThreeTopics);

    expect(await readHeadlines(page)).toEqual([
      "Stewart sat out practice with a sore knee",
      "The Liberty's defense held the Dream to 30 percent",
      "Collier named Defensive Player of the Year",
    ]);
    const practice = await findCardBox(page, "Stewart sat out practice");
    const film = await findCardBox(page, "The Liberty's defense");
    const sideMargin = 390 - (practice.x + practice.width);
    expect(sideMargin).toBeCloseTo(16, 0);
    expect(film.y - (practice.y + practice.height)).toBeCloseTo(sideMargin, 0);
  });

  test("puts a card's teams as far under its photo as in from its side, beside the photo's credit, wrapping before they reach it", async ({
    page,
  }) => {
    await openNewsWithStories(page, (photoUrl) => [
      {
        id: "credit",
        stories: [
          createStory(photoUrl, {
            id: "credit",
            title: "The Liberty and the Dream meet again in the semifinals",
            outlet: "ESPN",
            source: "espn",
            kind: "report",
            photo: { url: photoUrl, credit: "Andy Lyons/Getty Images North America via AFP" },
          }),
        ],
      },
    ]);
    const card = await page.locator(".news-card").boundingBox();
    const photo = await page.locator(".news-photo").boundingBox();
    const credit = await page.locator(".news-photo-credit").boundingBox();
    const [liberty, dream] = await Promise.all(
      [0, 1].map((index) => page.locator(".news-teams .club").nth(index).boundingBox()),
    );
    const libertyDot = await page.locator(".news-teams .dot").first().boundingBox();
    const cardBorder = 1;

    expect(libertyDot.y - (photo.y + photo.height)).toBeCloseTo(16, 0);
    expect(libertyDot.x - (card.x + cardBorder)).toBeCloseTo(16, 0);
    expect(credit.y - (photo.y + photo.height)).toBeCloseTo(5, 0);
    expect(card.x + card.width - cardBorder - (credit.x + credit.width)).toBeCloseTo(8, 0);
    expect(dream.y - (liberty.y + liberty.height)).toBeCloseTo(5, 0);
    expect(Math.max(liberty.x + liberty.width, dream.x + dream.width)).toBeLessThan(credit.x);
    const clippedNames = await page
      .locator(".news-teams .team-name")
      .evaluateAll((names) => names.filter((name) => name.scrollWidth > name.clientWidth).length);
    expect(clippedNames).toBe(0);
  });

  test("give way to another tab even when the phone takes the tap on it to stop the scrolling", async ({
    page,
  }) => {
    await openNewsWithStories(page, createThreeTopics);
    const standingsTab = await page.getByRole("tab", { name: "Standings" }).boundingBox();

    await touchAndCancel(page, {
      x: standingsTab.x + standingsTab.width / 2,
      y: standingsTab.y + standingsTab.height / 2,
    });

    await expect(page.getByRole("tab", { name: "Standings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#view-standings")).toBeVisible();
    await expect(page.locator("#view-news")).toBeHidden();
  });

  test("turns to two columns when the screen widens", async ({ page }) => {
    await openNewsWithStories(page, createThreeTopics);
    await expect(page.locator(".news-column")).toHaveCount(1);

    await page.setViewportSize({ width: 1000, height: 844 });
    await expect(page.locator(".news-column")).toHaveCount(2);
  });
});
