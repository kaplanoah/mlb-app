import { test, expect, openApp } from "./harness.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const PHONE = { width: 390, height: 844 };

/** @param {import("@playwright/test").Page} page */
async function openLibertySheet(page) {
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
  const sheet = page.locator("#teamSheet");
  await expect(sheet.locator("#teamTitle")).toHaveText("New York Liberty");
  return sheet;
}

/** @param {import("@playwright/test").Page} page */
async function openLibertyRoster(page) {
  const teamSheet = await openLibertySheet(page);
  await teamSheet.getByRole("button", { name: "Roster" }).click();
  const sheet = page.locator("#rosterSheet");
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

test("a team's Roster opens its roster over its sheet: each player by last name, with her facts and averages, and the coach", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openLibertyRoster(page);

  await expect(sheet.locator("#rosterTitle")).toHaveText("New York Liberty");
  await expect(sheet.locator("#rosterNote")).toHaveText("Roster•15 players");
  await expect(sheet.getByRole("button", { name: "Back to Team" })).toBeVisible();
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
  ]);
  await expect(sheet.locator(".roster-coach")).toHaveText(/Head coach\s*Chris DeMarco/);
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);

  await sheet.getByRole("button", { name: "Back to Team" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#teamSheet table.players")).toBeVisible();
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
  const pinned = [row.locator(".roster-number"), name, sheet.locator("#rosterTitle")];
  const position = row.locator("td").nth(1);
  const readEdge = () => name.evaluate((cell) => getComputedStyle(cell, "::after").visibility);
  const before = await Promise.all([...pinned, position].map(readBox));
  expect(await readEdge()).toBe("hidden");

  await scrollSheet(sheet, { left: 200 });

  const after = await Promise.all([...pinned, position].map(readBox));
  for (const index of pinned.keys()) expect(after[index].x).toBe(before[index].x);
  expect(after[3].x).toBeLessThan(before[3].x - 150);
  await expect.poll(readEdge).toBe("visible");
  expect(after[1].x).toBe(after[0].x + after[0].width);
});

test("on a phone, scrolling down the roster takes its title away and stops the column names at the sheet's top", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);

  await scrollSheet(sheet, { top: 400 });

  // The sheet's scrolling area starts inside its top border.
  const top = await sheet.evaluate(
    (dialog) => dialog.getBoundingClientRect().top + dialog.clientTop,
  );
  expect((await readBox(sheet.locator("table.roster thead"))).y).toBe(top);
  const title = await readBox(sheet.locator("#rosterTitle"));
  expect(title.y + title.height).toBeLessThan(top);
});

test("on a phone, a swipe left on a team's sheet opens its roster, and a swipe right goes back to the team", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const teamSheet = await openLibertySheet(page);
  const rosterSheet = page.locator("#rosterSheet");

  await (
    await drag(page, { x: 300, y: 400 }, { x: -200 })
  )();
  await expect(rosterSheet.locator(".roster-coach")).toBeVisible();
  await expect(rosterSheet).toHaveAttribute("data-stacked");
  await expect(teamSheet).toHaveAttribute("data-covered");

  await (
    await drag(page, { x: 60, y: 300 }, { x: 250 })
  )();
  await expect(rosterSheet).toBeHidden();
  await expect(teamSheet).not.toHaveAttribute("data-covered");
});

test("the roster and the team's sheet under it open again on a reload", async ({ page }) => {
  await openApp(page);
  await openLibertyRoster(page);

  await page.reload();

  const sheet = page.locator("#rosterSheet");
  await expect(sheet.locator(".roster-coach")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Back to Team" })).toBeVisible();
  await sheet.getByRole("button", { name: "Back to Team" }).click();
  await expect(page.locator("#teamSheet #teamTitle")).toHaveText("New York Liberty");
});

test("a past season's team sheet has no roster, since the roster is today's", async ({ page }) => {
  await openApp(page, { pastSeasons: { 2025: (season) => ({ ...season, season: 2025 }) } });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Season" }).selectOption("2025");
  await page.keyboard.press("Escape");
  const sheet = await openLibertySheet(page);

  await expect(sheet.locator("table.players")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Roster" })).toHaveCount(0);
});
