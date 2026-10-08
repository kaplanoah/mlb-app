import { test, expect, openApp } from "./harness.mjs";

// iPhones draw a photo still on its way their own way, so these run in WebKit too.

test.use({
  viewport: { width: 390, height: 844 },
  contextOptions: { reducedMotion: "reduce" },
});

/** @param {string} id */
const createCard = (id) => ({
  lead: {
    id,
    url: `https://example.com/${id}`,
    title: `The Liberty beat the Dream in game ${id}`,
    summary: "What happened, in a sentence.",
    author: "A Writer",
    outlet: "ESPN",
    source: "espn",
    publishedAt: "2026-09-30T14:00:00.000Z",
    photo: { url: `https://photos.example/${id}.png`, credit: "Getty Images" },
    teams: ["NYL", "ATL"],
  },
  more: [],
});

/** @param {import("@playwright/test").Page} page */
const readTitleTops = (page) =>
  page
    .locator(".news-title")
    .evaluateAll((titles) => titles.map((title) => title.getBoundingClientRect().top));

test("a card's text sits where it stays before its photo arrives", async ({ page }) => {
  const app = await openApp(page);
  const photoBody = await (await page.request.get("icon-180.png")).body();
  /** @type {() => void} */
  let sendPhotos = () => {};
  const photosSent = new Promise((resolve) => {
    sendPhotos = () => resolve(undefined);
  });
  await page.route("https://photos.example/**", async (route) => {
    await photosSent;
    await route.fulfill({ body: photoBody, contentType: "image/png" });
  });
  await page.getByRole("tab", { name: "News" }).click();
  await app.writeDocument("news/cards", { cards: ["1", "2"].map(createCard) });
  await expect(page.locator(".news-card")).toHaveCount(2);
  const topsWhileLoading = await readTitleTops(page);

  sendPhotos();

  await expect
    .poll(() =>
      page
        .locator(".news-photo")
        .evaluateAll((photos) =>
          photos.every((photo) => /** @type {HTMLImageElement} */ (photo).naturalWidth > 0),
        ),
    )
    .toBe(true);
  expect(await readTitleTops(page)).toEqual(topsWhileLoading);
});
