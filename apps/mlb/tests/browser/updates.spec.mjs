import {
  test,
  expect,
  openApp,
  buildFixtureSnapshot,
  EVENING_FIXTURE,
  keepFromEarlierVisit,
  ON_A_PHONE,
  readKept,
} from "./harness.mjs";
import { createReading } from "../../page/js/readings.js";
import { listOffScaleText } from "../../../../tests/browser/type-scale.mjs";
import { listStrayPeriods } from "../../../../tests/browser/stray-periods.mjs";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("a computer shows no Updates box, since each device keeps its own dismissal", async ({
  page,
}) => {
  await openApp(page, {
    liveAvailable: false,
    store: {
      "seasons/2026": {
        year: 2026,
        teams: {},
        series: {},
        log: [{ kind: "lock", at: "2026-09-24T20:00:00Z" }],
      },
    },
  });

  await expect(page.getByRole("heading", { name: "No playoff field yet" })).toBeVisible();
  await expect(page.locator("#updates")).toBeHidden();
});

test.describe("on a phone", () => {
  test.use(ON_A_PHONE);

  test("rebuilds updates from the saved readings as the Worker adds to them", async ({ page }) => {
    const currentSnapshot = buildFixtureSnapshot(EVENING_FIXTURE);
    const earlier = createReading({ ...currentSnapshot, asOf: "2026-09-24T20:00:00Z" });
    [earlier.teams.NYY, earlier.teams.BOS] = [
      { ...earlier.teams.NYY, seed: earlier.teams.BOS.seed },
      { ...earlier.teams.BOS, seed: earlier.teams.NYY.seed },
    ];
    const part = `${currentSnapshot.slate.today.date}-01`;
    const app = await openApp(page, {
      store: {
        "seasons/2026": {
          year: 2026,
          teams: currentSnapshot.teams,
          series: currentSnapshot.series,
          projected: true,
          log: [],
        },
        [`readings-2026/${part}`]: {
          id: part,
          day: currentSnapshot.slate.today.date,
          number: 1,
          start: earlier,
          changes: [],
        },
      },
    });

    const updates = page.locator("#updates");
    await expect.poll(() => app.countOpenSockets()).toBe(1);
    await expect(updates).toBeHidden();
    await app.updateFromWorker();
    await expect(updates).toContainText(/Yankees passed the .*Red Sox for the AL 4 seed/);

    app.changeSnapshots((snapshot) => {
      const { PHI, ...teams } = snapshot.teams;
      return { ...snapshot, teams: { ...teams, NYM: { ...PHI, w: 83, l: 76 } } };
    });
    await app.updateFromWorker();

    await expect(updates).toContainText(/Mets .*Phillies/);
    expect((await app.readDocument(`readings-2026/${part}`)).changes).toHaveLength(2);
    expect(await listOffScaleText(page)).toEqual([]);
    expect(await listStrayPeriods(page)).toEqual([]);
    await expect(updates.locator(".what").first()).toHaveCSS("font-size", "14.5px");
  });

  test("a release note shows in the Updates box, headed New in the app, until it's dismissed", async ({
    page,
  }) => {
    await page.route("**/js/release-notes.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export const RELEASE_NOTES = [{ at: "2026-09-24T23:00:00Z", text: "Something new." }];',
      }),
    );
    await openApp(page);
    const updates = page.locator("#updates");

    await expect(updates.locator(".updates-count")).toHaveText("New in the app");
    await expect(updates.locator(".what")).toHaveText("Something new.");

    await page.getByRole("button", { name: "Dismiss updates" }).click();
    await expect(updates).toBeHidden();
    expect(await readKept(page, "updatesSeenAt")).toEqual({
      2026: Date.parse("2026-09-24T23:00:00Z"),
    });
    await page.reload();
    await expect(page.locator("#bracketWrap")).toBeVisible();
    await expect(updates).toBeHidden();
  });

  test("markup in the shared store is shown as text", async ({ page }) => {
    const markup = '<img id="injected" src="x">';
    await openApp(page, {
      liveAvailable: false,
      store: {
        "seasons/2026": {
          year: 2026,
          teams: {},
          series: {},
          log: [
            {
              kind: "berth",
              team: "NYY",
              what: "division",
              div: markup,
              at: "2026-09-24T20:00:00Z",
            },
          ],
        },
      },
    });

    await expect(page.locator("#updates")).toContainText(markup);
    await expect(page.locator("#injected")).toHaveCount(0);
  });

  const SEASON_WITH_TWO_UPDATES = {
    year: 2026,
    teams: {},
    series: {},
    log: [
      {
        kind: "elim",
        team: "SEA",
        via: [{ team: "TEX", won: true, opp: "NYM", score: [3, 1] }],
        ended: "2026-09-24T00:55:00Z",
        at: "2026-09-25T00:40:00Z",
      },
      { kind: "lock", at: "2026-09-25T00:30:00Z" },
    ],
  };

  // When this device last dismissed the Updates box.
  const keepSeenAtFromEarlierVisit = (page) =>
    keepFromEarlierVisit(page, "updatesSeenAt", { 2026: Date.parse("2026-09-24T20:00:00Z") });

  test("the update list shows when a change happened, not when the page noticed it", async ({
    page,
  }) => {
    await keepSeenAtFromEarlierVisit(page);
    await openApp(page, {
      liveAvailable: false,
      store: { "seasons/2026": SEASON_WITH_TWO_UPDATES },
    });

    const updateTimes = page.locator("#updates .when");
    await expect(updateTimes).toHaveCount(2);
    await expect(updateTimes.nth(0)).toHaveText(/^8:30\sPM$/);
    await expect(updateTimes.nth(1)).toHaveText(/^Yesterday$/);
    await expect(page.locator("#updates .updates-count")).toHaveText("2 updates since yesterday");
  });

  test("the update list leaves 18px below it", async ({ page }) => {
    await keepSeenAtFromEarlierVisit(page);
    await openApp(page, {
      liveAvailable: false,
      store: { "seasons/2026": SEASON_WITH_TWO_UPDATES },
    });

    await expect(page.locator("#updates")).toHaveCSS("margin-bottom", "18px");
  });

  test("dismissing updates goes by the newest one's time, not this device's clock", async ({
    page,
  }) => {
    await keepSeenAtFromEarlierVisit(page);
    await openApp(page, {
      liveAvailable: false,
      now: "2026-09-25T03:00:00Z",
      store: { "seasons/2026": SEASON_WITH_TWO_UPDATES },
    });

    await page.getByRole("button", { name: "Dismiss updates" }).click();
    await expect(page.locator("#updates")).toBeHidden();
    expect(await readKept(page, "updatesSeenAt")).toEqual({
      2026: Date.parse("2026-09-25T00:40:00Z"),
    });
  });

  const ELIMINATED_AT_8_10 = (team, winner) => ({
    kind: "elim",
    team,
    via: [{ team: winner, won: true, opp: "NYM", score: [3, 1] }],
    ended: "2026-09-25T00:10:00Z",
    at: "2026-09-25T00:40:00Z",
  });

  test("updates that share a time show it once", async ({ page }) => {
    await openApp(page, {
      liveAvailable: false,
      store: {
        "seasons/2026": {
          ...SEASON_WITH_TWO_UPDATES,
          log: [
            ELIMINATED_AT_8_10("SEA", "TEX"),
            ELIMINATED_AT_8_10("HOU", "BOS"),
            { kind: "lock", at: "2026-09-25T00:30:00Z" },
          ],
        },
      },
    });

    await expect(page.locator("#updates .when")).toHaveText([/^8:30\sPM$/, /^8:10\sPM$/, ""]);
  });

  test("a clinch and the elimination it brought are one update, at the game's time", async ({
    page,
  }) => {
    const rangersLoss = { team: "TEX", won: false, opp: "MIN", score: [4, 6] };
    const found = { ended: "2026-09-25T00:10:00Z", at: "2026-09-25T00:40:00Z" };
    await openApp(page, {
      liveAvailable: false,
      store: {
        "seasons/2026": {
          ...SEASON_WITH_TWO_UPDATES,
          log: [
            {
              kind: "berth",
              team: "HOU",
              what: "division",
              div: "AL West",
              via: [rangersLoss],
              ...found,
            },
            { kind: "elim", team: "TEX", via: [rangersLoss], ...found },
          ],
        },
      },
    });

    const updates = page.locator("#updates");
    await expect(updates.locator(".updates-count")).toHaveText("1 update since earlier today");
    await expect(updates.locator(".what")).toHaveText(
      "Astros clinch the AL West \u2014 Rangers eliminated with a 6-4 loss to the Twins",
    );
    await expect(updates.locator(".when")).toHaveText(/^8:10\sPM$/);
  });

  // The page's clock reads 8:44 PM Eastern, which is the next morning in London and Tokyo.
  const LOCAL_TIMES_OF_THE_NEWER_UPDATE = {
    "Pacific/Honolulu": "2:30 PM",
    "Europe/London": "1:30 AM",
    "Asia/Tokyo": "9:30 AM",
  };

  for (const [timezoneId, localTime] of Object.entries(LOCAL_TIMES_OF_THE_NEWER_UPDATE)) {
    test.describe(`in ${timezoneId}`, () => {
      test.use({ timezoneId });

      test("the update list tells time and day by the viewer's own clock", async ({ page }) => {
        await openApp(page, {
          liveAvailable: false,
          store: { "seasons/2026": SEASON_WITH_TWO_UPDATES },
        });

        const updateTimes = page.locator("#updates .when");
        await expect(updateTimes).toHaveCount(2);
        await expect(updateTimes.nth(0)).toHaveText(localTime);
        await expect(updateTimes.nth(1)).toHaveText("Yesterday");
      });
    });
  }
});
