import { test, expect, openApp } from "./harness.mjs";
import { recordSheetMotions } from "../../../../tests/browser/sheet-motions.mjs";
import { expectShown, expectSteppedAway, readLeft } from "../../../../tests/browser/sheet-row.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";

const PHONE = { width: 390, height: 844 };
const ACES_AT_FEVER = "Game details: Aces at Fever, First Round Game 2";
// A sheet the next one covers sits this share of the screen's width to the left, as sheet.css
// moves it.
const UNDER_SHIFT = 0.28;

/**
 * Opens the Aces at the Fever's sheet, from the Previous games, then the Fever's beside it.
 * @param {import("@playwright/test").Page} page
 */
async function openFeverFromGame(page) {
  await page.getByRole("tab", { name: "Games" }).click();
  await page.getByRole("tab", { name: "Previous" }).click();
  const list = page.locator("#games-previous");
  await expect(list).not.toHaveAttribute("inert");
  await list.getByRole("button", { name: ACES_AT_FEVER }).click();
  const gameSheet = page.locator("#gameSheet");
  await expect(gameSheet.locator(".line-score")).toBeVisible();
  await gameSheet
    .locator(".faceoff")
    .getByRole("button", { name: "Team details: Indiana Fever" })
    .click();
  const teamSheet = page.locator("#teamSheet");
  await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");
  await expectShown(teamSheet);
  return { gameSheet, teamSheet };
}

/** @param {import("@playwright/test").Locator} sheet */
const findContent = (sheet) => sheet.locator(":scope > .sheet-content");

