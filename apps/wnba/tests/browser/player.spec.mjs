import { test, expect, openApp, openGameSheet } from "./harness.mjs";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const PHONE = { width: 390, height: 844 };

/** @param {import("@playwright/test").Page} page */
async function openLibertyRoster(page) {
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
  await page.locator("#teamDialog").getByRole("button", { name: "Roster" }).click();
  const roster = page.locator("#rosterDialog");
  await expect(roster.locator(".roster-coach")).toBeVisible();
  return roster;
}

/**
 * Opens a player's sheet from her name on the roster, once her numbers have loaded.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function openFromRoster(page, name) {
  const roster = await openLibertyRoster(page);
  await roster.getByRole("button", { name }).click();
  const sheet = page.locator("#playerDialog");
  await expect(sheet.locator(".player-facts")).toBeVisible();
  return sheet;
}

test("a player's name on her roster opens her sheet over it: her facts, her last game over her averages, her playoff games, and her ranks", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openFromRoster(page, "Breanna Stewart");

  await expect(sheet.locator("#playerTitle")).toHaveText("Breanna Stewart");
  await expect(sheet.locator("#playerNote")).toHaveText("Liberty•#30•Connecticut");
  await expect(sheet.locator(".player-fact")).toHaveText([
    "PositionForward",
    "Age32",
    `Height6'4"`,
    "Debut2016",
  ]);
  await expect(sheet.locator(".player-game-line td")).toHaveText(["19", "2", "3", "40.0"]);
  await expect(sheet.locator(".player-average td")).toHaveText(["Avg20.8", "8.3", "3.3", "32.9"]);
  await expect(sheet.locator(".team-game .player-points")).toHaveText(["34Pts", "21Pts"]);
  await expect(sheet.locator(".player-rank-row")).toHaveCount(8);
  await expect(sheet.locator(".player-rank-row").first()).toHaveText(/Pts\s*20.8\s*7th of 125/);
  await expect(sheet.locator(".player-curve b")).toHaveCount(8);
  expect(await listOffScaleText(page)).toEqual([]);
  expect(await listStrayPeriods(page)).toEqual([]);

  await sheet.getByRole("button", { name: "Back to Roster" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#rosterDialog")).toBeVisible();
});

test("her last game's AVG hangs left of the four columns, which center on the sheet by themselves", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openApp(page);
  const sheet = await openFromRoster(page, "Breanna Stewart");
  const [table, label, sheetBox] = await Promise.all(
    [sheet.locator("table.player-game"), sheet.locator(".player-average-label"), sheet].map(
      (locator) => locator.boundingBox(),
    ),
  );
  if (!table || !label || !sheetBox) throw new Error("not shown");

  expect(Math.abs(table.x + table.width / 2 - (sheetBox.x + sheetBox.width / 2))).toBeLessThan(1);
  expect(label.x + label.width).toBeLessThanOrEqual(table.x);
});

test("her name, team, and facts share a tinted band over a hairline, as the team's sheet under it does, each fact centered under its label", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openFromRoster(page, "Breanna Stewart");
  /** @param {import("@playwright/test").Locator} dialog */
  const readBand = (dialog) =>
    dialog.locator(".sheet-top").evaluate((top) => {
      const style = getComputedStyle(top);
      return [style.backgroundColor, style.borderBottomWidth, style.borderBottomColor];
    });

  expect(await readBand(sheet)).toEqual(await readBand(page.locator("#teamDialog")));
  // Each part stretches across its fact, so its words' own box shows where they sit.
  const [label, value] = await sheet
    .locator(".player-fact")
    .first()
    .evaluate((fact) =>
      [...fact.children].map((part) => {
        const words = document.createRange();
        words.selectNodeContents(part);
        const box = words.getBoundingClientRect();
        return box.left + box.width / 2;
      }),
    );
  expect(Math.abs(label - value)).toBeLessThan(1);
});

test("a player out while her team still plays says so beside her name, and one who hasn't played says she has no games yet", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openFromRoster(page, "Elizabeth Balogun");

  await expect(sheet.locator("#playerTitle")).toHaveText("Elizabeth BalogunOut");
  await expect(sheet.locator(".sheet-message")).toHaveText("No games yet this season");
  await expect(sheet.locator(".player-dnp").first()).toHaveText("DNP");
});

test("a player short of the WNBA's rule shows her numbers without a rank, and says why", async ({
  page,
}) => {
  await openApp(page);
  const sheet = await openFromRoster(page, "Leonie Fiebich");

  await expect(sheet.locator(".player-rank-place")).toHaveText(["7th"]);
  await expect(sheet.locator(".player-rank-note")).toHaveText(
    "Not ranked until she's played 31 games, or for a percentage, made enough shots. She's played 21.",
  );
  expect(await listStrayPeriods(page)).toEqual([]);
});

test("a top scorer's name in a box score opens her sheet over the game's, and a leader's name on a team's sheet over the team's", async ({
  page,
}) => {
  await openApp(page);
  const game = await openGameSheet(page, "Game details: Aces at Fever, First Round Game 2");
  await game.getByRole("button", { name: "A'ja Wilson" }).click();
  const sheet = page.locator("#playerDialog");
  await expect(sheet.locator("#playerTitle")).toHaveText("A'ja Wilson");
  await expect(sheet.getByRole("button", { name: "Back to Game" })).toBeVisible();

  await sheet.getByRole("button", { name: "Back to Game" }).click();
  await expect(sheet).toBeHidden();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.getByRole("button", { name: "Team details: New York Liberty" }).first().click();
  await page.locator("#teamDialog").getByRole("button", { name: "Breanna Stewart" }).click();
  await expect(sheet.locator("#playerTitle")).toHaveText("Breanna Stewart");
  await expect(sheet.getByRole("button", { name: "Back to Team" })).toBeVisible();
});

test("her sheet, which reads her numbers again, the roster, and the team's sheet open again on a reload", async ({
  page,
}) => {
  await openApp(page);
  await openFromRoster(page, "Breanna Stewart");

  const reread = page.waitForRequest(/\/player\?id=1627668&team=NYL&season=2026$/);
  await page.reload();
  await reread;

  const sheet = page.locator("#playerDialog");
  await expect(sheet.locator(".player-curve b")).toHaveCount(8);
  await sheet.getByRole("button", { name: "Back to Roster" }).click();
  await expect(page.locator("#rosterDialog .roster-coach")).toBeVisible();
});
