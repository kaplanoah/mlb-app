import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapshot } from "../page/js/snapshot.js";
import { isStillPlaying } from "../page/js/series.js";
import { TEAMS } from "../page/js/teams.js";
import {
  PLAYOFFS,
  REGULAR_SEASON,
  createPlayerServer,
  nameGameLogRequest,
  nameRanksKey,
  nameTeamGameLogRequest,
  nameTotalsRequest,
} from "../worker/src/player.js";
import { createPlayerJob } from "../worker/src/player-updater.js";
import { addTurnovers, joinGameLogs } from "./player-fixtures.js";
import {
  createRosterServer,
  nameEspnRosterRequest,
  nameLeagueRosterRequest,
  namePlayerListRequest,
} from "../worker/src/roster.js";

// Every player's totals and every team's games as the league answered the morning after the
// Liberty's last game, with the game logs of a few players standing in for every player's, beside
// the rosters recorded that morning.
const PLAYERS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-06-players.json`, "utf8"),
);
const ROSTERS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-06-league-rosters.json`, "utf8"),
);
const AFTERNOON = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-09-30-afternoon.json`, "utf8"),
);
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-01-games.json`, "utf8"),
);
const { series: SERIES } = buildSnapshot(
  { ...AFTERNOON.responses, players: GAMES.preview.players },
  { season: 2026, now: Date.parse(AFTERNOON.now) },
);
const NOW = Date.parse(ROSTERS.recordedAt);
const MINUTE_MS = 60 * 1000;
const STEWART = "1627668";
const SABALLY = "1630149";
const FIEBICH = "1630142";
const BALOGUN = "1641663";
const IONESCU = "1629477";
const STATS_FEEDS = 5;
const TEAM_COUNT = Object.keys(TEAMS).length;

// The current season's feeds carry turnovers, and the past season's are as the fixture recorded
// them, without.
/**
 * @param {number} season
 * @param {any} answer
 */
const withSeasonColumns = (season, answer) => (season === 2026 ? addTurnovers(answer) : answer);

const EMPTY_ROSTER = {
  resultSets: [
    { name: "CommonTeamRoster", headers: ["PLAYER_ID"], rowSet: [] },
    { name: "Coaches", headers: ["COACH_TYPE"], rowSet: [] },
  ],
};

/**
 * The league's answers, by request: every team has a roster and ESPN's, the recorded or an empty
 * one.
 */
function listAnswers() {
  /** @type {Record<string, any>} */
  const answers = {};
  for (const season of [2025, 2026]) {
    answers[nameTotalsRequest(season)] = withSeasonColumns(season, PLAYERS.totals[season]);
    answers[namePlayerListRequest(season)] = ROSTERS.playerList;
    for (const seasonType of [REGULAR_SEASON, PLAYOFFS]) {
      answers[nameTeamGameLogRequest(season, seasonType)] =
        PLAYERS.teamGames[`${season}:${seasonType}`];
      answers[nameGameLogRequest(season, seasonType)] = withSeasonColumns(
        season,
        joinGameLogs(PLAYERS.gameLogs, season, seasonType),
      );
    }
    for (const team of Object.keys(TEAMS))
      answers[nameLeagueRosterRequest(team, season)] =
        ROSTERS.rosters[`${team}:${season}`] ?? EMPTY_ROSTER;
  }
  for (const [key, games] of Object.entries(PLAYERS.gameLogs)) {
    const [id, season, seasonType] = key.split(":");
    answers[nameGameLogRequest(Number(season), seasonType, id)] = withSeasonColumns(
      Number(season),
      games,
    );
  }
  for (const team of Object.keys(TEAMS))
    answers[nameEspnRosterRequest(TEAMS[team].espnId)] = ROSTERS.espnRosters[team] ?? {
      athletes: [],
    };
  return answers;
}

/** @param {Record<string, any>} answers */
function createLeagueFetch(answers) {
  /** @type {string[]} */
  const requests = [];
  /** @param {string} url */
  const fetchImpl = async (url) => {
    requests.push(url);
    return url in answers
      ? new Response(JSON.stringify(answers[url]))
      : new Response("Not found", { status: 404 });
  };
  return { requests, fetchImpl };
}

function createJobStorage() {
  const stored = new Map();
  return {
    get: async (/** @type {string} */ key) => structuredClone(stored.get(key)),
    put: async (/** @type {string} */ key, /** @type {any} */ value) => {
      stored.set(key, structuredClone(value));
    },
    delete: async (/** @type {string} */ key) => stored.delete(key),
    list: async (/** @type {string} */ prefix) =>
      new Map([...stored].filter(([key]) => key.startsWith(prefix))),
  };
}

/** @param {Record<string, any>} initial */
function createDocs(initial) {
  const stored = new Map(Object.entries(initial));
  /** @type {string[]} */
  const writes = [];
  return {
    stored,
    writes,
    read: async (/** @type {string} */ key) => structuredClone(stored.get(key)) ?? null,
    list: async (/** @type {string} */ collection) =>
      [...stored]
        .filter(([key]) => key.startsWith(`${collection}/`))
        .map(([, doc]) => structuredClone(doc)),
    write: async (/** @type {string} */ key, /** @type {any} */ doc) => {
      writes.push(key);
      stored.set(key, structuredClone(doc));
    },
    remove: async (/** @type {string} */ key) => stored.delete(key),
  };
}

