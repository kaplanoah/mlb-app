import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseSort,
  DEFAULT_SORT,
  matchAverages,
  renderRoster,
  sortRows,
} from "../page/js/roster-view.js";
import { buildSnapshot } from "../page/js/snapshot.js";
import { describeRoster } from "../worker/src/roster.js";
import { convertToText, Markup } from "../../../shared/page/html.js";

const AFTERNOON = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-09-30-afternoon.json`, "utf8"),
);
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-01-games.json`, "utf8"),
);
const ROSTERS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-06-espn-rosters.json`, "utf8"),
);
const { averages: AVERAGES } = buildSnapshot(
  { ...AFTERNOON.responses, players: GAMES.preview.players },
  { season: 2026, now: Date.parse(AFTERNOON.now) },
);
const DEBUTS = new Map([["2998928", 2016]]);
const LIBERTY = describeRoster("NYL", ROSTERS.teams.NYL.roster, DEBUTS);

/** @param {{ markup?: any, sort?: any, isLoading?: boolean, roster?: any }} [options] */
const renderText = ({ sort = DEFAULT_SORT, isLoading = false, roster = LIBERTY } = {}) =>
  renderRoster({ roster, averages: AVERAGES, sort, isLoading }).text;

/** @param {string} markup */
const listLastNames = (markup) =>
  [...markup.matchAll(/<span class="roster-last">([^<]+)/g)].map((match) => match[1]);

test("each player on the roster has her averages from the league, or none before she's played", () => {
  const rows = matchAverages(LIBERTY.players, AVERAGES, "NYL");
  const findRow = (lastName) => rows.find((row) => row.lastName === lastName);
  assert.equal(rows.length, 15);
  assert.deepEqual(
    [findRow("Stewart").averages.points, findRow("Stewart").averages.games],
    [20.8, 42],
  );
  assert.equal(findRow("Balogun").averages, null);
});

test("a name the league spells with an accent ESPN leaves out still finds her averages", () => {
  const player = { ...LIBERTY.players[0], firstName: "Leonie", lastName: "Fiebich" };
  const averages = [{ ...AVERAGES[0], team: "NYL", firstName: "Léonie", lastName: "Fiebich" }];
  assert.equal(matchAverages([player], averages, "NYL")[0].averages, averages[0]);
});

test("a column's first tap sorts the most first for an average and A to Z or the least first for the rest, and its second reverses it", () => {
  assert.deepEqual(chooseSort(DEFAULT_SORT, "points"), { key: "points", isDescending: true });
  assert.deepEqual(chooseSort({ key: "points", isDescending: true }, "points"), {
    key: "points",
    isDescending: false,
  });
  assert.deepEqual(chooseSort({ key: "points", isDescending: true }, "age"), {
    key: "age",
    isDescending: false,
  });
  assert.deepEqual(chooseSort(DEFAULT_SORT, "name"), { key: "name", isDescending: true });
});

test("players without a value for the sorted column stay last either way, and ties go by name", () => {
  const rows = matchAverages(LIBERTY.players, AVERAGES, "NYL");
  const byPoints = sortRows(rows, { key: "points", isDescending: true }).map((row) => row.lastName);
  const byFewestPoints = sortRows(rows, { key: "points", isDescending: false }).map(
    (row) => row.lastName,
  );
  assert.equal(byPoints[0], "Stewart");
  assert.equal(byPoints.at(-1), "Balogun");
  assert.equal(byFewestPoints.at(-1), "Balogun");
  const byHeight = sortRows(rows, { key: "height", isDescending: true }).map((row) => row.height);
  assert.deepEqual(byHeight.slice(0, 2), [`6'11"`, `6'6"`]);
  const byHome = sortRows(rows, { key: "home", isDescending: false }).map((row) => row.lastName);
  assert.deepEqual(byHome.slice(-3), ["Astier", "Carrera", "Fauthoux"]);
});

test("the roster lists its players by last name with their facts and averages, its coach, and how many it has", () => {
  const markup = renderText();
  assert.deepEqual(listLastNames(markup).slice(0, 3), ["Allen", "Astier", "Balogun"]);
  assert.match(markup, /15 players/);
  assert.match(markup, /<dt>Head coach<\/dt>\s*<dd>Chris DeMarco<\/dd>/);
  assert.match(markup, /Balogun<span class="foul-chip"><span class="foul-chip-words">Out/);
  assert.match(markup, /<span class="roster-country">Australia<\/span>/);
  assert.match(markup, /scope="colgroup">Per game</);
  assert.match(markup, /class="roster-player" aria-sort="ascending"/);
  const stewart = markup.slice(markup.indexOf('data-key="2998928"'));
  const cells = [...stewart.slice(0, stewart.indexOf("</tr>")).matchAll(/<td[^>]*>([^<]*)/g)];
  assert.deepEqual(
    cells.map((cell) => convertToText(new Markup(cell[1]))),
    ["30", "F", `6'4"`, "UConn", "32", "2016", "42", "32.9", "20.8", "8.3", "3.3", "1.4", "1.3"],
  );
});

test("the sorted column says which way it sorts", () => {
  const markup = renderText({ sort: { key: "points", isDescending: true } });
  assert.match(markup, /title="Points per game" aria-sort="descending"/);
  assert.equal(listLastNames(markup)[0], "Stewart");
  assert.doesNotMatch(markup, /class="roster-player" aria-sort/);
});

test("while the roster loads, stand-ins hold its shape, and a roster that didn't load says to try again", () => {
  const loading = renderText({ roster: null, isLoading: true });
  assert.match(loading, /class="placeholder"/);
  assert.doesNotMatch(loading, /players<\/span>/);
  assert.match(
    renderText({ roster: null, isLoading: false }),
    /Couldn&#39;t load the roster\. Close and try again in a minute\./,
  );
});
