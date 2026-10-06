import { readFileSync } from "node:fs";
import { buildSnapshot, REQUESTS } from "../../page/js/snapshot.js";
import { createBoxScoreServer, nameBoxScoreRequest } from "../../worker/src/box-score.js";
import {
  createLeadServer,
  nameScoreboardRequest,
  nameSummaryRequest,
} from "../../worker/src/lead.js";
import {
  PLAYOFFS,
  REGULAR_SEASON,
  createPlayerServer,
  nameGameLogRequest,
  nameTeamGameLogRequest,
  nameTotalsRequest,
} from "../../worker/src/player.js";
import { createPreviewServer, listUpcomingMeetings } from "../../worker/src/preview.js";
import {
  createRosterServer,
  nameEspnRosterRequest,
  nameLeagueRosterRequest,
  namePlayerListRequest,
} from "../../worker/src/roster.js";
import { TEAMS } from "../../page/js/teams.js";
import { SeasonStore } from "../../worker/src/store.js";
import worker from "../../worker/src/index.js";
import {
  test,
  expect,
  createTestStore,
  connectToStore,
  loadPageAt,
  matchPath,
  openLockedPage,
} from "../../../../tests/browser/harness.mjs";
import { holdStore } from "../../../../tests/browser/hold-store.mjs";
import { joinGameLogs } from "../player-fixtures.js";

const AFTERNOON = JSON.parse(
  readFileSync(new URL("../fixtures/2026-09-30-afternoon.json", import.meta.url), "utf8"),
);
const NOW = AFTERNOON.now;
// Where ESPN says each of the afternoon's games was on.
const ESPN_SCOREBOARD = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-02-espn-scoreboard.json", import.meta.url), "utf8"),
);
const GAMES = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-01-games.json", import.meta.url), "utf8"),
);
const LEAD = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-01-espn-lead.json", import.meta.url), "utf8"),
);
// The league's rosters of the Liberty, Dream, Aces, Fever, and Wings this season and the Liberty's
// last, its list of every player trimmed to theirs, and ESPN's rosters of today, as they were.
const ROSTERS = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-06-league-rosters.json", import.meta.url), "utf8"),
);

const listRosterAnswers = () => [
  ...Object.entries(ROSTERS.rosters).map(([key, roster]) => {
    const [team, season] = key.split(":");
    return /** @type {[string, any]} */ ([nameLeagueRosterRequest(team, Number(season)), roster]);
  }),
  ...[2025, 2026].map(
    (season) => /** @type {[string, any]} */ ([namePlayerListRequest(season), ROSTERS.playerList]),
  ),
  ...Object.entries(ROSTERS.espnRosters).map(
    ([team, roster]) =>
      /** @type {[string, any]} */ ([nameEspnRosterRequest(TEAMS[team].espnId), roster]),
  ),
];

// The league's totals, team game logs, and the game logs of a few players, as a player's sheet
// reads them: the Liberty's Stewart, Fiebich, Sabally, Balogun, and Astier, the Aces' Wilson, and
// the Fever's Boston this season, and the Liberty's Ionescu last.
const PLAYERS = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-06-players.json", import.meta.url), "utf8"),
);

const listPlayerAnswers = () => [
  ...Object.keys(PLAYERS.totals).flatMap((season) =>
    [REGULAR_SEASON, PLAYOFFS].map(
      (seasonType) =>
        /** @type {[string, any]} */ ([
          nameGameLogRequest(Number(season), seasonType),
          joinGameLogs(PLAYERS.gameLogs, Number(season), seasonType),
        ]),
    ),
  ),
  ...Object.entries(PLAYERS.totals).map(
    ([season, totals]) =>
      /** @type {[string, any]} */ ([nameTotalsRequest(Number(season)), totals]),
  ),
  ...Object.entries(PLAYERS.teamGames).map(([key, games]) => {
    const [season, seasonType] = key.split(":");
    return /** @type {[string, any]} */ ([
      nameTeamGameLogRequest(Number(season), seasonType),
      games,
    ]);
  }),
  ...Object.entries(PLAYERS.gameLogs).map(([key, games]) => {
    const [id, season, seasonType] = key.split(":");
    return /** @type {[string, any]} */ ([
      nameGameLogRequest(Number(season), seasonType, id),
      games,
    ]);
  }),
];

export { test, expect, matchPath, GAMES, NOW };

/**
 * The league's answers to the game sheet's routes, and to what the store reads ahead of them, from
 * the recorded box scores and schedule, with any box score changed, or the schedule refused. A game
 * without a box score is one that hasn't started. ESPN answers for the one game its lead was
 * recorded for, Valkyries at Wings, Game 2.
 * @param {{ boxScores?: Record<string, any>, isScheduleRefused?: boolean }} league
 */
