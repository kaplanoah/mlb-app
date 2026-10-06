import { test, expect, openApp } from "./harness.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";
import { expectShown, expectSteppedAway, readLeft } from "../../../../tests/browser/sheet-row.mjs";
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

  await expect(sheet.locator("#rosterTitle")).toHaveText("Liberty Roster");
  await expect(sheet.locator("#rosterTitle .dot")).toBeVisible();
  await expect(sheet.locator("#rosterNote")).toHaveText("2026•15 players");
  await expect(sheet.getByRole("button", { name: "Back to Team" })).toBeVisible();
  expect((await readLastNames(sheet)).slice(0, 3)).toEqual(["Allen", "Astier", "BalogunOut"]);
  const stewart = sheet.locator("table.roster tbody tr", { hasText: "Stewart" });
  await expect(stewart.locator("td")).toHaveText([
    "30",
    "F",
    `6'4"`,
    "Connecticut",
    "32",
    "2016",
    "42",
    "32.9",
    "20.8",
    "8.3",
    "3.3",
  ]);
  await expect(sheet.locator(".roster-coach")).toHaveText(/Head coach\s*Chris DeMarco/);
  const astier = sheet.locator("table.roster tbody tr", { hasText: "Astier" });
  await expect(astier.locator(".roster-country")).toHaveText("France");
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);

  await sheet.getByRole("button", { name: "Back to Team" }).click();
  await expectSteppedAway(sheet);
  await expectShown(page.locator("#teamSheet"));
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

test("on a phone, swiping the roster across keeps each player's number and name and the sheet's title in place, with a line at the names' edge, from the title's band down, only once it has moved", async ({
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
  const edgeTop = await sheet
    .locator(".roster-bands .roster-player")
    .evaluate(
      (cell) =>
        cell.getBoundingClientRect().top + parseFloat(getComputedStyle(cell, "::after").top),
    );
  expect(edgeTop).toBe(
    (await readBox(sheet.locator(".sheet-top"))).y +
      (await readBox(sheet.locator(".sheet-top"))).height,
  );
});

test("on a phone, the line at the names' edge keeps 10px clear of the longest name and its Out chip", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  await expect(sheet.locator("table.roster .foul-chip").first()).toBeVisible();

  const gaps = await sheet.locator("table.roster tbody th.roster-player").evaluateAll((cells) =>
    cells.map((cell) => {
      const range = document.createRange();
      range.selectNodeContents(/** @type {Element} */ (cell.querySelector(".roster-last")));
      return cell.getBoundingClientRect().right - range.getBoundingClientRect().right;
    }),
  );
  expect(Math.min(...gaps)).toBeCloseTo(10, 0);
});

test("on a phone, the roster never springs past its edges, and at its left edge a swipe right on the table goes back to the team", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  await expect(sheet).toHaveCSS("overscroll-behavior-x", "none");

  await (
    await drag(page, { x: 60, y: 400 }, { x: 250 })
  )();

  await expectShown(page.locator("#teamSheet"));
  await expectSteppedAway(sheet);
});

test("on a phone, a swipe right on the roster scrolled across scrolls the table back, and on its title goes back to the team", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);
  await scrollSheet(sheet, { left: 300 });

  await (
    await drag(page, { x: 60, y: 400 }, { x: 150 })
  )();
  await expect.poll(() => sheet.evaluate((element) => element.scrollLeft)).toBeLessThan(300);
  await expectShown(sheet);

  const title = await readBox(sheet.locator("#rosterTitle"));
  await (
    await drag(page, { x: 60, y: title.y + title.height / 2 }, { x: 250 })
  )();
  await expectShown(page.locator("#teamSheet"));
  await expectSteppedAway(sheet);
});