/**
 * Notes where a sheet is on each frame, until the returned function stops and reads the notes.
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 */
async function startTrackingLeft(page, id) {
  await page.evaluate((sheetId) => {
    const sheet = /** @type {HTMLElement} */ (document.getElementById(sheetId));
    const row = /** @type {Element} */ (sheet.closest(".sheet-row"));
    const lefts = /** @type {number[]} */ ([]);
    const note = () => {
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
 * Where the team's sheet and the game's content are, read on one frame, once the row has stopped
 * moving under a finger held still: the browser may still be applying the finger's last moves.
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
          teamLeft: readLeft("#teamSheet"),
          gameLeft: readLeft("#gameSheet > .sheet-content"),
        });
        let last = read();
        const readOnRest = () =>
          requestAnimationFrame(() => {
            const now = read();
            if (now.teamLeft === last.teamLeft) resolve(now);
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

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("every sheet bands its top alike, in the same tint over the same hairline, which a game's face-off draws under its teams", async ({
    page,
  }) => {
    await openApp(page);
    const { teamSheet } = await openFeverFromGame(page);
    await teamSheet.getByRole("button", { name: "Roster" }).click();
    await page.locator("#rosterSheet").getByRole("button", { name: "Aliyah Boston" }).click();
    await expect(page.locator("#playerSheet .player-facts")).toBeVisible();
    // Where each sheet's band ends: a game's runs on through its face-off.
    const bandEnds = {
      gameSheet: ".faceoff",
      teamSheet: ".sheet-top",
      rosterSheet: ".sheet-top",
      playerSheet: ".sheet-top",
    };

    const sheets = await page.locator(".sheet-page").evaluateAll(
      (pages, ends) =>
        pages.map((sheet) => {
          const top = getComputedStyle(sheet.querySelector(".sheet-top"));
          const end = ends[sheet.id] && getComputedStyle(sheet.querySelector(ends[sheet.id]));
          return {
            id: sheet.id,
            band: [top.backgroundColor, end?.borderBottomWidth, end?.borderBottomColor],
          };
        }),
      bandEnds,
    );

    expect(sheets.map((sheet) => sheet.id)).toEqual(Object.keys(bandEnds));
    const [first, ...rest] = sheets;
    for (const sheet of rest) expect(sheet.band, sheet.id).toEqual(first.band);
    expect(first.band[1]).toBe("1px");
  });

  test("going back from a team leaves a forward button on the game that names the team and goes to it again, until another opens", async ({
    page,
  }) => {
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);
    const forward = gameSheet.getByRole("button", { name: "Forward to Fever" });

    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await expectShown(gameSheet);
    await expect(forward).toHaveText("Fever");

    await forward.click();
    await expectShown(teamSheet);
    await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");

    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await expectShown(gameSheet);
    await gameSheet
      .locator(".faceoff")
      .getByRole("button", { name: "Team details: Las Vegas Aces" })
      .click();
    await expectShown(teamSheet);
    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await expect(gameSheet.getByRole("button", { name: "Forward to Aces" })).toBeVisible();
  });

  test("on a phone, every sheet is as tall as the screen allows, whatever it holds", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);
    const dialog = page.locator("#sheetDialog");

    const readHeight = (locator) => locator.evaluate((element) => element.offsetHeight);
    expect(await readHeight(dialog)).toBe(PHONE.height - 44);
    expect(await readHeight(teamSheet)).toBe(await readHeight(gameSheet));
  });

  test("on a phone, each sheet rounds its leading corner inside the dialog's, the band of the one it slides in over running on under it, and the row never moves past its first or last sheet", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);
    const dialog = page.locator("#sheetDialog");

    await expect(dialog).toHaveCSS("border-top-left-radius", "22px");
    await expect(dialog).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(dialog.locator(".sheet-row")).toHaveCSS("overscroll-behavior-x", "none");
    for (const sheet of [gameSheet, teamSheet]) {
      await expect(sheet).toHaveCSS("border-top-left-radius", "22px 21px");
      const band = await sheet
        .locator(".sheet-top")
        .evaluate((top) => getComputedStyle(top).backgroundColor);
      await expect(sheet).toHaveCSS("box-shadow", `${band} 22px 0px 0px 0px`);
    }
  });

  test("on a phone, a swipe right goes back to the game, a swipe left goes forward to the team again, and a swipe down closes both", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverFromGame(page);

    await (
      await drag(page, { x: 60, y: 400 }, { x: 250 })
    )();
    await expectShown(gameSheet);
    await expectSteppedAway(teamSheet);

    await (
      await drag(page, { x: 330, y: 400 }, { x: -250 })
    )();
    await expectShown(teamSheet);
    await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");

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

test("a team's sheet slides in from the right beside the game's, which slides a little way left under it and dims, and slides away again on the back button, a frame at a time", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const { gameSheet, teamSheet } = await openFeverFromGame(page);

  expect(await readLeft(findContent(gameSheet))).toBeCloseTo(-UNDER_SHIFT * PHONE.width, 1);
  await expect(gameSheet).toHaveCSS("filter", "brightness(0.75)");

  const readLefts = await startTrackingLeft(page, "teamSheet");
  await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
  await expectShown(gameSheet);
  const lefts = await readLefts();

  expect(lefts.at(-1)).toBe(PHONE.width);
  expect(new Set(lefts).size).toBeGreaterThan(5);
  expect(isMonotonic(lefts)).toBe(true);
  await expect(gameSheet).toHaveCSS("filter", "brightness(1)");
});

test("on a phone, a finger moving the team's sheet moves the game's under it at a fraction of its pace, without the page changing anything, and the sheets settle without stepping back or running an opening motion", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const readMotions = await recordSheetMotions(page);
  await openApp(page);
  const { gameSheet } = await openFeverFromGame(page);
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
  const { teamLeft, gameLeft } = await readRestingLefts(page);
  expect(teamLeft).toBeGreaterThan(PHONE.width / 2);
  expect(gameLeft).toBeCloseTo(-UNDER_SHIFT * (PHONE.width - teamLeft), 0);
  expect(await page.evaluate(() => /** @type {any} */ (window).sheetChanges)).toEqual([]);

  const readLefts = await startTrackingLeft(page, "teamSheet");
  await release();
  await expectShown(gameSheet);
  const lefts = await readLefts();

  expect(isMonotonic(lefts)).toBe(true);
  expect(lefts.at(-1)).toBe(PHONE.width);
  const motions = await readMotions();
  expect(motions.filter((motion) => motion.name && motion.name !== "sheet-page-under")).toEqual([]);
});
