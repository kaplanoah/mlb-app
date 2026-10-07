import { test, expect, openApp } from "./harness.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";
import { expectShown, readLeft } from "../../../../tests/browser/sheet-row.mjs";
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
  await teamSheet.getByRole("tab", { name: "Roster" }).click();
  const section = page.locator("#rosterSection");
  await expect(section.locator(".roster-coach")).toBeVisible();
  await expectShown(section);
  return section;
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
 * @param {import("@playwright/test").Locator} section
 * @param {{ left?: number, top?: number }} scroll
 */
async function scrollSection(section, scroll) {
  await section.evaluate(
    (dialog, { left, top }) =>
      new Promise((resolve) => {
        dialog.addEventListener("scroll", resolve, { once: true });
        dialog.scrollTo({ left, top, behavior: "instant" });
      }),
    scroll,
  );
}

test("a team's Roster pill shows its roster beside its stats: each player by last name, with her facts and averages, and the coach, and its Team pill goes back", async ({
  page,
}) => {
  await openApp(page);
  const section = await openLibertyRoster(page);

  await expect(page.locator("#teamTitle")).toHaveText("New York Liberty");
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await expect(section.locator("#rosterNote")).toHaveText("2026•15 players");
  expect((await readLastNames(section)).slice(0, 3)).toEqual(["Allen", "Astier", "BalogunOut"]);
  const stewart = section.locator("table.roster tbody tr", { hasText: "Stewart" });
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
  await expect(section.locator(".roster-coach")).toHaveText(/Head coach\s*Chris DeMarco/);
  const astier = section.locator("table.roster tbody tr", { hasText: "Astier" });
  await expect(astier.locator(".roster-country")).toHaveText("France");
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);

  await page.getByRole("tab", { name: "Team" }).click();
  await expectShown(page.locator("#teamSection"));
  await expect(section).toHaveAttribute("inert");
});

test("another team's sheet opens on its stats, scrolled to its top", async ({ page }) => {
  await openApp(page);
  const section = await openLibertyRoster(page);
  await scrollSection(section, { top: 300 });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Team details: Minnesota Lynx" }).first().click();

  await expect(page.locator("#teamTitle")).toHaveText("Minnesota Lynx");
  await expectShown(page.locator("#teamSection"));
  await page.getByRole("tab", { name: "Roster" }).click();
  await expectShown(section);
  expect(await section.evaluate((element) => element.scrollTop)).toBe(0);
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

test("on a phone, swiping the roster across keeps each player's number and name, the note over the table, and the team's title in place, with a line at the names' edge, from under the note down, only once it has moved", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const section = await openLibertyRoster(page);
  const row = section.locator("table.roster tbody tr", { hasText: "Stewart" });
  const name = row.locator(".roster-player");
  const pinned = [
    row.locator(".roster-number"),
    name,
    section.locator("#rosterNote"),
    page.locator("#teamTitle"),
  ];
  const position = row.locator("td").nth(1);
  const readEdge = () => name.evaluate((cell) => getComputedStyle(cell, "::after").visibility);
  const before = await Promise.all([...pinned, position].map(readBox));
  expect(await readEdge()).toBe("hidden");

  await scrollSection(section, { left: 200 });

  const after = await Promise.all([...pinned, position].map(readBox));
  for (const index of pinned.keys()) expect(after[index].x).toBe(before[index].x);
  expect(after[4].x).toBeLessThan(before[4].x - 150);
  await expect.poll(readEdge).toBe("visible");
  expect(after[1].x).toBe(after[0].x + after[0].width);
  const edgeTop = await section
    .locator(".roster-bands .roster-player")
    .evaluate(
      (cell) =>
        cell.getBoundingClientRect().top + parseFloat(getComputedStyle(cell, "::after").top),
    );
  expect(edgeTop).toBe((await readBox(section.locator("#rosterBody"))).y);
});

test("on a phone, the line at the names' edge keeps 10px clear of the longest name and its Out chip", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const section = await openLibertyRoster(page);
  await expect(section.locator("table.roster .foul-chip").first()).toBeVisible();

  const gaps = await section.locator("table.roster tbody th.roster-player").evaluateAll((cells) =>
    cells.map((cell) => {
      const range = document.createRange();
      range.selectNodeContents(/** @type {Element} */ (cell.querySelector(".roster-last")));
      return cell.getBoundingClientRect().right - range.getBoundingClientRect().right;
    }),
  );
  expect(Math.min(...gaps)).toBeCloseTo(10, 0);
});

