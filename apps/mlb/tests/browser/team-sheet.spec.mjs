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

const ASTROS_AT_ATHLETICS = "Game details: Astros at Athletics, Thu, Sep 24";

/** @param {import("@playwright/test").Page} page */
async function showGames(page) {
  await openApp(page, { snapshots: { 2026: buildSnapshotWithStarters() } });
  await page.getByRole("tab", { name: "Games" }).click();
  return page.getByRole("button", { name: ASTROS_AT_ATHLETICS });
}

test("a game's row names its clubs plainly, and a tap anywhere on it, their names too, opens the game", async ({
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
  await expect(page.locator("#gameSheet")).toBeVisible();
  await expect(page.locator("#teamSheet")).toBeHidden();
});

test("a club's sheet open over a game's on a reload shows again over it, with a back button in place of its close button, and Escape closes both", async ({
  page,
}) => {
  await (await showGames(page)).click();
  const gameSheet = page.locator("#gameSheet");
  await gameSheet.getByRole("button", { name: "Team details: Astros" }).first().click();
  const teamSheet = page.locator("#teamSheet");
  await expect(teamSheet.locator("#teamTitle")).toHaveText("Astros");

  await page.reload();

  await expect(teamSheet.locator("#teamTitle")).toHaveText("Astros");
  await expect(teamSheet.locator("#teamNote")).toContainText("AL West");
  await expect(teamSheet.getByRole("button", { name: "Back to Game", exact: true })).toBeVisible();
  await expect(teamSheet.getByRole("button", { name: "Close" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(teamSheet).toBeHidden();
  await expect(gameSheet).toBeHidden();
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

  test("an update about a game opens its sheet", async ({ page }) => {
    const update = await showClinch(page);

    await tapOn(page, update.getByRole("button", { name: /^Game details/ }));

    await expect(page.locator("#gameBody")).toContainText(/White Sox[\s\S]*Royals/);
    await expect(page.locator("#teamSheet")).toBeHidden();
  });

  test("a tap on a club's name in an update about a game opens the game's sheet", async ({
    page,
  }) => {
    const update = await showClinch(page);
    await tapOn(page, update.getByRole("button", { name: "Team details: White Sox" }));

    await expect(page.locator("#gameBody")).toContainText(/White Sox[\s\S]*Royals/);
    await expect(page.locator("#teamSheet")).toBeHidden();
  });

  test("a tap on a club's name in a game's row opens the game, since a thumb lands on a name easily", async ({
    page,
  }) => {
    const gameButton = await showGames(page);
    await tapOn(page, gameButton.locator("xpath=..").locator(".game-side.away .club"));

    await expect(page.locator("#gameSheet")).toBeVisible();
    await expect(page.locator("#teamSheet")).toBeHidden();
  });

  test("a tap anywhere on a club's row in the standings, beside its name or on its numbers, lands on the club's button and opens its sheet, and the table scrolls no wider than it is", async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole("tab", { name: "Standings" }).click();
    const row = page.locator('.div-grid tr[data-team="SEA"]');
    await row.scrollIntoViewIfNeeded();
    const spots = await row.locator("td").evaluateAll((cells) =>
      cells
        .map((cell) => cell.getBoundingClientRect())
        .filter((box) => box.right <= innerWidth)
        .map((box) => ({ x: box.right - 2, y: box.top + box.height / 2 })),
    );
    expect(spots.length).toBeGreaterThan(4);
    for (const spot of spots) {
      const target = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.dataset.team,
        spot,
      );
      expect(target).toBe("SEA");
    }
    const [scrolled, table] = await row.evaluate((tr) => [
      tr.closest(".st-scroll").scrollWidth,
      tr.closest("table").offsetWidth,
    ]);
    expect(scrolled).toBe(table);

    await page.touchscreen.tap(spots.at(-1).x, spots.at(-1).y);
    await expect(page.locator("#teamSheet #teamTitle")).toHaveText(/Mariners/);
  });
});

test("a club's name in a game's sheet opens its sheet over it, whose back button goes back to the game", async ({
  page,
}) => {
  await (await showGames(page)).click();
  const gameSheet = page.locator("#gameSheet");
  await gameSheet.getByRole("button", { name: "Team details: Athletics" }).first().click();
  const teamSheet = page.locator("#teamSheet");

  await expect(teamSheet.locator("#teamTitle")).toHaveText("Athletics");
  await expectShown(teamSheet);
  await expectSteppedAway(gameSheet);
  await teamSheet.getByRole("button", { name: "Back to Game", exact: true }).click();
  await expect(teamSheet).toBeHidden();
  await expectShown(gameSheet);
});

test("a club's row in the standings opens its sheet, with its nearest games, race, and titles, and its close button closes it", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Standings" }).click();
  await page.locator('.div-grid tr[data-team="SEA"] .team-open').click();
  const sheet = page.locator("#teamSheet");

  await expect(sheet.locator("#teamTitle")).toHaveText(/Mariners/);
  await expect(sheet.locator(".sheet-part h3")).toHaveText(["Season", "Titles"]);
  await expect(sheet.locator(".team-stat .team-label").first()).toHaveText("AL West");
  await expect(sheet.locator(".game-card h3")).toHaveText(["Last game", "Next game"]);
  await expect(sheet.locator(".team-titles")).toHaveText("None yet");
  await expect(sheet).toContainText("Since 1977");

  await sheet.getByRole("button", { name: "Close" }).click();
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
  await expect(page.locator("#teamSheet .team-stat .team-label").first()).toHaveCSS(
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

test.describe("on a phone", () => {
  test.use(ON_A_PHONE);

  test("a finger on a club's card of a game lands on its button, and opens the game's sheet over the club's, which its back arrow returns to", async ({
    page,
  }) => {
    await openApp(page, { snapshots: { 2026: buildSnapshotWithStarters() } });
    await page.getByRole("tab", { name: "Standings" }).click();
    await page.locator('.div-grid tr[data-team="HOU"] .team-open').click();
    const teamSheet = page.locator("#teamSheet");
    await expect(teamSheet.locator(".game-card h3")).toHaveText(["Last game", "Next game"]);
    const card = teamSheet.getByRole("button", { name: ASTROS_AT_ATHLETICS });
    await expect(card).toContainText("@");

    const box = await card.boundingBox();
    if (!box) throw new Error("The card isn't shown");
    const spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const landsOn = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.dataset.game,
      spot,
    );
    expect(landsOn).toBe("2026-09-24 HOU ATH 1");
    await page.touchscreen.tap(spot.x, spot.y);

    const gameSheet = page.locator("#gameSheet");
    await expect(gameSheet.getByRole("heading", { level: 2 })).toHaveText("Astros @ Athletics");
    await expectShown(gameSheet);
    await expectSteppedAway(teamSheet);
    await gameSheet.getByRole("button", { name: "Back to Team", exact: true }).click();
    await expectShown(teamSheet);
    await expect(gameSheet).toBeHidden();
  });
});
