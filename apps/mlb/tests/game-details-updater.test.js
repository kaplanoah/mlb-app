import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapshot } from "../page/js/snapshot.js";
import { listSlateGames } from "../page/js/slate.js";
import {
  createBoxScoreServer,
  describeBoxScore,
  nameFeedRequest,
  nameGameDetailsKey,
} from "../worker/src/box-score.js";
import { createGameDetailsJob } from "../worker/src/game-details-updater.js";

// The season as MLB had it on the evening of Oct 7, and its Division Series games' live feeds.
const EVENING = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-evening.json`, "utf8"),
);
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-games.json`, "utf8"),
);
const MLB_API = "https://statsapi.mlb.com";
const MINUTE_MS = 60 * 1000;
const NOW = Date.parse(EVENING.now);
const SLATE = buildSnapshot(EVENING.responses, { season: EVENING.season, now: NOW }).slate;
const DODGERS_AT_BRAVES = "849819";
const BREWERS_AT_PADRES = "849826";

/**
 * The slate with only the given games, as they are on it.
 * @param {string[]} ids
 */
function keepSlateGames(ids) {
  const isKept = (/** @type {any} */ game) => ids.includes(game.id);
  return {
    ...SLATE,
    previous: SLATE.previous.filter(isKept),
    today: { ...SLATE.today, games: SLATE.today.games.filter(isKept), postponed: [] },
    next: SLATE.next.filter(isKept),
  };
}

/** @param {string} id */
const findSlateGame = (id) => listSlateGames(SLATE).find((game) => game.id === id);

/**
 * A game's feed as MLB answers it, or, for a game the fixture didn't record, Dodgers at Braves' under
 * its id.
 * @param {string} id
 */
const readFeed = (id) => GAMES.feeds[id] ?? GAMES.feeds[DODGERS_AT_BRAVES];

/** @param {{ isDown: () => boolean }} options */
function createMlbFetch({ isDown }) {
  /** @type {string[]} */
  const requests = [];
  /** @param {string} url */
  const fetchImpl = async (url) => {
    const path = url.slice(MLB_API.length);
    requests.push(path);
    const id = /\/game\/(\d+)\//.exec(path)?.[1] ?? "";
    if (isDown() || path !== nameFeedRequest(id)) return new Response("", { status: 503 });
    return new Response(JSON.stringify(readFeed(id)));
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

/**
 * A store whose current season has `slate`, and the job that keeps its finals' box scores, run as
 * the store runs it, `minutesAfter` the evening's last update.
 * @param {{ slate?: any, minutesAfter?: number }} [options]
 */
function createRun({ slate = SLATE, minutesAfter = 0 } = {}) {
  const docs = createDocs({
    "live/current": { season: EVENING.season },
    [`seasons/${EVENING.season}`]: { year: EVENING.season, slate },
  });
  const outage = { isDown: false };
  const mlb = createMlbFetch({ isDown: () => outage.isDown });
  const clock = { now: NOW + minutesAfter * MINUTE_MS };
  const storage = createJobStorage();
  const job = createGameDetailsJob();
  const runJob = () =>
    job.run({
      docs,
      storage,
      loadSnapshot: async () => null,
      env: {},
      fetchImpl: mlb.fetchImpl,
      now: () => clock.now,
    });
  /** @param {number} minutes */
  const wait = (minutes) => {
    clock.now += minutes * MINUTE_MS;
  };
  /** Takes the games read since the last take. */
  const takeReads = () =>
    mlb.requests.splice(0).map((path) => /\/game\/(\d+)\//.exec(path)?.[1] ?? path);
  return { docs, outage, runJob, wait, takeReads };
}

test("a final's box score from the store is the one MLB answers, and reads nothing", async () => {
  const { docs, runJob } = createRun({ slate: keepSlateGames([DODGERS_AT_BRAVES]) });
  await runJob();

  const mlb = createMlbFetch({ isDown: () => false });
  const server = createBoxScoreServer({ fetchImpl: mlb.fetchImpl });
  const url = new URL(`https://mlb.test/box-score?id=${DODGERS_AT_BRAVES}`);
  const response = await server.serveBoxScore(url, (key) => docs.read(key));

  assert.deepEqual(
    await response.json(),
    describeBoxScore(DODGERS_AT_BRAVES, readFeed(DODGERS_AT_BRAVES)),
  );
  assert.deepEqual(mlb.requests, []);
});

test("a game that just ended is read at once, again once MLB has caught up, and never after", async () => {
  const end = Date.parse(findSlateGame(BREWERS_AT_PADRES).end);
  const { docs, runJob, wait, takeReads } = createRun({
    slate: keepSlateGames([BREWERS_AT_PADRES]),
    minutesAfter: (end - NOW) / MINUTE_MS + 1,
  });

  await runJob();
  assert.deepEqual(takeReads(), [BREWERS_AT_PADRES]);
  wait(5);
  await runJob();
  assert.deepEqual(takeReads(), []);
  wait(5);
  await runJob();
  assert.deepEqual(takeReads(), [BREWERS_AT_PADRES]);
  assert.deepEqual(docs.writes, [nameGameDetailsKey(BREWERS_AT_PADRES)], "nothing changed to save");
  for (const minutes of [10, 60, 24 * 60]) {
    wait(minutes);
    await runJob();
    assert.deepEqual(takeReads(), []);
  }
});

test("the slate's finals fill four a run, the latest to end first, and a run with nothing new reads nothing", async () => {
  const { runJob, wait, takeReads } = createRun();
  const finals = listSlateGames(SLATE)
    .filter((game) => game.state === "final")
    .sort((first, second) => Date.parse(second.end) - Date.parse(first.end))
    .map((game) => game.id);

  /** @type {string[][]} */
  const runs = [];
  for (let run = 0; run < Math.ceil(finals.length / 4) + 1; run += 1) {
    await runJob();
    runs.push(takeReads());
    wait(2);
  }

  assert.deepEqual(runs.slice(0, 2), [finals.slice(0, 4), finals.slice(4, 8)]);
  assert.deepEqual(runs.flat(), finals, "each final once");
  assert.deepEqual(runs.at(-1), []);
});

test("a game still to start or being played is left to the pages watching it", async () => {
  const unfinished = listSlateGames(SLATE)
    .filter((game) => game.state !== "final")
    .map((game) => game.id);
  const { docs, runJob, takeReads } = createRun({ slate: keepSlateGames(unfinished) });

  await runJob();

  assert.ok(unfinished.length > 0);
  assert.deepEqual(takeReads(), []);
  assert.deepEqual(docs.writes, []);
});

test("a read that fails saves nothing, and is tried again every ten minutes for two hours", async () => {
  const { docs, outage, runJob, wait, takeReads } = createRun({
    slate: keepSlateGames([DODGERS_AT_BRAVES]),
  });
  outage.isDown = true;

  /** @type {number[]} */
  const readAt = [];
  for (let minutes = 0; minutes <= 3 * 60; minutes += 5) {
    await runJob();
    if (takeReads().length) readAt.push(minutes);
    wait(5);
  }

  assert.deepEqual(readAt, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  assert.deepEqual(docs.writes, []);
});

test("a store with no season's slate reads nothing", async () => {
  const { runJob, takeReads } = createRun({ slate: null });
  await runJob();
  assert.deepEqual(takeReads(), []);
});