test("on a phone, the roster never springs past its edges, and at its left edge a swipe right on the table goes back to the team's stats", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const section = await openLibertyRoster(page);
  await expect(section).toHaveCSS("overscroll-behavior-x", "none");

  await (
    await drag(page, { x: 60, y: 400 }, { x: 250 })
  )();

  await expectShown(page.locator("#teamSection"));
  await expect(page.getByRole("tab", { name: "Team" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#teamSheet")).toBeVisible();
});

test("on a phone, a swipe right on the roster scrolled across scrolls the table back", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const section = await openLibertyRoster(page);
  await scrollSection(section, { left: 300 });

  await (
    await drag(page, { x: 60, y: 400 }, { x: 150 })
  )();

  await expect.poll(() => section.evaluate((element) => element.scrollLeft)).toBeLessThan(300);
  await expectShown(section);
});

test("on a phone, scrolling down the roster takes its note away and stops the column names 4px under the team's pills, which stay with the title", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const section = await openLibertyRoster(page);
  const pills = page.locator("#teamSheet [role=tablist]");
  const pillsBefore = await readBox(pills);

  await scrollSection(section, { top: 400 });

  const top = await section.evaluate((element) => element.getBoundingClientRect().top);
  expect((await readBox(section.locator("table.roster .roster-head"))).y).toBe(top + 4);
  const note = await readBox(section.locator("#rosterNote"));
  expect(note.y + note.height).toBeLessThan(top);
  expect(await readBox(pills)).toEqual(pillsBefore);
  await expect(page.locator("#teamTitle")).toBeInViewport();
});

test("on a phone, a swipe left on a team's stats shows its roster, and a swipe right on the roster goes back to its stats", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  await openLibertySheet(page);
  const stats = page.locator("#teamSection");
  const roster = page.locator("#rosterSection");

  await (
    await drag(page, { x: 330, y: 400 }, { x: -250 })
  )();
  await expect(roster.locator(".roster-coach")).toBeVisible();
  await expectShown(roster);
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");

  await (
    await drag(page, { x: 60, y: 300 }, { x: 250 })
  )();
  await expectShown(stats);
  await expect(roster).toHaveAttribute("inert");
});

test("the team's sheet opens again on its roster after a reload", async ({ page }) => {
  await openApp(page);
  await openLibertyRoster(page);

  await page.reload();

  const section = page.locator("#rosterSection");
  await expect(section.locator(".roster-coach")).toBeVisible();
  await expectShown(section);
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Team" }).click();
  await expectShown(page.locator("#teamSection"));
  await expect(page.locator("#teamSheet #teamTitle")).toHaveText("New York Liberty");
});

test("a past season's team has that season's roster, with no one out", async ({ page }) => {
  await openApp(page, { pastSeasons: { 2025: (season) => ({ ...season, season: 2025 }) } });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Season" }).selectOption("2025");
  await page.keyboard.press("Escape");
  const section = await openLibertyRoster(page);

  await expect(section.locator("#rosterNote")).toHaveText(/^2025•\d+ players$/);
  await expect(section.locator("table.roster tbody tr", { hasText: "Ionescu" })).toBeVisible();
  await expect(section.locator(".foul-chip")).toHaveCount(0);
});

