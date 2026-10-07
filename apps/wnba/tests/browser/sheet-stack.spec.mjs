import { test, expect, openApp } from "./harness.mjs";
import { recordSheetMotions } from "../../../../tests/browser/sheet-motions.mjs";
import { expectShown, readLeft } from "../../../../tests/browser/sheet-row.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";

const PHONE = { width: 390, height: 844 };
const ACES_AT_FEVER = "Game details: Aces at Fever, First Round Game 2";

/**
 * Opens the Aces at the Fever's sheet, from the Previous games.
 * @param {import("@playwright/test").Page} page
 */
async function openGame(page) {
  await page.getByRole("tab", { name: "Games" }).click();
  await page.getByRole("tab", { name: "Previous" }).click();
  const list = page.locator("#games-previous");
  await expect(list).not.toHaveAttribute("inert");
  await list.getByRole("button", { name: ACES_AT_FEVER }).click();
  const gameSheet = page.locator("#gameSheet");
  await expect(gameSheet.locator(".line-score")).toBeVisible();
  return gameSheet;
}

/**
 * Opens the Aces at the Fever's sheet, then the Fever's beside it.
 * @param {import("@playwright/test").Page} page
 */
async function openFeverFromGame(page) {
  const gameSheet = await openGame(page);
  await gameSheet
    .locator(".faceoff")
    .getByRole("button", { name: "Team details: Indiana Fever" })
    .click();
  const teamSheet = page.locator("#teamSheet");
  await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");
  await expectShown(teamSheet);
  return { gameSheet, teamSheet };
}

/**
 * Notes where a sheet is on each frame it's in the row, until the returned function stops and
 * reads the notes.
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function startTrackingLeft(page, id) {
  await page.evaluate((sheetId) => {
    const sheet = /** @type {HTMLElement} */ (document.getElementById(sheetId));
    const row = /** @type {Element} */ (sheet.closest(".sheet-row"));
    const lefts = /** @type {number[]} */ ([]);
    const note = () => {
      if (!sheet.hidden)
        lefts.push(Math.round(sheet.getBoundingClientRect().x - row.getBoundingClientRect().x));
      if (!(/** @type {any} */ (window).isTrackingDone)) requestAnimationFrame(note);
    };
    Object.assign(window, { trackedLefts: lefts, isTrackingDone: false });
    requestAnimationFrame(note);
  }, id);
  return () =>
    page.evaluate(() => {
      Object.assign(window, { isTrackingDone: true });
      return /** @type {number[]} */ (/** @type {any} */ (window).trackedLefts);
    });
}

/**
 * Where the player's sheet and the game's are, read on one frame, once the row has stopped moving
 * under a finger held still: the browser may still be applying the finger's last moves.
 * @param {import("@playwright/test").Page} page
 */
const readRestingLefts = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const row = /** @type {Element} */ (document.querySelector("#sheetDialog .sheet-row"));
        const readLeft = (/** @type {string} */ selector) =>
          /** @type {Element} */ (document.querySelector(selector)).getBoundingClientRect().x -
          row.getBoundingClientRect().x;
        const read = () => ({
          playerLeft: readLeft("#playerSheet"),
          gameLeft: readLeft("#gameSheet"),
        });
        let last = read();
        const readOnRest = () =>
          requestAnimationFrame(() => {
            const now = read();
            if (now.playerLeft === last.playerLeft) resolve(now);
            else {
              last = now;
              readOnRest();
            }
          });
        readOnRest();
      }),
  );

/**
 * Whether each step goes the same way as the first, never back.
 * @param {number[]} lefts
 */
function isMonotonic(lefts) {
  const steps = lefts.slice(1).map((left, index) => left - lefts[index]);
  return steps.every((step) => step >= 0) || steps.every((step) => step <= 0);
}

/**
 * Whether the sheet was seen somewhere between where it started and where it ended, as in a
 * slide and never in a jump. A busy machine draws only a few of a slide's frames, so how many
 * places it was seen in says nothing.
 * @param {number[]} lefts
 */