function listLeagueAnswers({ boxScores = {}, isScheduleRefused = false }) {
  const answers = new Map([
    ...Object.entries({ ...GAMES.boxScores, ...boxScores }).map(
      ([id, box]) => /** @type {[string, any]} */ ([nameBoxScoreRequest(id), box]),
    ),
    [nameScoreboardRequest(LEAD.game.start), LEAD.scoreboard],
    [nameSummaryRequest(LEAD.eventId), LEAD.summary],
    ...listRosterAnswers(),
    ...listPlayerAnswers(),
  ]);
  if (!isScheduleRefused) answers.set(REQUESTS.schedule, GAMES.preview.schedule);
  return answers;
}

/**
 * The league as the game sheet's routes read it, refusing what it has no answer for.
 * @param {Parameters<typeof listLeagueAnswers>[0]} league
 */
function createLeagueFetch(league) {
  const answers = listLeagueAnswers(league);
  return async (/** @type {string} */ url) =>
    answers.has(url)
      ? new Response(JSON.stringify(answers.get(url)))
      : new Response("<Error>AccessDenied</Error>", { status: 403 });
}

/**
 * @param {import("@playwright/test").Route} route
 * @param {(url: URL) => Promise<Response>} serve
 */
async function answerFromWorker(route, serve) {
  const answer = await serve(new URL(route.request().url()));
  await route.fulfill({ status: answer.status, json: await answer.json() });
}

// Each test starts from the same snapshot, which takes far longer to build than to copy.
const afternoonSnapshots = new Map();

/** @param {number} season */
function readAfternoonSnapshot(season) {
  if (!afternoonSnapshots.has(season))
    afternoonSnapshots.set(
      season,
      buildSnapshot(
        {
          ...AFTERNOON.responses,
          players: GAMES.preview.players,
          networks: Object.values(ESPN_SCOREBOARD.answers),
        },
        { season, now: Date.parse(NOW) },
      ),
    );
  return structuredClone(afternoonSnapshots.get(season));
}

/**
 * The league as the store's jobs read it: the recorded box scores, leads, rosters, and players'
 * numbers. Anything else, like the news, answers with nothing.
 * @param {Parameters<typeof listLeagueAnswers>[0]} league
 */
function createStoreFetch(league) {
  const answers = listLeagueAnswers(league);
  return async (/** @type {string} */ url) =>
    answers.has(url)
      ? new Response(JSON.stringify(answers.get(url)))
      : new Response(null, { status: 201 });
}

/**
 * The Worker's store, already updated once from the afternoon's feeds, with each upcoming game's
 * meetings from the schedule, and what its jobs keep: the rosters, players' numbers, and finals'
 * box scores and leads.
 * @param {Parameters<typeof listLeagueAnswers>[0]} [league]
 */
async function createAfternoonStore(league = {}) {
  const loadSnapshot = async (season) => {
    const snapshot = readAfternoonSnapshot(season);
    const schedule = league.isScheduleRefused ? null : GAMES.preview.schedule;
    return { ...snapshot, meetings: listUpcomingMeetings(schedule, snapshot) };
  };
  const testStore = createTestStore(SeasonStore, {
    loadSnapshot,
    now: NOW,
    fetchImpl: createStoreFetch(league),
  });
  await testStore.store.alarm();
  // The store's jobs run beside the update, and finish before the page opens, so they never
  // overwrite what a test writes.
  await Promise.all(testStore.store.jobRuns.values());
  return testStore;
}

/**
 * The page as the Worker serves it, with the Worker's store behind it, already updated once from
 * the afternoon's feeds, and the game and team sheets' routes reading the store, and the recorded
 * answers for what it doesn't keep, unless the league is down by the time the page opens. On a
 * phone, the afternoon's finals would fill the Updates box above every view, so it starts
 * dismissed unless a test is about it.
 * @param {import("@playwright/test").Page} page
 * A past season's record is built from the afternoon's by its change in `pastSeasons`, by year.
 * @param {{ league?: Parameters<typeof listLeagueAnswers>[0], isLeagueDownForPage?: boolean, isShowingUpdates?: boolean, pastSeasons?: Record<number, (season: any) => any> }} [options]
 */
