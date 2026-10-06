import { readFileSync } from "node:fs";
import { buildSnapshot, REQUESTS } from "../../page/js/snapshot.js";
import { createBoxScoreServer, nameBoxScoreRequest } from "../../worker/src/box-score.js";
import {
  createLeadServer,
  nameScoreboardRequest,
  nameSummaryRequest,
} from "../../worker/src/lead.js";
import { createPreviewServer } from "../../worker/src/preview.js";
import {
  createRosterServer,
  nameRosterRequest,
  nameSeasonsRequest,
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
// The Liberty's and the Dream's rosters as ESPN had them, with each player's seasons.
const ROSTERS = JSON.parse(
  readFileSync(new URL("../fixtures/2026-10-06-espn-rosters.json", import.meta.url), "utf8"),
);

const listRosterAnswers = () =>
  Object.entries(ROSTERS.teams).flatMap(([team, { roster, seasons }]) => [
    /** @type {[string, any]} */ ([nameRosterRequest(TEAMS[team].espnId), roster]),
    ...Object.entries(seasons).map(
      ([id, answer]) => /** @type {[string, any]} */ ([nameSeasonsRequest(id), answer]),
    ),
  ]);

export { test, expect, matchPath, GAMES, NOW };

/**
 * The league's answers to the game sheet's routes, from the recorded box scores and schedule, with
 * any box score changed, or the schedule refused. A game without a box score is one that hasn't
 * started.
 * ESPN answers for the one game its lead was recorded for, Valkyries at Wings, Game 2.
 * @param {{ boxScores?: Record<string, any>, isScheduleRefused?: boolean, leadSummary?: any }} league
 */
function createLeagueFetch({
  boxScores = {},
  isScheduleRefused = false,
  leadSummary = LEAD.summary,
}) {
  const answers = new Map([
    ...Object.entries({ ...GAMES.boxScores, ...boxScores }).map(
      ([id, box]) => /** @type {[string, any]} */ ([nameBoxScoreRequest(id), box]),
    ),
    [nameScoreboardRequest(LEAD.game.start), LEAD.scoreboard],
    [nameSummaryRequest(LEAD.eventId), leadSummary],
    ...listRosterAnswers(),
  ]);
  if (!isScheduleRefused) answers.set(REQUESTS.schedule, GAMES.preview.schedule);
  return async (url) =>
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

/** The Worker's store, already updated once from the afternoon's feeds. */
async function createAfternoonStore() {
  const loadSnapshot = async (season) => readAfternoonSnapshot(season);
  const testStore = createTestStore(SeasonStore, { loadSnapshot, now: NOW });
  await testStore.store.alarm();
  // The news runs beside the update, and finishes before the page opens, so it never overwrites
  // the news a test writes.
  await Promise.all(testStore.store.jobRuns.values());
  return testStore;
}

/**
 * The page as the Worker serves it, with the Worker's store behind it, already updated once from
 * the afternoon's feeds, and the game and team sheets' routes reading the recorded answers. On a
 * phone, the afternoon's finals would fill the Updates box above every view, so it starts
 * dismissed unless a test is about it.
 * @param {import("@playwright/test").Page} page
 * A past season's record is built from the afternoon's by its change in `pastSeasons`, by year.
 * @param {{ league?: Parameters<typeof createLeagueFetch>[0], isShowingUpdates?: boolean, pastSeasons?: Record<number, (season: any) => any> }} [options]
 */
export async function openApp(
  page,
  { league = {}, isShowingUpdates = false, pastSeasons = {} } = {},
) {
  if (!isShowingUpdates)
    await page.addInitScript(() => localStorage.setItem("updatesSeenAt", String(Date.now() * 2)));
  const testStore = await createAfternoonStore();
  const { context, store } = testStore;
  const readSeason = async () => structuredClone(await context.ctx.storage.get("seasons/2026"));
  for (const [year, change] of Object.entries(pastSeasons))
    await context.ctx.storage.put(`seasons/${year}`, change(await readSeason()));
  const openSockets = await connectToStore(page, testStore);
  const fetchImpl = createLeagueFetch(league);
  const boxScores = createBoxScoreServer({ fetchImpl });
  const previews = createPreviewServer({ fetchImpl, now: () => Date.parse(NOW) });
  const leads = createLeadServer({ fetchImpl });
  const rosters = createRosterServer({ fetchImpl });
  await page.route(matchPath("/lead"), (route) => answerFromWorker(route, leads.serveLead));
  await page.route(matchPath("/box-score"), (route) =>
    answerFromWorker(route, boxScores.serveBoxScore),
  );
  await page.route(matchPath("/preview"), (route) =>
    answerFromWorker(route, previews.servePreview),
  );
  await page.route(matchPath("/roster"), (route) => answerFromWorker(route, rosters.serveRoster));
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