const FINAL_GAME = { id: "1", state: "final" };

/**
 * A store whose current season is 2026, with 2025 kept from before, and the job that keeps its
 * players, run as the store runs it.
 * @param {{ series?: any[], answers?: Record<string, any>, job?: ReturnType<typeof createPlayerJob> }} [options]
 */
function createRun({ series = [], answers = listAnswers(), job = createPlayerJob() } = {}) {
  const docs = createDocs({
    "live/current": { season: 2026 },
    "seasons/2026": { year: 2026, games: [FINAL_GAME], series },
    "seasons/2025": { year: 2025, games: [], series: [] },
  });
  const storage = createJobStorage();
  const league = createLeagueFetch(answers);
  const clock = { now: NOW };
  const runJob = () =>
    job.run({
      docs,
      storage,
      loadSnapshot: async () => null,
      env: {},
      fetchImpl: league.fetchImpl,
      now: () => clock.now,
    });
  /** @param {number} minutes */
  const wait = (minutes) => {
    clock.now += minutes * MINUTE_MS;
  };
  /** @param {number} count */
  const endGames = async (count) => {
    const season = docs.stored.get("seasons/2026");
    const games = Array.from({ length: count }, (_, index) => ({
      id: String(index),
      state: "final",
    }));
    docs.stored.set("seasons/2026", { ...season, games });
  };
  return { docs, storage, league, runJob, wait, endGames };
}

/** @param {any} docs */
const readFromStore = (docs) => (/** @type {string} */ key) => docs.read(key);

/**
 * A player's sheet as the Worker answers it, from the store when `docs` is given, or from the
 * league.
 * @param {string} query
 * @param {{ docs?: any, answers?: Record<string, any> }} [options]
 */
async function askForPlayer(query, { docs, answers = listAnswers() } = {}) {
  const { requests, fetchImpl } = createLeagueFetch(answers);
  const rosters = createRosterServer({ fetchImpl, now: () => NOW });
  const response = await createPlayerServer({
    loadRoster: rosters.loadRoster,
    fetchImpl,
    now: () => NOW,
  }).servePlayer(
    new URL(`https://wnba.test/player?${query}`),
    docs ? readFromStore(docs) : undefined,
  );
  return { status: response.status, body: await response.json(), requests };
}

/**
 * @param {string} query
 * @param {{ docs?: any }} [options]
 */
async function askForRoster(query, { docs } = {}) {
  const { requests, fetchImpl } = createLeagueFetch(listAnswers());
  const response = await createRosterServer({ fetchImpl, now: () => NOW }).serveRoster(
    new URL(`https://wnba.test/roster?${query}`),
    docs ? readFromStore(docs) : undefined,
  );
  return { status: response.status, body: await response.json(), requests };
}

test("a player's sheet from the store is the one the league's feeds make, and reads nothing from the league", async () => {
  const { docs, runJob } = createRun();
  await runJob();

  for (const id of [STEWART, FIEBICH, SABALLY, BALOGUN]) {
    const query = `id=${id}&team=NYL&season=2026`;
    const fromStore = await askForPlayer(query, { docs });
    const fromLeague = await askForPlayer(query);
    assert.equal(fromStore.status, 200);
    assert.deepEqual(fromStore.body, fromLeague.body);
    assert.deepEqual(fromStore.requests, []);
  }
});

test("a team's roster from the store is the one the league's feeds make, with who ESPN says is out", async () => {
  const { docs, runJob } = createRun();
  await runJob();

  const fromStore = await askForRoster("team=IND&season=2026", { docs });
  const fromLeague = await askForRoster("team=IND&season=2026");
  assert.deepEqual(fromStore.body, fromLeague.body);
  assert.ok(fromStore.body.players.some((/** @type {any} */ player) => player.isOut));
  assert.deepEqual(fromStore.requests, []);
});

test("a run that finds nothing new reads nothing from the league and saves nothing", async () => {
  const { docs, league, runJob, wait } = createRun();
  await runJob();
  await runJob();
  const firstRuns = league.requests.length;
  const firstWrites = docs.writes.length;

  wait(5);
  await runJob();

  assert.equal(league.requests.length, firstRuns);
  assert.equal(docs.writes.length, firstWrites);
});

