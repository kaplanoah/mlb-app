import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { session } from "../page/js/session.js";
import {
  applyDeferredSeason,
  loadSeasonList,
  showEmptySeason,
  stopReadingAfterFailedLoad,
  watchYear,
} from "../page/js/season-store.js";

// A stand-in for the store: each watch answers with what's stored once the test moves on, or,
// when answers are held, once the test answers them.
function createStore(documents, { unreadable = [], isHeld = false } = {}) {
  const listeners = {};
  const heldAnswers = [];
  const readStored = (path) => ({
    id: path.split("/").pop(),
    exists: path in documents,
    data: () => documents[path],
  });
  const listStored = (name) => ({
    docs: Object.keys(documents)
      .filter((path) => path.startsWith(`${name}/`))
      .map(readStored),
  });
  const watch = (key, readAnswer) => (onNext, onError) => {
    const listener = { onNext, onError };
    listeners[key] = listener;
    const answer = () => {
      if (listeners[key] !== listener) return;
      if (unreadable.includes(key)) onError(new Error("unreadable"));
      else onNext(readAnswer());
    };
    if (isHeld) heldAnswers.push(answer);
    else queueMicrotask(answer);
    return () => {
      if (listeners[key] === listener) delete listeners[key];
    };
  };
  const database = {
    doc: (path) => ({
      onSnapshot: watch(path, () => readStored(path)),
    }),
    collection: (name) => ({
      limit: () => ({
        onSnapshot: watch(name, () => listStored(name)),
        get: async () => listStored(name),
      }),
    }),
  };
  const deliver = (path, data) => {
    documents[path] = data;
    listeners[path]?.onNext(readStored(path));
  };
  const deliverListing = (name) => listeners[name]?.onNext(listStored(name));
  const deliverMissing = (path) => {
    delete documents[path];
    listeners[path]?.onNext(readStored(path));
  };
  const answerHeld = (index) => heldAnswers[index]();
  return { database, deliver, deliverListing, deliverMissing, answerHeld };
}

function countRedraws() {
  const redraws = { season: 0, standings: 0, readings: 0 };
  const onChanges = {
    onSeasonChange: () => redraws.season++,
    onStandingsChange: () => redraws.standings++,
    onReadingsChange: () => redraws.readings++,
  };
  return { redraws, onChanges };
}

const IGNORED_REDRAWS = countRedraws().onChanges;

const STORED = {
  year: 2026,
  teams: { NYY: { league: "AL", seed: 1 } },
  series: { AL_WC1: { winsA: 1, winsB: 0 } },
  log: [{ kind: "lock", at: "2026-09-30T00:00:00Z" }],
};

const STANDINGS = { divisions: [], updatedAt: "2026-10-01T00:00:00Z" };
const READING_PART = { id: "2026-10-01-01", start: {}, changes: [] };

beforeEach(() => {
  session.activeYear = 2026;
  session.loadProblem = null;
  session.isReordering = false;
  Object.assign(session, { seasonDoc: null, storedStandings: null, readings: null, live: null });
});

test("a year loads from each watch's first answer, without redrawing", async () => {
  const documents = {
    "seasons/2026": structuredClone(STORED),
    "standings/2026": STANDINGS,
    "readings-2026/2026-10-01-01": READING_PART,
  };
  session.db = createStore(documents).database;
  const { redraws, onChanges } = countRedraws();

  await watchYear(2026, onChanges);

  assert.deepEqual(session.seasonDoc, STORED);
  assert.deepEqual(session.storedStandings, STANDINGS);
  assert.deepEqual(session.readings, [READING_PART]);
  assert.deepEqual(session.state.teams, STORED.teams);
  assert.deepEqual(redraws, { season: 0, standings: 0, readings: 0 });
});