export async function openApp(
  page,
  { league = {}, isLeagueDownForPage = false, isShowingUpdates = false, pastSeasons = {} } = {},
) {
  if (!isShowingUpdates)
    await page.addInitScript(() => localStorage.setItem("updatesSeenAt", String(Date.now() * 2)));
  const testStore = await createAfternoonStore(league);
  const { context, store } = testStore;
  const readSeason = async () => structuredClone(await context.ctx.storage.get("seasons/2026"));
  for (const [year, change] of Object.entries(pastSeasons))
    await context.ctx.storage.put(`seasons/${year}`, change(await readSeason()));
  const openSockets = await connectToStore(page, testStore);
  const fetchImpl = isLeagueDownForPage
    ? async () => new Response("", { status: 503 })
    : createLeagueFetch(league);
  const boxScores = createBoxScoreServer({ fetchImpl });
  const previews = createPreviewServer({ fetchImpl, now: () => Date.parse(NOW) });
  const leads = createLeadServer({ fetchImpl });
  const rosters = createRosterServer({ fetchImpl, now: () => Date.parse(NOW) });
  const players = createPlayerServer({
    loadRoster: rosters.loadRoster,
    fetchImpl,
    now: () => Date.parse(NOW),
  });
  const readDoc = (/** @type {string} */ key) => store.docs.read(key);
  await page.route(matchPath("/lead"), (route) =>
    answerFromWorker(route, (url) => leads.serveLead(url, readDoc)),
  );
  await page.route(matchPath("/box-score"), (route) =>
    answerFromWorker(route, (url) => boxScores.serveBoxScore(url, readDoc)),
  );
  await page.route(matchPath("/preview"), (route) =>
    answerFromWorker(route, (url) => previews.servePreview(url, readDoc)),
  );
  await page.route(matchPath("/roster"), (route) =>
    answerFromWorker(route, (url) => rosters.serveRoster(url, readDoc)),
  );
  await page.route(matchPath("/player"), (route) =>
    answerFromWorker(route, (url) => players.servePlayer(url, readDoc)),
  );
  await loadPageAt(page, NOW);

  return {
    countOpenSockets: () => openSockets.length,
    // What the Worker reads for a game a page has open, and pushes to the pages watching it.
    /**
     * @param {string} id
     * @param {{ boxScore: any, lead: any }} details
     */
    saveGameDetails: (id, details) => store.docs.write(`games/${id}`, details),
    // A document the Worker saves, which the store pushes to the pages watching it.
    /**
     * @param {string} path
     * @param {any} data
     */
    writeDocument: (path, data) => store.docs.write(path, data),
    listWatchedPaths: () =>
      context.ctx
        .getWebSockets()
        .flatMap((socket) => socket.deserializeAttachment()?.watching ?? []),
    /** @param {(season: any) => any} change */
    changeSeason: async (change) => {
      await store.docs.write("seasons/2026", change(await readSeason()));
    },
    /**
     * A change the page's socket never hears of, as when a phone sleeps through it.
     * @param {(season: any) => any} change
     */
    changeSeasonWhileAway: async (change) => {
      await context.ctx.storage.put("seasons/2026", change(await readSeason()));
    },
    holdStore: () => holdStore(page),
    /**
     * The saved season as the store would hold it in the next year's off-season.
     * @param {number} year
     */
    moveSeasonTo: async (year) => {
      await context.ctx.storage.put(`seasons/${year}`, await readSeason());
      await context.ctx.storage.delete("seasons/2026");
      await context.ctx.storage.put("live/current", { season: year });
    },
  };
}

/**
 * The page at its key's address behind an access code, as the Worker serves it, with the
 * afternoon's store behind it.
 * @param {import("@playwright/test").Page} page
 * @param {{ accessCode: string }} options
 */
export async function openLockedApp(page, { accessCode }) {
  const testStore = await createAfternoonStore();
  return openLockedPage(page, { worker, testStore, accessCode, now: NOW });
}

/**
 * Shows the Games list that has the game a button names, and finds the button once the list has
 * come to rest, before which a tap on it does nothing.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
export async function findGameButton(page, name) {
  await page.getByRole("tab", { name: "Games" }).click();
  for (const list of ["Today", "Previous", "Next"]) {
    await page.getByRole("tab", { name: list }).click();
    const games = page.locator(`#games-${list.toLowerCase()}`);
    const button = games.getByRole("button", { name });
    if (!(await button.count())) continue;
    await expect(games).not.toHaveAttribute("inert");
    return button;
  }
  throw new Error(`No game is named ${name}`);
}

/**
 * Opens the sheet of the game a button names, from whichever of the Games lists has it.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
export async function openGameSheet(page, name) {
  await (await findGameButton(page, name)).click();
  return page.locator("#gameSheet");
}
