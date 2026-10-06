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
    await expect(teamSheet.getByRole("button", { name: "Back to Game 2" })).toBeVisible();

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
      gameSheet.evaluate((dialog) => new DOMMatrix(getComputedStyle(dialog).transform).m41),
    )
    .toBeCloseTo(-0.28 * PHONE.width, 0);

  await teamSheet.getByRole("button", { name: "Back to Game 2" }).click();
  expect(await readMotions()).toContainEqual({
    id: "teamDialog",
    part: "sheet",
    to: { transform: "translateX(100%)" },
  });
  await expect(teamSheet).toBeHidden();
  await expect(gameSheet).toHaveCSS("filter", "none");
});
