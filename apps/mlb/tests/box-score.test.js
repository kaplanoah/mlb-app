import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createBoxScoreServer,
  describeBoxScore,
  nameFeedRequest,
  nameGameDetailsKey,
} from "../worker/src/box-score.js";

// MLB's live feed for each of the Division Series' games on the evening of Oct 7, trimmed to what
// the box score reads: two finals, two being played, and three still to start, two of them with
// their lineups posted.
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-games.json`, "utf8"),
);
const MLB_API = "https://statsapi.mlb.com";
const DODGERS_AT_BRAVES = "849819";
const GUARDIANS_AT_WHITE_SOX = "849833";
const RAYS_AT_YANKEES = "849838";
const TOMORROWS_GUARDIANS_AT_WHITE_SOX = "849832";

/** @param {string} id */
const describeGame = (id) => describeBoxScore(id, GAMES.feeds[id]);

/** @param {{ isDown?: boolean }} [options] */
function createMlbFetch({ isDown = false } = {}) {
  /** @type {string[]} */
  const requests = [];
  /** @param {string} url */
  const fetchImpl = async (url) => {
    const path = url.slice(MLB_API.length);
    requests.push(path);
    const id = /\/game\/(\d+)\//.exec(path)?.[1] ?? "";
    if (isDown || path !== nameFeedRequest(id) || !GAMES.feeds[id])
      return new Response("", { status: 503 });
    return new Response(JSON.stringify(GAMES.feeds[id]));
  };
  return { requests, fetchImpl };
}

/**
 * What the Worker answers for a game's box score, with the requests it made of MLB.
 * @param {string} id
 * @param {{ kept?: Record<string, any>, isDown?: boolean }} [options]
 */
async function askForBoxScore(id, { kept, isDown } = {}) {
  const mlb = createMlbFetch({ isDown });
  const server = createBoxScoreServer({ fetchImpl: mlb.fetchImpl });
  const readDoc = kept && (async (/** @type {string} */ key) => kept[key] ?? null);
  const url = new URL(`https://mlb.test/box-score?id=${encodeURIComponent(id)}`);
  const response = await server.serveBoxScore(url, readDoc);
  return { status: response.status, body: await response.json(), requests: mlb.requests };
}

test("a final's box score has each inning's runs, each club's runs, hits, and errors, and every batter and pitcher", () => {
  const boxScore = describeGame(DODGERS_AT_BRAVES);

  assert.equal(boxScore.state, "final");
  assert.deepEqual(
    boxScore.innings.map((/** @type {any} */ inning) => [inning.away, inning.home]),
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [3, 0],
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  );
  assert.deepEqual(boxScore.totals, {
    away: { runs: 3, hits: 8, errors: 0 },
    home: { runs: 1, hits: 5, errors: 2 },
  });
  assert.deepEqual(boxScore.away.batters[0], {
    name: "Betts",
    position: "SS",
    isSub: false,
    atBats: 5,
    runs: 0,
    hits: 2,
    rbi: 0,
    walks: 0,
    strikeOuts: 1,
  });
  assert.deepEqual(
    boxScore.away.pitchers.map((/** @type {any} */ pitcher) => [
      pitcher.name,
      pitcher.decision,
      pitcher.inningsPitched,
    ]),
    [
      ["Yamamoto", "W", "7.0"],
      ["Scott", null, "1.0"],
      ["Díaz", "S", "1.0"],
    ],
  );
  assert.equal(boxScore.home.pitchers[0].decision, "L");
});

test("a sub bats after the batter he replaced", () => {
  const batters = describeGame(DODGERS_AT_BRAVES).away.batters.map(
    (/** @type {any} */ batter) => `${batter.name}${batter.isSub ? " (sub)" : ""}`,
  );
  assert.deepEqual(batters.slice(2, 5), ["Hernández, T", "Muncy (sub)", "Smith, W"]);
});

test("a game being played has no runs yet for the half inning still to come", () => {
  const boxScore = describeGame(GUARDIANS_AT_WHITE_SOX);
  assert.equal(boxScore.state, "live");
  assert.deepEqual(boxScore.innings.at(-1), { away: 2, home: null });
});

test("before first pitch, a club's posted lineup has each batter's season so far, and there are no innings or pitchers", () => {
  const boxScore = describeGame(RAYS_AT_YANKEES);

  assert.equal(boxScore.state, "pre");
  assert.deepEqual(boxScore.innings, []);
  assert.equal(boxScore.away.batters.length, 9);
  assert.deepEqual(boxScore.away.batters[0], {
    name: "Díaz, Y",
    position: "DH",
    average: ".293",
    homeRuns: 22,
    rbi: 85,
  });
  assert.deepEqual([boxScore.away.pitchers, boxScore.home.pitchers], [[], []]);
});

test("a game whose clubs haven't posted their lineups has no batters", () => {
  const boxScore = describeGame(TOMORROWS_GUARDIANS_AT_WHITE_SOX);
  assert.deepEqual([boxScore.away.batters, boxScore.home.batters], [[], []]);
});

test("a final the store keeps is served as it is, without reading MLB", async () => {
  const kept = { [nameGameDetailsKey(DODGERS_AT_BRAVES)]: describeGame(DODGERS_AT_BRAVES) };

  const answer = await askForBoxScore(DODGERS_AT_BRAVES, { kept });

  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, describeGame(DODGERS_AT_BRAVES));
  assert.deepEqual(answer.requests, []);
});

test("a game the store has no final for is read from MLB", async () => {
  const kept = {
    [nameGameDetailsKey(GUARDIANS_AT_WHITE_SOX)]: {
      ...describeGame(GUARDIANS_AT_WHITE_SOX),
      innings: [],
    },
  };

  const answer = await askForBoxScore(GUARDIANS_AT_WHITE_SOX, { kept });

  assert.deepEqual(answer.body, describeGame(GUARDIANS_AT_WHITE_SOX));
  assert.deepEqual(answer.requests, [nameFeedRequest(GUARDIANS_AT_WHITE_SOX)]);
});

test("a request that names no game is refused, and MLB not answering says so", async () => {
  assert.equal((await askForBoxScore("not-a-game")).status, 400);
  const answer = await askForBoxScore(RAYS_AT_YANKEES, { isDown: true });
  assert.equal(answer.status, 502);
  assert.match(answer.body.error, /MLB/);
});
