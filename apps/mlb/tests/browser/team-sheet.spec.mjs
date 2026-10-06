import {
  test,
  expect,
  openApp,
  openSettings,
  buildFixtureSnapshot,
  buildSnapshotWithStarters,
  EVENING_FIXTURE,
  ON_A_PHONE,
} from "./harness.mjs";
import { expectShown, expectSteppedAway } from "../../../../tests/browser/sheet-row.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

const ASTROS_AT_ATHLETICS = "Pitching matchup: Blubaugh vs Springs";

/** @param {import("@playwright/test").Page} page */
async function showGames(page) {
  await openApp(page, { snapshots: { 2026: buildSnapshotWithStarters() } });
  await page.getByRole("tab", { name: "Games" }).click();
  return page.getByRole("button", { name: ASTROS_AT_ATHLETICS });
}

test("a game's row names its clubs plainly, and a tap anywhere on it, their names too, opens the matchup", async ({
  page,
}) => {
  const gameButton = await showGames(page);
  const row = gameButton.locator("xpath=..");
  await expect(row.getByRole("button", { name: /^Team details/ })).toHaveCount(0);

  // The row's button lies over its names, so a click on a name lands on it.
  await row.scrollIntoViewIfNeeded();
  const astros = await row.locator(".game-side.away .club").boundingBox();
  if (!astros) throw new Error("The Astros' name isn't shown");
  await page.mouse.click(astros.x + astros.width / 2, astros.y + astros.height / 2);
  await expect(page.locator("#matchupSheet")).toBeVisible();
  await expect(page.locator("#teamSheet")).toBeHidden();
});

test("a club's sheet open over the matchup on a reload shows again over it, and its Done closes both", async ({
  page,
}) => {
  await (await showGames(page)).click();
  const matchup = page.locator("#matchupSheet");
  await matchup.getByRole("button", { name: "Team details: Astros" }).first().click();
  const teamSheet = page.locator("#teamSheet");
  await expect(teamSheet.locator("#teamTitle")).toHaveText("Astros");

  await page.reload();

  await expect(teamSheet.locator("#teamTitle")).toHaveText("Astros");
  await expect(teamSheet.locator("#teamNote")).toContainText("AL West");
  await expect(teamSheet.getByRole("button", { name: "Back to Game", exact: true })).toBeVisible();
  await teamSheet.getByRole("button", { name: "Done" }).click();
  await expect(teamSheet).toBeHidden();
  await expect(matchup).toBeHidden();
});

// The White Sox clinching with their 9-1 win at Kansas City, one of the evening's finals.
function buildSnapshotWithClinch() {
  const snapshot = buildFixtureSnapshot(EVENING_FIXTURE);
  snapshot.log = [
    {
      at: "2026-09-24T20:50:00Z",
      kind: "berth",
      team: "CWS",
      what: "playoff",
      via: [{ team: "CWS", won: true, opp: "KC", score: [9, 1] }],
    },
  ];
  return snapshot;
}

/** @param {import("@playwright/test").Page} page */
async function showClinch(page) {
  await openApp(page, { snapshots: { 2026: buildSnapshotWithClinch() } });
  const update = page.locator("#updates li").first();
  await expect(update.locator(".what")).toContainText("White Sox");
  return update;
}

/**
 * Taps the middle of `target` with a finger.
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} target
 */
