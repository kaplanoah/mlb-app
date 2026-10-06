import { test, expect, openApp } from "./harness.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const PHONE = { width: 390, height: 844 };

/**
 * What a token computes to in the page's theme, as a color.
 * @param {import("@playwright/test").Page} page
 * @param {string} token
 */
const readTokenColor = (page, token) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  }, token);

/**
 * The colors a chip of each class draws with, set loose on the page.
 * @param {import("@playwright/test").Page} page
 * @param {string} className
 */
const readChip = (page, className) =>
  page.evaluate((name) => {
    const chip = document.createElement("span");
    chip.className = name;
    chip.textContent = "Bonus";
    document.body.append(chip);
    const { color, borderTopColor, borderTopWidth, backgroundColor } = getComputedStyle(chip);
    chip.remove();
    return { color, borderTopColor, borderTopWidth, backgroundColor };
  }, className);

for (const colorScheme of /** @type {const} */ (["light", "dark"])) {
  test(`each chip takes the color of its job, in ${colorScheme}: what's happening now outlined in orange, a champion in teal, and a conference in ink`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const [now, result, ink] = await Promise.all(
      ["--orange", "--teal", "--ink-mid"].map((token) => readTokenColor(page, token)),
    );

    for (const className of ["bonus", "foul-chip"]) {
      expect(await readChip(page, className), className).toEqual({
        color: now,
        borderTopColor: now,
        borderTopWidth: "1px",
        backgroundColor: "rgba(0, 0, 0, 0)",
      });
    }
    expect((await readChip(page, "status-chip champion")).backgroundColor).toBe(result);
    expect((await readChip(page, "conference-tag east")).color).toBe(ink);
    expect((await readChip(page, "conference-tag west")).color).toBe(ink);
  });
}

test("a Read button is raised like a card, a button's height, its words centered on their capitals", async ({
  page,
}) => {
  const app = await openApp(page);
  await app.writeDocument("news/topics", {
    topics: [
      {
        id: "film",
        stories: [
          {
            id: "report",
            url: "https://example.com/report",
            title: "A report on the Dream's approach against the Liberty",
            summary: "What happened, in a sentence or two.",
            author: "A Writer",
            outlet: "The IX",
            source: "ix",
            publishedAt: "2026-09-30T14:00:00.000Z",
            kind: "report",
            teams: ["NYL", "ATL"],
          },
        ],
      },
    ],
  });
  await page.getByRole("tab", { name: "News" }).click();
  const button = page.locator(".read-button").first();
  await expect(button).toBeVisible();

  const look = await button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const words = element.querySelector(".read-label").getBoundingClientRect();
    const card = getComputedStyle(element.closest(".news-card"));
    const style = getComputedStyle(element);
    return {
      height: box.height,
      weight: style.fontWeight,
      background: style.backgroundColor,
      cardBackground: card.backgroundColor,
      roomAbove: Math.round((words.top - box.top) * 2) / 2,
      roomBelow: Math.round((box.bottom - words.bottom) * 2) / 2,
    };
  });
  expect(look.height).toBe(30);
  expect(look.weight).toBe("500");
  expect(look.background).toBe(look.cardBackground);
  expect(look.roomAbove).toBe(look.roomBelow);
});

test("a pill's names are buttons, in sentence case at a button's weight, and its bar held at the top ends in a line, not a fade", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  await page.getByRole("tab", { name: "Games" }).click();
  await page.getByRole("tab", { name: "Previous" }).click();
  const name = page.locator("#games-bar .pager-tabs button").first();
  await expect(name).toHaveCSS("text-transform", "none");
  await expect(name).toHaveCSS("font-weight", "500");

  await page.evaluate(() => scrollTo({ top: 400, behavior: "instant" }));
  const bar = page.locator("#games-bar");
  await expect(bar).toHaveClass(/stuck/);
  const divider = await readTokenColor(page, "--divider");
  await expect(bar).toHaveCSS("box-shadow", `${divider} 0px 1px 0px 0px`);
  const floor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(bar).toHaveCSS(
    "background-image",
    `linear-gradient(${floor} 100%, rgba(0, 0, 0, 0))`,
  );
});

/**
 * A color as red, green, and blue, however the page computes it.
 * @param {import("@playwright/test").Page} page
 * @param {string} color
 */
const readChannels = (page, color) =>
  page.evaluate((value) => {
    const context = /** @type {CanvasRenderingContext2D} */ (
      document.createElement("canvas").getContext("2d")
    );
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, color);

for (const colorScheme of /** @type {const} */ (["light", "dark"])) {
  test(`the list a pill shows is filled orange, its name in the color on orange, in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);
    await page.getByRole("tab", { name: "Games" }).click();
    await page.getByRole("tab", { name: "Previous" }).click();
    const chosen = page.locator("#games-bar .pager-tabs button.active");
    await expect(chosen).toHaveText("Previous");
    await page.clock.runFor(2000);
    const [orange, onOrange] = await Promise.all(
      ["--orange", "--orange-ink"].map(async (token) =>
        readChannels(page, await readTokenColor(page, token)),
      ),
    );
    const thumb = await page
      .locator("#games-bar .pager-thumb")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const name = await chosen.evaluate((element) => getComputedStyle(element).color);
    expect(await readChannels(page, thumb)).toEqual(orange);
    expect(await readChannels(page, name)).toEqual(onOrange);
  });
}

test("a sheet barely dims the page behind it, and a switch stays round", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.locator("#settingsDialog");
  await expect(settings).toBeVisible();
  const dim = await settings.evaluate(
    (dialog) => getComputedStyle(dialog, "::backdrop").backgroundColor,
  );
  expect(dim).toBe("rgba(0, 0, 0, 0.01)");
  const toggle = settings.locator(".switch").first();
  await expect(toggle).toHaveCSS("border-radius", "14px");
  await expect(toggle.locator(".switch-knob")).toHaveCSS("border-radius", "50%");
});