test("answers that come in before the whole year has loaded don't redraw, and later ones do", async () => {
  const documents = { "seasons/2026": structuredClone(STORED) };
  const { database, deliver, answerHeld } = createStore(documents, { isHeld: true });
  session.db = database;
  const { redraws, onChanges } = countRedraws();

  const loaded = watchYear(2026, onChanges);
  answerHeld(0);
  deliver("standings/2026", STANDINGS);
  answerHeld(2);
  await loaded;
  assert.deepEqual(redraws, { season: 0, standings: 0, readings: 0 });
  assert.deepEqual(session.storedStandings, STANDINGS);

  deliver("standings/2026", { ...STANDINGS, updatedAt: "2026-10-01T01:00:00Z" });
  assert.deepEqual(redraws, { season: 0, standings: 1, readings: 0 });
});

test("once a year has loaded, a season or standings that answers it doesn't exist leaves what the page shows", async () => {
  const documents = { "seasons/2026": structuredClone(STORED), "standings/2026": STANDINGS };
  const { database, deliverMissing } = createStore(documents);
  session.db = database;
  const { redraws, onChanges } = countRedraws();
  await watchYear(2026, onChanges);

  deliverMissing("seasons/2026");
  deliverMissing("standings/2026");

  assert.deepEqual(session.seasonDoc, STORED);
  assert.deepEqual(session.storedStandings, STANDINGS);
  assert.deepEqual(redraws, { season: 0, standings: 0, readings: 0 });
});

test("once a year has loaded, a listing of its readings that comes back empty leaves them", async () => {
  const documents = {
    "seasons/2026": structuredClone(STORED),
    "readings-2026/2026-10-01-01": READING_PART,
  };
  const { database, deliverListing } = createStore(documents);
  session.db = database;
  const { redraws, onChanges } = countRedraws();
  await watchYear(2026, onChanges);

  delete documents["readings-2026/2026-10-01-01"];
  deliverListing("readings-2026");

  assert.deepEqual(session.readings, [READING_PART]);
  assert.deepEqual(redraws, { season: 0, standings: 0, readings: 0 });
});

test("a season that doesn't exist yet loads as an empty one", async () => {
  session.db = createStore({}).database;

  await watchYear(2026, IGNORED_REDRAWS);

  assert.deepEqual(session.seasonDoc, { year: 2026, teams: {}, series: {}, log: [] });
});

test("the page reads the field, its series, and the updates from the season's record, and leaves the rest to the live scores", async () => {
  const record = { ...structuredClone(STORED), slate: { today: { games: [] } }, standings: {} };
  session.db = createStore({ "seasons/2026": record }).database;

  await watchYear(2026, IGNORED_REDRAWS);

  assert.deepEqual(session.seasonDoc, STORED);
});

test("standings and readings that can't be read are left out of the year's load", async () => {
  const documents = { "seasons/2026": structuredClone(STORED), "standings/2026": STANDINGS };
  session.db = createStore(documents, { unreadable: ["standings/2026", "readings-2026"] }).database;
  session.storedStandings = STANDINGS;

  await watchYear(2026, IGNORED_REDRAWS);

  assert.deepEqual([session.storedStandings, session.readings], [null, null]);
  assert.deepEqual(session.seasonDoc, STORED);
});

test("a season that can't be read fails the year's load", async () => {
  const documents = { "seasons/2026": structuredClone(STORED) };
  session.db = createStore(documents, { unreadable: ["seasons/2026"] }).database;

  await assert.rejects(watchYear(2026, IGNORED_REDRAWS), /unreadable/);
});

test("without a store, the page shows an empty season", () => {
  session.db = null;
  session.activeYear = 2025;
  showEmptySeason(2025);
  assert.deepEqual(session.seasonDoc, { year: 2025, teams: {}, series: {}, log: [] });
});