test("on a phone, scrolling down the roster takes its title away and stops the column names 4px under the sheet's top", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openLibertyRoster(page);

  await scrollSheet(sheet, { top: 400 });

  // The sheet's scrolling area starts inside its top border.
  const top = await sheet.evaluate(
    (element) => element.getBoundingClientRect().top + element.clientTop,
  );
  expect((await readBox(sheet.locator("table.roster .roster-head"))).y).toBe(top + 4);
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
    await drag(page, { x: 330, y: 400 }, { x: -250 })
  )();
  await expect(rosterSheet.locator(".roster-coach")).toBeVisible();
  await expectShown(rosterSheet);
  await expectSteppedAway(teamSheet);

  await (
    await drag(page, { x: 60, y: 300 }, { x: 250 })
  )();
  await expectShown(teamSheet);
  await expectSteppedAway(rosterSheet);
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

test("a past season's team has that season's roster, with no one out", async ({ page }) => {
  await openApp(page, { pastSeasons: { 2025: (season) => ({ ...season, season: 2025 }) } });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Season" }).selectOption("2025");
  await page.keyboard.press("Escape");
  const sheet = await openLibertyRoster(page);

  await expect(sheet.locator("#rosterNote")).toHaveText(/^2025•\d+ players$/);
  await expect(sheet.locator("table.roster tbody tr", { hasText: "Ionescu" })).toBeVisible();
  await expect(sheet.locator(".foul-chip")).toHaveCount(0);
});

test.describe("in full motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("on a phone, a finger on the roster's title moves it right with the finger, and once it lifts, the roster slides on off the screen without stepping back", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const sheet = await openLibertyRoster(page);
    await expectShown(sheet);
    await scrollSheet(sheet, { left: 300 });
    const title = await readBox(sheet.locator("#rosterTitle"));

    const release = await drag(
      page,
      { x: 60, y: title.y + title.height / 2 },
      { x: 150 },
      { durationMs: 1000 },
    );
    expect(await readLeft(sheet)).toBeCloseTo(150, -1);
    expect(await sheet.evaluate((element) => element.scrollLeft)).toBe(300);

    await page.evaluate(() => {
      const roster = /** @type {HTMLElement} */ (document.getElementById("rosterSheet"));
      const row = /** @type {HTMLElement} */ (roster.closest(".sheet-row"));
      const noted = /** @type {number[]} */ ([]);
      const note = () => {
        noted.push(Math.round(roster.getBoundingClientRect().x - row.getBoundingClientRect().x));
        if (!roster.inert) requestAnimationFrame(note);
      };
      requestAnimationFrame(note);
      Object.assign(window, { rosterLefts: noted });
    });
    await release();
    await expectShown(page.locator("#teamSheet"));
    const noted = await page.evaluate(
      () => /** @type {number[]} */ (/** @type {any} */ (window).rosterLefts),
    );

    expect(noted.length).toBeGreaterThan(5);
    expect(noted.every((left, index) => index === 0 || left >= noted[index - 1])).toBe(true);
    await expect.poll(() => readLeft(sheet)).toBe(PHONE.width);
  });

  test("on a phone, the roster under a player's sheet slides a little way left, like any sheet under another, however wide its table", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const sheet = await openLibertyRoster(page);
    await expectShown(sheet);

    await sheet.getByRole("button", { name: "Leonie Fiebich" }).click();
    await expectShown(page.locator("#playerSheet"));

    const content = sheet.locator(":scope > .sheet-content");
    expect(await readLeft(content)).toBeCloseTo(-0.3 * PHONE.width, 0);
  });

  test("on a phone, a short swipe right on the roster's title springs back to the roster once the finger lifts", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const sheet = await openLibertyRoster(page);
    await expectShown(sheet);
    const title = await readBox(sheet.locator("#rosterTitle"));

    const release = await drag(
      page,
      { x: 60, y: title.y + title.height / 2 },
      { x: 46 },
      { durationMs: 1000 },
    );
    expect(await readLeft(sheet)).toBeGreaterThan(30);
    await release();

    await expectShown(sheet);
    await expect(page.locator("#sheetDialog .sheet-row")).not.toHaveClass(/is-swiped/);
  });
});