async function tapOn(page, target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("on a phone", () => {
  test.use(ON_A_PHONE);

  test("an update about a game opens its matchup", async ({ page }) => {
    const update = await showClinch(page);

    await tapOn(page, update.getByRole("button", { name: /^Pitching matchup/ }));

    await expect(page.locator("#matchupBody")).toContainText(/White Sox[\s\S]*Royals/);
    await expect(page.locator("#teamSheet")).toBeHidden();
  });

  test("a tap on a club's name in an update about a game opens the game's matchup", async ({
    page,
  }) => {
    const update = await showClinch(page);
    await tapOn(page, update.getByRole("button", { name: "Team details: White Sox" }));

    await expect(page.locator("#matchupBody")).toContainText(/White Sox[\s\S]*Royals/);
    await expect(page.locator("#teamSheet")).toBeHidden();
  });

  test("a tap on a club's name in a game's row opens the matchup, since a thumb lands on a name easily", async ({
    page,
  }) => {
    const gameButton = await showGames(page);
    await tapOn(page, gameButton.locator("xpath=..").locator(".game-side.away .club"));

    await expect(page.locator("#matchupSheet")).toBeVisible();
    await expect(page.locator("#teamSheet")).toBeHidden();
  });
});

test("a club's name in the matchup opens its sheet over it, whose back button goes back to the matchup", async ({
  page,
}) => {
  await (await showGames(page)).click();
  const matchup = page.locator("#matchupSheet");
  await matchup.getByRole("button", { name: "Team details: Athletics" }).first().click();
  const teamSheet = page.locator("#teamSheet");

  await expect(teamSheet.locator("#teamTitle")).toHaveText("Athletics");
  await expectShown(teamSheet);
  await expectSteppedAway(matchup);
  await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
  await expect(teamSheet).toBeHidden();
  await expectShown(matchup);
});

test("a club's row in the standings opens its sheet, with its race and titles, and Done closes it", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.locator('.div-grid tr[data-team="SEA"] td.mid').first().click();
  const sheet = page.locator("#teamSheet");

  await expect(sheet.locator("#teamTitle")).toHaveText(/Mariners/);
  await expect(sheet.locator(".sheet-part h3")).toHaveText(["Season", "Titles"]);
  await expect(sheet.locator(".team-stat .team-label").first()).toHaveText("AL West");
  await expect(sheet.locator(".team-detail .team-label")).toHaveText("Next");
  await expect(sheet.locator(".team-titles")).toHaveText("None yet");
  await expect(sheet).toContainText("Since 1977");

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
});

test("a club in the bracket opens its sheet", async ({ page }) => {
  await openApp(page);
  const club = page.locator("#bracketWrap .team-id .team-open").first();
  const name = await club.locator(".team-name").textContent();
  await club.click();

  await expect(page.locator("#teamSheet #teamTitle")).toHaveText(new RegExp(name));
});

test("a club in the ranking stays a handle to drag, not a way to its sheet", async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  const firstClub = page.locator("#rankList .rank-item .club").first();
  await expect(firstClub).toBeVisible();

  await expect(page.locator("#rankList .team-open")).toHaveCount(0);
  await firstClub.click();
  await expect(page.locator("#teamSheet")).toBeHidden();
});

test("a club's sheet title is its dot and name, in the page's own type, not in capitals, over gold part titles and green labels", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.locator('.div-grid tr[data-team="SEA"] .team-open').click();
  const title = page.locator("#teamSheet #teamTitle");

  await expect(title.locator(".dot")).toBeVisible();
  await expect(title).toHaveCSS("font-family", /^"Chivo Mono"/);
  await expect(title).toHaveCSS("text-transform", "none");
  await expect(page.locator("#teamSheet .sheet-part h3").first()).toHaveCSS(
    "color",
    "rgb(244, 193, 92)",
  );
  await expect(page.locator("#teamSheet .team-detail .team-label")).toHaveCSS(
    "color",
    "rgb(127, 168, 143)",
  );
});

test("a page last left on the Teams tab, which it no longer has, opens on the bracket", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("lastTab", "reference"));
  await openApp(page);

  await expect(page.getByRole("tab", { name: "Bracket" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#view-bracket")).toBeVisible();
});

test("a club's name under the pointer shifts its color a little toward the accent, with no underline", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Standings" }).click();
  const name = page.locator('.div-grid tr[data-team="SEA"] .team-open').locator(".team-name");
  const readColor = () => name.evaluate((element) => getComputedStyle(element).color);
  const before = await readColor();
  await name.hover();

  await expect.poll(readColor).not.toBe(before);
  await expect(name).toHaveCSS("text-decoration-line", "none");
});