test("a page whose load failed stops reading the store and says so", () => {
  session.db = createStore({}).database;

  stopReadingAfterFailedLoad();

  assert.equal(session.db, null);
  assert.match(session.loadProblem, /Couldn't load the season/);
});

test("a season that answers after the viewer picked another year is dropped", async () => {
  const documents = {
    "seasons/2025": { ...structuredClone(STORED), year: 2025 },
    "seasons/2026": structuredClone(STORED),
  };
  const { database, answerHeld } = createStore(documents, { isHeld: true });
  session.db = database;
  session.activeYear = 2025;
  watchYear(2025, IGNORED_REDRAWS);
  session.activeYear = 2026;
  const later = watchYear(2026, IGNORED_REDRAWS);
  for (const index of [3, 4, 5]) answerHeld(index);
  await later;
  answerHeld(0);
  assert.equal(session.seasonDoc.year, 2026);
});

test("updates to a year the viewer switched away from are dropped", async () => {
  const documents = { "seasons/2026": structuredClone(STORED) };
  const { database, deliver, deliverListing } = createStore(documents);
  session.db = database;
  await watchYear(2026, IGNORED_REDRAWS);
  session.activeYear = 2025;
  const { redraws, onChanges } = countRedraws();
  await watchYear(2025, onChanges);

  const newEntry = { kind: "elim", team: "SEA", at: "2026-10-01T00:00:00Z" };
  deliver("seasons/2026", { ...structuredClone(STORED), log: [...STORED.log, newEntry] });
  deliver("standings/2026", STANDINGS);
  documents["readings-2026/2026-10-01-01"] = READING_PART;
  deliverListing("readings-2026");

  assert.equal(session.seasonDoc.year, 2025);
  assert.deepEqual([session.storedStandings, session.readings], [null, []]);
  assert.deepEqual(redraws, { season: 0, standings: 0, readings: 0 });
});

test("stored clubs the page doesn't know are dropped on load", async () => {
  const documents = {
    "seasons/2026": { ...structuredClone(STORED), teams: { NYY: STORED.teams.NYY, "<b>": {} } },
  };
  session.db = createStore(documents).database;
  await watchYear(2026, IGNORED_REDRAWS);
  assert.deepEqual(Object.keys(session.seasonDoc.teams), ["NYY"]);
});

test("an update that arrives during a drag waits for it", async () => {
  const documents = { "seasons/2026": structuredClone(STORED) };
  const { database, deliver } = createStore(documents);
  session.db = database;
  const { redraws, onChanges } = countRedraws();
  await watchYear(2026, onChanges);

  session.isReordering = true;
  const newEntry = { kind: "elim", team: "SEA", at: "2026-10-01T00:00:00Z" };
  deliver("seasons/2026", { ...structuredClone(STORED), log: [...STORED.log, newEntry] });
  assert.equal(session.seasonDoc.log.length, 1);
  assert.equal(redraws.season, 0);

  session.isReordering = false;
  applyDeferredSeason();
  assert.deepEqual(session.seasonDoc.log, [...STORED.log, newEntry]);
});

// A season whose AL top seed swept through to win the World Series.
function buildSeasonWonBy(champion) {
  const AL = [champion, "NYY", "TOR", "SEA", "BOS", "DET"];
  const NL = ["PHI", "LAD", "MIL", "CHC", "SD", "NYM"];
  const teams = Object.fromEntries([
    ...AL.map((id, index) => [id, { league: "AL", seed: index + 1 }]),
    ...NL.map((id, index) => [id, { league: "NL", seed: index + 1 }]),
  ]);
  const won = (winsA) => ({ winsA, winsB: 0, started: true });
  const leagueSeries = (league) => ({
    [`${league}_WC1`]: won(2),
    [`${league}_WC2`]: won(2),
    [`${league}_DS1`]: won(3),
    [`${league}_DS2`]: won(3),
    [`${league}_CS`]: won(4),
  });
  return { teams, series: { ...leagueSeries("AL"), ...leagueSeries("NL"), WS: won(4) } };
}

test("a club that won more than one stored season keeps each title", async () => {
  session.db = createStore({
    "seasons/2026": { year: 2026, ...buildSeasonWonBy("CLE") },
    "seasons/2027": { year: 2027, ...buildSeasonWonBy("HOU") },
    "seasons/2028": { year: 2028, ...buildSeasonWonBy("CLE") },
  }).database;
  await loadSeasonList();

  assert.deepEqual(session.trackedTitles, { CLE: [2026, 2028], HOU: [2027] });
});
