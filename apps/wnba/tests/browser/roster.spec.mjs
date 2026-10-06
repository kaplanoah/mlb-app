import { test, expect, openApp } from "./harness.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const PHONE = { width: 390, height: 844 };

/** @param {import("@playwright/test").Page} page */
async function openLibertyRoster(page) {
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
  const sheet = page.locator("#teamDialog");
  await sheet.locator("#teamPages").getByRole("tab", { name: "Roster" }).click();
  await expect(sheet.locator(".roster-coach")).toBeVisible();
  return sheet;
}

/** @param {import("@playwright/test").Locator} sheet */
const readLastNames = (sheet) => sheet.locator("table.roster tbody .roster-last").allTextContents();

/** @param {import("@playwright/test").Locator} locator */
async function readBox(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not shown");
  return box;
}

/**
 * @param {import("@playwright/test").Locator} sheet
 * @param {{ left?: number, top?: number }} scroll
 */
async function scrollSheet(sheet, scroll) {
  await sheet.evaluate(
    (dialog, { left, top }) =>
      new Promise((resolve) => {
        dialog.addEventListener("scroll", resolve, { once: true });
        dialog.scrollTo({ left, top, behavior: "instant" });
      }),
    scroll,
  );
}

test("a team's sheet switches to its roster: each player by last name, with her facts and averages, and the coach", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openLibertyRoster(page);

  const pill = sheet.locator("#teamPages");
  await expect(pill.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator(".sheet-part-head")).toHaveText(/Roster\s*15 players/);
  expect((await readLastNames(sheet)).slice(0, 3)).toEqual(["Allen", "Astier", "BalogunOut"]);
  const stewart = sheet.locator("table.roster tbody tr", { hasText: "Stewart" });
  await expect(stewart.locator("td")).toHaveText([
    "30",
    "F",
    `6'4"`,
    "UConn",
    "32",
    "2016",
    "42",
    "32.9",
    "20.8",
    "8.3",
    "3.3",
    "1.4",
    "1.3",
  ]);
  await expect(sheet.locator(".roster-coach")).toHaveText(/Head coach\s*Chris DeMarco/);
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);

  await pill.getByRole("tab", { name: "Stats" }).click();
  await expect(sheet.locator("table.players")).toBeVisible();
  await expect(sheet.locator("table.roster")).toHaveCount(0);
});

test("a tap on a column's name sorts by it, the most first for an average, and a second tap reverses it, with players who haven't played last", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  const points = sheet.getByRole("columnheader", { name: "Pts" });

  await points.getByRole("button").click();
  await expect(points).toHaveAttribute("aria-sort", "descending");
  expect((await readLastNames(sheet))[0]).toBe("Stewart");
  expect((await readLastNames(sheet)).at(-1)).toBe("BalogunOut");

  await points.getByRole("button").click();
  await expect(points).toHaveAttribute("aria-sort", "ascending");
  expect((await readLastNames(sheet))[0]).toBe("Maley");
  expect((await readLastNames(sheet)).at(-1)).toBe("BalogunOut");
  await expect(sheet.getByRole("columnheader", { name: "Player" })).not.toHaveAttribute(
    "aria-sort",
  );
});

test("on a phone, swiping the roster across keeps each player's number and name and the sheet's title in place, with a line at the names' edge only once it has moved", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  const row = sheet.locator("table.roster tbody tr", { hasText: "Stewart" });
  const name = row.locator(".roster-player");
  const pinned = [row.locator(".roster-number"), name, sheet.locator("#teamTitle")];
  const heading = sheet.locator(".sheet-part-head");
  const position = row.locator("td").nth(1);
  const readEdge = () => name.evaluate((cell) => getComputedStyle(cell, "::after").visibility);
  const before = await Promise.all([...pinned, heading, position].map(readBox));
  expect(await readEdge()).toBe("hidden");

  await scrollSheet(sheet, { left: 200 });

  const after = await Promise.all([...pinned, heading, position].map(readBox));
  for (const index of pinned.keys()) expect(after[index].x).toBe(before[index].x);
  expect(after[3].x).toBe(before[3].x);
  expect(after[4].x).toBeLessThan(before[4].x - 150);
  await expect.poll(readEdge).toBe("visible");
  const numberBox = after[0];
  expect(after[1].x).toBe(numberBox.x + numberBox.width);
});

test("on a phone, scrolling down the roster takes the title and pill away and stops the column names at the sheet's top", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  const head = sheet.locator("table.roster thead");

  await scrollSheet(sheet, { top: 400 });

  // The sheet's scrolling area starts inside its top border.
  const top = await sheet.evaluate(
    (dialog) => dialog.getBoundingClientRect().top + dialog.clientTop,
  );
  expect((await readBox(head)).y).toBe(top);
  const pill = await readBox(sheet.locator("#teamPages"));
  expect(pill.y + pill.height).toBeLessThan(top);
});

test("the sheet opens on the page it showed before a reload", async ({ page }) => {
  await openApp(page);
  const sheet = await openLibertyRoster(page);

  await page.reload();

  await expect(sheet.locator(".roster-coach")).toBeVisible();
  await expect(sheet.locator("#teamPages").getByRole("tab", { name: "Roster" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a past season's team sheet has only its stats, since the roster is today's", async ({
  page,
}) => {
  await openApp(page, { pastSeasons: { 2025: (season) => ({ ...season, season: 2025 }) } });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Season" }).selectOption("2025");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();

  const sheet = page.locator("#teamDialog");
  await expect(sheet.locator("table.players")).toBeVisible();
  await expect(sheet.locator("#teamPages [role=tab]")).toHaveCount(0);
});

test.describe("in full motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the pill's thumb slides to the page a tap shows", async ({ page }) => {
    await openApp(page);
    await page.getByRole("tab", { name: "Standings" }).click();
    await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
    const pill = page.locator("#teamPages");
    await expect(pill.getByRole("tab", { name: "Stats" })).toBeVisible();

    await pill.getByRole("tab", { name: "Roster" }).click();

    const thumb = pill.locator(".pager-thumb");
    expect(
      await thumb.evaluate((element) =>
        element.getAnimations().map((motion) => /** @type {any} */ (motion).transitionProperty),
      ),
    ).toEqual(["transform"]);
  });
});