test("a game's end has the next run read the five stats feeds, and once more as the stats settle, and nothing else", async () => {
  const { league, runJob, wait, endGames } = createRun();
  await runJob();
  await runJob();

  await endGames(2);
  const beforeFinal = league.requests.length;
  wait(5);
  await runJob();
  const afterFinal = league.requests.slice(beforeFinal);
  wait(10);
  await runJob();
  const settled = league.requests.slice(beforeFinal + afterFinal.length);
  wait(5);
  await runJob();

  const statsHost = "https://stats.wnba.com/stats/";
  const readsStats = (/** @type {string} */ url) =>
    /^(leaguedashplayerstats|playergamelogs|leaguegamelog)\?/.test(url.slice(statsHost.length));
  assert.equal(afterFinal.length, STATS_FEEDS);
  assert.ok(afterFinal.every(readsStats));
  assert.equal(settled.length, STATS_FEEDS);
  assert.equal(league.requests.length, beforeFinal + 2 * STATS_FEEDS);
});

test("a final the feeds answer the same for saves no document", async () => {
  const { docs, runJob, wait, endGames } = createRun();
  await runJob();
  await runJob();
  const writes = docs.writes.length;

  await endGames(2);
  wait(5);
  await runJob();

  assert.equal(docs.writes.length, writes);
});

test("a past season the store keeps is filled once, after the current one, and never read again", async () => {
  const { docs, league, runJob, wait } = createRun();
  await runJob();
  const pastReads = league.requests.filter((url) => /Season=2025/.test(url));

  wait(5);
  await runJob();
  wait(24 * 60);
  await runJob();

  assert.equal(pastReads.length, STATS_FEEDS + TEAM_COUNT + 1);
  assert.equal(league.requests.filter((url) => /Season=2025/.test(url)).length, pastReads.length);
  const ionescu = await askForPlayer(`id=${IONESCU}&team=NYL&season=2025`, { docs });
  assert.deepEqual(ionescu.body, (await askForPlayer(`id=${IONESCU}&team=NYL&season=2025`)).body);
  assert.deepEqual(ionescu.requests, []);
});

test("a past season filled before the sheets read a column is filled once more, and then never again", async () => {
  const { storage, league, runJob, wait } = createRun();
  await storage.put("filled:2025", true);
  await runJob();
  const pastReads = league.requests.filter((url) => /Season=2025/.test(url));

  wait(24 * 60);
  await runJob();

  assert.equal(pastReads.length, STATS_FEEDS + TEAM_COUNT + 1);
  assert.equal(league.requests.filter((url) => /Season=2025/.test(url)).length, pastReads.length);
});

test("ESPN is read only for the teams still playing", async () => {
  const { league, runJob } = createRun({ series: SERIES });
  await runJob();

  const playing = Object.keys(TEAMS).filter((team) => isStillPlaying(SERIES, team));
  const espnReads = league.requests.filter((url) => url.includes("espn.com"));
  assert.ok(playing.length > 0 && playing.length < TEAM_COUNT);
  assert.deepEqual(
    espnReads.sort(),
    playing.map((team) => nameEspnRosterRequest(TEAMS[team].espnId)).sort(),
  );
});

test("a season the store hasn't filled, or a store that can't be read, has the sheet read the league", async () => {
  const { docs, runJob } = createRun();
  await runJob();
  docs.stored.delete(nameRanksKey(2026));

  const unfilled = await askForPlayer(`id=${STEWART}&team=NYL&season=2026`, { docs });
  assert.equal(unfilled.status, 200);
  assert.ok(unfilled.requests.length > 0);

  const broken = { read: async () => Promise.reject(new Error("The store answered 500")) };
  const unreadable = await askForPlayer(`id=${STEWART}&team=NYL&season=2026`, { docs: broken });
  assert.equal(unreadable.status, 200);
  assert.deepEqual(
    unreadable.body,
    (await askForPlayer(`id=${STEWART}&team=NYL&season=2026`)).body,
  );
});

test("stats the league hasn't answered leave the rosters saved, and the sheets reading the league until it does", async () => {
  const answers = listAnswers();
  delete answers[nameTotalsRequest(2026)];
  const { docs, runJob } = createRun({ answers });
  await runJob();

  assert.equal(docs.stored.get(nameRanksKey(2026)), undefined);
  const roster = await askForRoster("team=NYL&season=2026", { docs });
  assert.deepEqual(roster.requests, []);
  const player = await askForPlayer(`id=${STEWART}&team=NYL&season=2026`, { docs, answers });
  assert.equal(player.status, 502);
  assert.ok(player.requests.length > 0);
});

test("a feed that stops answering leaves what the store saved from it", async () => {
  const answers = listAnswers();
  const { docs, runJob, wait, endGames } = createRun({ answers });
  await runJob();
  const ranks = docs.stored.get(nameRanksKey(2026));
  const writes = docs.writes.length;

  delete answers[nameTotalsRequest(2026)];
  await endGames(2);
  wait(5);
  await runJob();

  assert.equal(docs.writes.length, writes);
  assert.deepEqual(docs.stored.get(nameRanksKey(2026)), ranks);
});

test("one job keeps each store it serves whole, however many there are", async () => {
  const job = createPlayerJob();
  const first = createRun({ job });
  const second = createRun({ job });

  await first.runJob();
  await second.runJob();

  assert.ok(second.docs.stored.get(nameRanksKey(2026)));
  assert.deepEqual([...second.docs.stored.keys()].sort(), [...first.docs.stored.keys()].sort());
});
