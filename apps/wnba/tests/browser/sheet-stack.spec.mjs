import { test, expect, openApp } from "./harness.mjs";
import { recordSheetMotions } from "../../../../tests/browser/sheet-motions.mjs";
import { drag } from "../../../../tests/browser/touch.mjs";

const PHONE = { width: 390, height: 844 };
const ACES_AT_FEVER = "Game details: Aces at Fever, First Round Game 2";

/**
 * Opens the Aces at the Fever's sheet, from the Previous games, then the Fever's over it.
 * @param {import("@playwright/test").Page} page
 */
async function openFeverOverGame(page) {
  await page.getByRole("tab", { name: "Games" }).click();
  await page.getByRole("tab", { name: "Previous" }).click();
  const list = page.locator("#games-previous");
  await expect(list).not.toHaveAttribute("inert");
  await list.getByRole("button", { name: ACES_AT_FEVER }).click();
  const gameSheet = page.locator("#gameDialog");
  await expect(gameSheet.locator(".line-score")).toBeVisible();
  await gameSheet
    .locator(".faceoff")
    .getByRole("button", { name: "Team details: Indiana Fever" })
    .click();
  const teamSheet = page.locator("#teamDialog");
  await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");
  return { gameSheet, teamSheet };
}

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("every sheet bands its top alike, in the same tint over the same hairline, which a game's face-off draws under its teams", async ({
    page,
  }) => {
    await openApp(page);
    const { teamSheet } = await openFeverOverGame(page);
    await teamSheet.getByRole("button", { name: "Roster" }).click();
    await page.locator("#rosterDialog").getByRole("button", { name: "Aliyah Boston" }).click();
    await expect(page.locator("#playerDialog .player-facts")).toBeVisible();
    // Where each sheet's band ends: a game's runs on through its face-off.
    const bandEnds = {
      gameDialog: ".faceoff",
      teamDialog: ".sheet-top",
      rosterDialog: ".sheet-top",
      playerDialog: ".sheet-top",
    };

    const sheets = await page.locator("dialog.sheet-panel").evaluateAll(
      (dialogs, ends) =>
        dialogs.map((dialog) => {
          const top = getComputedStyle(dialog.querySelector(".sheet-top"));
          const end = ends[dialog.id] && getComputedStyle(dialog.querySelector(ends[dialog.id]));
          return {
            id: dialog.id,
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
    const { gameSheet, teamSheet } = await openFeverOverGame(page);
    const forward = gameSheet.getByRole("button", { name: "Forward to Fever" });
    await expect(forward).toBeHidden();

    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await expect(teamSheet).toBeHidden();
    await expect(forward).toHaveText("Fever");

    await forward.click();
    await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");
    await expect(
      teamSheet.getByRole("button", { name: "Back to Game", exact: true }),
    ).toBeVisible();

    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await gameSheet
      .locator(".faceoff")
      .getByRole("button", { name: "Team details: Las Vegas Aces" })
      .click();
    await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
    await expect(gameSheet.getByRole("button", { name: "Forward to Aces" })).toBeVisible();
  });

  test("on a phone, a sheet covered by another stays drawn, low enough that none of it shows past the other's rounded corners", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverOverGame(page);
    const readTop = (sheet) => sheet.evaluate((dialog) => dialog.getBoundingClientRect().top);
    const radius = await teamSheet.evaluate((dialog) =>
      parseFloat(getComputedStyle(dialog).borderTopLeftRadius),
    );

    await expect(gameSheet).toHaveCSS("visibility", "visible");
    expect(await readTop(gameSheet)).toBeGreaterThanOrEqual((await readTop(teamSheet)) + radius);
  });

  test("on a phone, a swipe right goes back to the game, a swipe left goes forward to the team again, and a swipe down closes both", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverOverGame(page);
    const gameBox = await gameSheet.boundingBox();
    const teamBox = await teamSheet.boundingBox();
    expect(teamBox?.height).toBeGreaterThanOrEqual(gameBox?.height ?? Infinity);

    await (
      await drag(page, { x: 60, y: 400 }, { x: 250 })
    )();
    await expect(teamSheet).toBeHidden();
    await expect(gameSheet).not.toHaveAttribute("data-covered");

    await (
      await drag(page, { x: 330, y: 400 }, { x: -250 })
    )();
    await expect(teamSheet.locator("#teamTitle")).toHaveText("Indiana Fever");
    await expect(
      teamSheet.getByRole("button", { name: "Back to Game", exact: true }),
    ).toBeVisible();

    await (
      await drag(page, { x: 200, y: 120 }, { y: 300 })
    )();
    await expect(teamSheet).toBeHidden();
    await expect(gameSheet).toBeHidden();
  });

  test("on a phone, a swipe right moves the team with the finger, and a short one springs back, leaving it over the game", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openApp(page);
    const { gameSheet, teamSheet } = await openFeverOverGame(page);

    const release = await drag(page, { x: 60, y: 400 }, { x: 40 });
    await expect(teamSheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 40, 0)");
    await release();

    await expect(teamSheet).not.toHaveAttribute("data-dragged");
    await expect(teamSheet).toHaveCSS("transform", "none");
    await expect(teamSheet).toBeVisible();
    await expect(gameSheet).toHaveAttribute("data-covered");
  });
});

test("a team's sheet slides in from the right over the game's, which dims and steps aside, and slides away again on the back button", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const readMotions = await recordSheetMotions(page);
  await openApp(page);
  const { gameSheet, teamSheet } = await openFeverOverGame(page);

  expect(await readMotions()).toContainEqual({
    id: "teamDialog",
    part: "sheet",
    name: "sheet-push",
  });
  await expect(gameSheet).toHaveCSS("filter", "brightness(0.75)");
  await expect
    .poll(() =>
      gameSheet.evaluate((dialog) => {
        const { m41, m42 } = new DOMMatrix(getComputedStyle(dialog).transform);
        return [Math.round(m41), m42];
      }),
    )
    .toEqual([Math.round(-0.28 * PHONE.width), 24]);

  await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
  expect(await readMotions()).toContainEqual({
    id: "teamDialog",
    part: "sheet",
    to: { transform: "translateX(100%)" },
  });
  await expect(teamSheet).toBeHidden();
  await expect(gameSheet).toHaveCSS("filter", "none");
});

test("on a phone, a swipe back and forth moves the sheets with the finger, never running an opening motion again", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const readMotions = await recordSheetMotions(page);
  await openApp(page);
  const { teamSheet } = await openFeverOverGame(page);
  await readMotions();

  await (
    await drag(page, { x: 60, y: 400 }, { x: 250 })
  )();
  await expect(teamSheet).toBeHidden();
  await (
    await drag(page, { x: 330, y: 400 }, { x: -250 })
  )();
  await expect(teamSheet.getByRole("button", { name: "Back to Game", exact: true })).toBeVisible();

  const motions = await readMotions();
  expect(motions.filter((motion) => motion.name)).toEqual([]);
});