test.describe("in full motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /**
   * Notes where the roster is on each frame, until the returned function stops and reads the
   * notes.
   * @param {import("@playwright/test").Page} page
   */
  async function startTrackingRoster(page) {
    await page.evaluate(() => {
      const roster = /** @type {HTMLElement} */ (document.getElementById("rosterSection"));
      const row = /** @type {HTMLElement} */ (roster.closest(".sheet-row"));
      const noted = /** @type {number[]} */ ([]);
      const note = () => {
        noted.push(Math.round(roster.getBoundingClientRect().x - row.getBoundingClientRect().x));
        if (!(/** @type {any} */ (window).isTrackingDone)) requestAnimationFrame(note);
      };
      requestAnimationFrame(note);
      Object.assign(window, { rosterLefts: noted, isTrackingDone: false });
    });
    return () =>
      page.evaluate(() => {
        Object.assign(window, { isTrackingDone: true });
        return /** @type {number[]} */ (/** @type {any} */ (window).rosterLefts);
      });
  }

  /** @param {number[]} lefts */
  const isMonotonic = (lefts) => {
    const steps = lefts.slice(1).map((left, index) => left - lefts[index]);
    return steps.every((step) => step >= 0) || steps.every((step) => step <= 0);
  };

  test("a tap on Roster slides the pill's block from Team to Roster", async ({ page }) => {
    await openApp(page);
    await openLibertySheet(page);
    const thumb = page.locator("#teamSheet .pager-thumb");
    await thumb.evaluate((element) => {
      Object.assign(window, { thumbSlides: 0 });
      element.addEventListener("transitionrun", () => {
        /** @type {any} */ (window).thumbSlides += 1;
      });
    });

    await page.getByRole("tab", { name: "Roster" }).click();

    await expect
      .poll(() => page.evaluate(() => /** @type {any} */ (window).thumbSlides))
      .toBeGreaterThan(0);
    await expectShown(page.locator("#rosterSection"));
    await expect
      .poll(async () => {
        const [block, roster] = await Promise.all([
          thumb.boundingBox(),
          page.getByRole("tab", { name: "Roster" }).boundingBox(),
        ]);
        return Math.round(block.x - roster.x);
      })
      .toBe(0);
  });

  test("on a phone, a finger swiping a team's stats left brings in its roster, its pill following, and once it lifts, the roster settles without stepping back, changing nothing but the pills while the finger moves it", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    await openLibertySheet(page);
    await expectShown(page.locator("#teamSection"));
    await page.evaluate(() => {
      const changes = /** @type {string[]} */ ([]);
      new MutationObserver((records) =>
        changes.push(
          ...records
            .filter((record) => record.attributeName !== "style")
            .map((record) => record.attributeName ?? ""),
        ),
      ).observe(/** @type {Node} */ (document.getElementById("teamSheet")), {
        attributes: true,
        subtree: true,
      });
      Object.assign(window, { sheetChanges: changes });
    });
    const readLefts = await startTrackingRoster(page);

    const release = await drag(page, { x: 330, y: 400 }, { x: -250 }, { durationMs: 1000 });
    const swipe = await page
      .locator("#teamTabRoster")
      .evaluate((tab) => Number(getComputedStyle(tab).getPropertyValue("--nearness")));
    expect(swipe).toBeGreaterThan(0.2);
    expect(swipe).toBeLessThan(0.8);
    expect(await page.evaluate(() => /** @type {any} */ (window).sheetChanges)).toEqual([]);
    await release();
    await expectShown(page.locator("#rosterSection"));
    const lefts = await readLefts();

    expect(isMonotonic(lefts)).toBe(true);
    expect(lefts.at(-1)).toBe(0);
    expect(lefts[0]).toBeGreaterThan(0);
  });

  test("on a phone, a finger at the roster's left edge moves it right with the finger, and once it lifts, the roster slides on off the screen without stepping back", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const section = await openLibertyRoster(page);

    const release = await drag(page, { x: 60, y: 400 }, { x: 150 }, { durationMs: 1000 });
    expect(await readLeft(section)).toBeCloseTo(150, -1);
    const readLefts = await startTrackingRoster(page);
    await release();
    await expectShown(page.locator("#teamSection"));
    await expect.poll(() => readLeft(section)).toBe(PHONE.width);
    const lefts = await readLefts();

    expect(lefts.length).toBeGreaterThan(5);
    expect(lefts.every((left, index) => index === 0 || left >= lefts[index - 1])).toBe(true);
  });

  test("on a phone, a short swipe right at the roster's left edge springs back to the roster once the finger lifts", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const section = await openLibertyRoster(page);

    const release = await drag(page, { x: 60, y: 400 }, { x: 46 }, { durationMs: 1000 });
    expect(await readLeft(section)).toBeGreaterThan(30);
    await release();

    await expectShown(section);
    await expect(page.locator("#teamSheet .sheet-sections")).not.toHaveClass(/is-swiped/);
  });
});