function hasStopOnTheWay(lefts) {
  const [low, high] = [Math.min(lefts[0], lefts.at(-1)), Math.max(lefts[0], lefts.at(-1))];
  return lefts.some((left) => left > low && left < high);
}

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no sheet sets its top apart with a tint or a line, so two sheets side by side show no edge where one ends, nor a game's face-off under its teams", async ({
    page,
  }) => {
    await openApp(page);
    const { teamSheet } = await openFeverFromGame(page);
    await teamSheet.getByRole("tab", { name: "Roster" }).click();
    await page.locator("#rosterSection").getByRole("button", { name: "Aliyah Boston" }).click();
    await expect(page.locator("#playerSheet .player-facts")).toBeVisible();

    const sheets = await page.locator(".sheet-page").evaluateAll((pages) =>
      pages.map((sheet) => {
        const sheetColor = getComputedStyle(sheet).backgroundColor;
        const tops = [...sheet.querySelectorAll(".sheet-top, .faceoff")].map((element) => {
          const style = getComputedStyle(element);
          const isClear = style.backgroundColor === "rgba(0, 0, 0, 0)";
          return {
            isSheetColor: isClear || style.backgroundColor === sheetColor,
            border: style.borderBottomWidth,
            shadow: style.boxShadow,
          };
        });
        return { id: sheet.id, tops };
      }),
    );

    expect(sheets.map((sheet) => sheet.id)).toEqual(["gameSheet", "teamSheet", "playerSheet"]);
    expect(sheets[0].tops).toHaveLength(2);
    for (const sheet of sheets)
      for (const top of sheet.tops)
        expect(top, sheet.id).toEqual({ isSheetColor: true, border: "0px", shadow: "none" });
  });

  for (const theme of ["light", "dark"])
    test(`in ${theme}, every sheet, its roster's pinned cells, and settings are the page's own color, so the cards in them are raised as on the page`, async ({
      page,
    }) => {
      await openApp(page);
      await page.evaluate((name) => (document.documentElement.dataset.theme = name), theme);
      const { teamSheet } = await openFeverFromGame(page);
      await teamSheet.getByRole("tab", { name: "Roster" }).click();
      const roster = page.locator("#rosterSection");
      await roster.getByRole("button", { name: "Aliyah Boston" }).click();
      await expect(page.locator("#playerSheet .player-facts")).toBeVisible();
      const floor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      const sheetColors = await page
        .locator(".sheet-page")
        .evaluateAll((sheets) => sheets.map((sheet) => getComputedStyle(sheet).backgroundColor));
      const pinnedColors = await roster
        .locator("table.roster :is(thead, .roster-player)")
        .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor));
      expect(sheetColors).toEqual([floor, floor, floor]);
      expect(new Set(pinnedColors)).toEqual(new Set([floor]));

      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(page.locator(".settings-panel")).toHaveCSS("background-color", floor);
    });

  test("on a phone, every sheet fills the screen, whatever it holds", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);
    const dialog = page.locator("#sheetDialog");

    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, ...PHONE });
    const readHeight = (locator) => locator.evaluate((element) => element.offsetHeight);
    expect(await readHeight(teamSheet)).toBe(PHONE.height);
    expect(await readHeight(gameSheet)).toBe(PHONE.height);
  });

  test("on a phone, sheets have square corners and no shadow, nothing dims the page or the sheet a sheet slides in beside, and the row never moves past its first or last sheet", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);
    const dialog = page.locator("#sheetDialog");

    await expect(dialog).toHaveCSS("border-top-left-radius", "0px");
    await expect(dialog).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(
      await dialog.evaluate((element) => getComputedStyle(element, "::backdrop").backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    await expect(dialog.locator(".sheet-row")).toHaveCSS("overscroll-behavior-x", "none");
    for (const sheet of [gameSheet, teamSheet]) {
      await expect(sheet).toHaveCSS("border-top-left-radius", "0px");
      await expect(sheet).toHaveCSS("box-shadow", "none");
      await expect(sheet).toHaveCSS("filter", "none");
    }
  });

  test("on a phone, a swipe right goes back to the game and takes the team's sheet away, so a swipe left leaves the game where it is, and a swipe down closes it", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);

    await (
      await drag(page, { x: 60, y: 400 }, { x: 250 })
    )();
    await expectShown(gameSheet);
    await expect(teamSheet).toBeHidden();

    await (
      await drag(page, { x: 330, y: 400 }, { x: -250 })
    )();
    await expectShown(gameSheet);
    await expect(teamSheet).toBeHidden();

    await (
      await drag(page, { x: 200, y: 120 }, { y: 300 })
    )();
    await expect(page.locator("#sheetDialog")).toBeHidden();
  });

  test("on a phone, a short swipe right springs back to the team once the finger lifts", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { teamSheet } = await openFeverFromGame(page);

    const release = await drag(page, { x: 60, y: 400 }, { x: 46 }, { durationMs: 1000 });
    expect(await readLeft(teamSheet)).toBeGreaterThan(30);
    await release();

    await expectShown(teamSheet);
  });
});

test("a team's sheet slides in from the right beside the game's, and slides away again on the back button, a frame at a time, leaving the row once it's gone", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const { gameSheet, teamSheet } = await openFeverFromGame(page);
  expect(await readLeft(gameSheet)).toBe(-PHONE.width);

  const readLefts = await startTrackingLeft(page, "teamSheet");
  await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
  await expectShown(gameSheet);
  await expect(teamSheet).toBeHidden();
  const lefts = await readLefts();
  expect(hasStopOnTheWay(lefts)).toBe(true);
  expect(isMonotonic(lefts)).toBe(true);
  expect(lefts.at(-1)).toBeGreaterThan(lefts[0]);
});

test("on a phone, a finger moving a player's sheet moves the game's beside it, without the page changing anything, and the sheets settle without stepping back or running an opening motion", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const readMotions = await recordSheetMotions(page);
  await openApp(page);
  const gameSheet = await openGame(page);
  await gameSheet.locator(".players .player-open").first().click();
  await expectShown(page.locator("#playerSheet"));
  await readMotions();
  await page.evaluate(() => {
    const changes = /** @type {string[]} */ ([]);
    new MutationObserver((records) =>
      changes.push(...records.map((record) => record.attributeName ?? "")),
    ).observe(/** @type {Node} */ (document.getElementById("sheetDialog")), {
      attributes: true,
      subtree: true,
    });
    Object.assign(window, { sheetChanges: changes });
  });

  const release = await drag(page, { x: 60, y: 400 }, { x: 250 });
  const { playerLeft, gameLeft } = await readRestingLefts(page);
  expect(playerLeft).toBeGreaterThan(PHONE.width / 2);
  expect(gameLeft).toBe(playerLeft - PHONE.width);
  expect(await page.evaluate(() => /** @type {any} */ (window).sheetChanges)).toEqual([]);

  const readLefts = await startTrackingLeft(page, "playerSheet");
  await release();
  await expectShown(gameSheet);
  await expect(page.locator("#playerSheet")).toBeHidden();
  const lefts = await readLefts();

  expect(isMonotonic(lefts)).toBe(true);
  expect(lefts.at(-1)).toBeGreaterThan(lefts[0]);
  expect(await readMotions()).toEqual([]);
});
