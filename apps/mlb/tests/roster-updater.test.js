import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readEasternDay } from "#shared/days.js";
import { listClubs, readMlbTeamId } from "../page/js/snapshot.js";
import { createRosterJob, listTransactionsRequest } from "../worker/src/roster-updater.js";
import {
  describeRoster,
  indexSeasonStats,
  listRosterRequest,
  listSeasonStatsRequest,
  nameRosterKey,
} from "../worker/src/rosters.js";

// What MLB answered early on Oct 8: the Guardians', Yankees', and Dodgers' 40-man rosters, their
// players' regular seasons, and the day's transactions.
const FIXTURE = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-08-rosters.json`, "utf8"),
);
const MLB_API = "https://statsapi.mlb.com";
const SEASON = FIXTURE.season;
const NOW = Date.parse(FIXTURE.recordedAt);
const MINUTE_MS = 60 * 1000;
const TODAY = readEasternDay(NOW).date;
const HITTING = listSeasonStatsRequest(SEASON, "hitting");
const PITCHING = listSeasonStatsRequest(SEASON, "pitching");
const TRANSACTIONS = listTransactionsRequest(TODAY);
const RECORDED = { CLE: 114, NYY: 147, LAD: 119 };

/** @param {string} club */
const nameClubRequest = (club) =>
  listRosterRequest(/** @type {number} */ (readMlbTeamId(club)), SEASON);

/**
 * MLB's answers, by request, each a copy a test can change: a club the fixture didn't record
 * answers with the Guardians' roster.
 */
function listAnswers() {
  const answers = structuredClone(FIXTURE.answers);
  for (const club of listClubs())
    answers[nameClubRequest(club)] ??= structuredClone(
      FIXTURE.answers[listRosterRequest(RECORDED.CLE, SEASON)],
    );
  return answers;
}

/** @param {Record<string, any>} answers */
function createMlbFetch(answers) {
  /** @type {string[]} */
  const requests = [];
  const refused = new Set();
  /** @param {string} url */
  const fetchImpl = async (url) => {
    const path = url.slice(MLB_API.length);
    requests.push(path);
    if (refused.has(path) || !(path in answers)) return new Response("", { status: 503 });
    return new Response(JSON.stringify(answers[path]));
  };
  return { requests, refused, fetchImpl };
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
    list: async () => [],
    write: async (/** @type {string} */ key, /** @type {any} */ doc) => {
      writes.push(key);
      stored.set(key, structuredClone(doc));
    },
    remove: async (/** @type {string} */ key) => stored.delete(key),
  };
}

/**
 * A slate with this many of today's games final, which the job counts as games end.
 * @param {number} finals
 */
const createSlate = (finals) => ({
  today: {
    date: TODAY,
    games: Array.from({ length: 4 }, (_, index) => ({ state: index < finals ? "final" : "pre" })),
  },
});

/** A store whose current season is 2026, and the job that keeps its rosters, run as it runs. */
function createRun() {
  const docs = createDocs({
    "live/current": { season: SEASON },
    [`seasons/${SEASON}`]: { year: SEASON, slate: createSlate(0) },
  });
  const answers = listAnswers();
  const mlb = createMlbFetch(answers);
  const clock = { now: NOW };
  const storage = createJobStorage();
  const job = createRosterJob();
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
  /** Takes the requests made since the last take. */
  const takeRequests = () => mlb.requests.splice(0);
  /** @param {number} finals */
  const endGames = (finals) =>
    docs.write(`seasons/${SEASON}`, { year: SEASON, slate: createSlate(finals) });
  return { docs, answers, refused: mlb.refused, runJob, wait, takeRequests, endGames };
}

/** @param {string[]} requests */
const listRosterClubs = (requests) =>
  requests
    .map((path) => /\/teams\/(\d+)\/roster/.exec(path)?.[1])
    .filter(Boolean)
    .map((id) => listClubs().find((club) => readMlbTeamId(club) === Number(id)));

/** Runs the job until every club's roster is read, five minutes apart. */
async function fillRosters(run) {
  for (let filled = 0; filled < 5; filled += 1) {
    await run.runJob();
    run.wait(5);
  }
  run.takeRequests();
  run.docs.writes.length = 0;
}

test("each club's roster has its active players and its injured list, each with his season so far", () => {
  const answers = FIXTURE.answers;
  const roster = describeRoster({
    club: "LAD",
    season: SEASON,
    roster: answers[listRosterRequest(RECORDED.LAD, SEASON)],
    hitting: indexSeasonStats(answers[HITTING]),
    pitching: indexSeasonStats(answers[PITCHING]),
  });

  assert.equal(roster.players.filter((player) => !player.injury).length, 26);
  assert.deepEqual(
    roster.players.filter((player) => player.injury).map((player) => player.injury),
    ["60-day IL", "15-day IL", "60-day IL", "60-day IL", "60-day IL", "60-day IL", "60-day IL"],
  );
  const ohtani = roster.players.find((player) => player.name === "Shohei Ohtani");
  assert.equal(ohtani?.position, "TWP");
  assert.ok(ohtani?.hitting?.plateAppearances > 0);
  assert.ok(ohtani?.pitching?.inningsPitched);
});

test("a player on the 40-man roster but not active or injured isn't on the club's", () => {
  const answer = FIXTURE.answers[listRosterRequest(RECORDED.CLE, SEASON)];
  const roster = describeRoster({
    club: "CLE",
    season: SEASON,
    roster: answer,
    hitting: new Map(),
    pitching: new Map(),
  });
  assert.equal(answer.roster.length, 40);
  assert.equal(roster.players.length, 26);
});

test("every club's roster fills six a run, after one read of every player's numbers and the day's transactions", async () => {
  const run = createRun();
  const runs = [];
  for (let index = 0; index < 6; index += 1) {
    await run.runJob();
    runs.push(run.takeRequests());
    run.wait(5);
  }

  assert.deepEqual(runs[0].slice(0, 1), [TRANSACTIONS]);
  assert.deepEqual(runs[0].slice(-2), [HITTING, PITCHING]);
  assert.deepEqual(
    runs.map((requests) => listRosterClubs(requests).length),
    [6, 6, 6, 6, 6, 0],
  );
  assert.deepEqual(
    runs
      .slice(1)
      .flat()
      .filter((path) => !path.includes("/roster")),
    [],
  );
  assert.deepEqual(new Set(listRosterClubs(runs.flat())), new Set(listClubs()));
  assert.equal(run.docs.writes.length, 30);
  assert.equal(run.docs.stored.get(nameRosterKey("LAD")).players.length, 33);
});

test("a transaction not seen before reads again only the rosters of the clubs it names", async () => {
  const run = createRun();
  await fillRosters(run);
  run.answers[TRANSACTIONS].transactions.push({
    id: 1,
    fromTeam: { id: 158 },
    toTeam: { id: 119 },
  });

  await run.runJob();
  assert.deepEqual(run.takeRequests(), [], "the transactions aren't old yet");
  run.wait(30);
  await run.runJob();

  const requests = run.takeRequests();
  assert.deepEqual(
    requests.filter((path) => !path.includes("/roster")),
    [TRANSACTIONS],
  );
  assert.deepEqual(listRosterClubs(requests).sort(), ["LAD", "MIL"]);
  run.wait(5);
  await run.runJob();
  assert.deepEqual(run.takeRequests(), [], "each read once");
});

test("a game's end reads every player's numbers again, and saves only the rosters that changed", async () => {
  const run = createRun();
  await fillRosters(run);
  const kwan = run.answers[HITTING].stats[0].splits.find(
    (/** @type {any} */ split) => split.player.id === 680757,
  );

  await run.endGames(1);
  kwan.stat.plateAppearances += 4;
  await run.runJob();

  assert.deepEqual(run.takeRequests(), [HITTING, PITCHING]);
  assert.deepEqual(
    [...new Set(run.docs.writes)].filter((key) => key.startsWith("rosters/")).length,
    listClubs().filter((club) => !["NYY", "LAD"].includes(club)).length,
    "every club answering with the Guardians' roster",
  );
  assert.ok(!run.docs.writes.includes(nameRosterKey("NYY")));
});

test("runs with nothing new read only the day's transactions, once they're old, and save nothing", async () => {
  const run = createRun();
  await fillRosters(run);
  for (let minutes = 0; minutes < 60; minutes += 5) {
    await run.runJob();
    run.wait(5);
  }
  assert.deepEqual(run.takeRequests(), [TRANSACTIONS, TRANSACTIONS]);
  assert.deepEqual(run.docs.writes, []);
});

test("each club's roster is read again once a day, six a run", async () => {
  const run = createRun();
  await fillRosters(run);
  run.wait(24 * 60 - 25);
  await run.runJob();
  const requests = run.takeRequests();
  assert.equal(listRosterClubs(requests).length, 6);
});

test("a roster MLB doesn't answer is read again on the next run", async () => {
  const run = createRun();
  run.refused.add(nameClubRequest("ARI"));
  await run.runJob();
  assert.ok(listRosterClubs(run.takeRequests()).includes("ARI"));
  run.refused.clear();
  run.wait(5);
  await run.runJob();
  assert.equal(listRosterClubs(run.takeRequests())[0], "ARI");
  assert.ok(run.docs.stored.has(nameRosterKey("ARI")));
});

test("a store with no current season reads nothing", async () => {
  const run = createRun();
  run.docs.stored.delete("live/current");
  await run.runJob();
  assert.deepEqual(run.takeRequests(), []);
});

test("rosters don't wait on every player's numbers, which save once MLB answers them", async () => {
  const run = createRun();
  run.refused.add(HITTING);
  await run.runJob();
  assert.equal(listRosterClubs(run.takeRequests()).length, 6);
  assert.deepEqual(run.docs.writes, []);
  run.refused.clear();
  run.wait(5);
  await run.runJob();
  assert.equal(
    run.docs.writes.filter((key) => key.startsWith("rosters/")).length,
    12,
    "the twelve read so far",
  );
});
