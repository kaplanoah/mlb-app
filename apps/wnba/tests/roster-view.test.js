import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseSort,
  DEFAULT_SORT,
  describeRosterNote,
  matchAverages,
  renderRoster,
  renderRosterButton,
  renderRosterHeading,
  sortRows,
} from "../page/js/roster-view.js";
import { isStillPlaying } from "../page/js/series.js";
import { buildSnapshot } from "../page/js/snapshot.js";
import { describeRoster, listOutNames } from "../worker/src/roster.js";
import { convertToText, Markup } from "../../../shared/page/html.js";
import { stripTags } from "../../../tests/text.js";

const AFTERNOON = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-09-30-afternoon.json`, "utf8"),
);
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-01-games.json`, "utf8"),
);
const ROSTERS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-06-league-rosters.json`, "utf8"),
);
const { averages: AVERAGES, series: SERIES } = buildSnapshot(
  { ...AFTERNOON.responses, players: GAMES.preview.players },
  { season: 2026, now: Date.parse(AFTERNOON.now) },
);
const LIBERTY = describeRoster({
  team: "NYL",
  season: 2026,
  leagueRoster: ROSTERS.rosters["NYL:2026"],
  playerList: ROSTERS.playerList,
  outNames: listOutNames(ROSTERS.espnRosters.NYL),
  now: Date.parse(ROSTERS.recordedAt),
});

/** @param {{ sort?: any, isLoading?: boolean, roster?: any, showsOut?: boolean }} [options] */
const renderText = ({
  sort = DEFAULT_SORT,
  isLoading = false,
  roster = LIBERTY,
  showsOut = true,
} = {}) => renderRoster({ roster, averages: AVERAGES, sort, isLoading, showsOut }).text;

// A line of facts as it reads, each separator a bar.
/** @param {Markup} markup */
const readFacts = (markup) => stripTags(markup).replace(/&bull;/g, " | ");

/** @param {string} markup */
const listLastNames = (markup) =>
  [...markup.matchAll(/<span class="roster-last">([^<]+)/g)].map((match) => match[1]);

test("each player on the roster has her averages from the league, or none before she's played", () => {
  const rows = matchAverages(LIBERTY.players, AVERAGES);
  const findRow = (lastName) => rows.find((row) => row.lastName === lastName);
  assert.equal(rows.length, 15);
  assert.deepEqual(
    [findRow("Stewart").averages.points, findRow("Stewart").averages.games],
    [20.8, 42],
  );
  assert.equal(findRow("Balogun").averages, null);
});

test("a player finds her averages by the league's id, under whatever team they were last counted for", () => {
  const player = { ...LIBERTY.players[0], id: "1630149" };
  const averages = [{ ...AVERAGES[0], id: 1630149, team: "TOR" }];
  assert.equal(matchAverages([player], averages)[0].averages, averages[0]);
});

test("a player out shows so only while her team still plays: until the playoff field is set, then until it's out", () => {
  assert.match(renderText(), /Sabally<span class="foul-chip">/);
  assert.doesNotMatch(renderText({ showsOut: false }), /foul-chip/);
  assert.equal(isStillPlaying([], "PHX"), true);
  assert.equal(isStillPlaying(SERIES, "NYL"), true);
  assert.equal(isStillPlaying(SERIES, "PHX"), false);
  const lost = {
    ...SERIES[0],
    top: { team: "MIN", seed: 1, wins: 2 },
    bottom: { team: "NYL", seed: 8, wins: 0 },
    winner: "MIN",
  };
  assert.equal(isStillPlaying([lost], "NYL"), false);
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
  const rows = matchAverages(LIBERTY.players, AVERAGES);
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
  assert.deepEqual(byHome.slice(-3), ["Sabally", "Gardner", "Carrera"]);
});

test("the roster lists its players by last name with their facts, their points, rebounds, and assists a game, and its coach", () => {
  const markup = renderText();
  assert.deepEqual(listLastNames(markup).slice(0, 3), ["Allen", "Astier", "Balogun"]);
  assert.match(markup, /<dt>Head coach<\/dt>\s*<dd>Chris DeMarco<\/dd>/);
  assert.match(markup, /Balogun<span class="foul-chip"><span class="foul-chip-words">Out/);
  assert.match(markup, /<span class="roster-country">France<\/span>/);
  assert.match(markup, /scope="colgroup">Per game</);
  assert.match(markup, /class="roster-player" aria-sort="ascending"/);
  const stewart = markup.slice(markup.indexOf('data-key="1627668"'));
  const cells = [...stewart.slice(0, stewart.indexOf("</tr>")).matchAll(/<td[^>]*>([^<]*)/g)];
  assert.deepEqual(
    cells.map((cell) => convertToText(new Markup(cell[1]))),
    ["30", "F", `6'4"`, "Connecticut", "32", "2016", "42", "32.9", "20.8", "8.3", "3.3"],
  );
  assert.doesNotMatch(markup, /Steals|Blocks/);
});

test("the roster's sheet is titled by the team's name without its city, then Roster", () => {
  const heading = convertToText(renderRosterHeading("NYL"));
  assert.equal(heading.trim(), "Liberty Roster");
  assert.match(String(renderRosterHeading("NYL")), /class="dot"/);
});

test("the roster's sheet says its season, and how many players it has once it's loaded", () => {
  assert.equal(readFacts(describeRosterNote(LIBERTY, 2026)), "2026 | 15 players");
  assert.equal(readFacts(describeRosterNote(null, 2025)), "2025");
});

test("a team's Roster button names the team it opens the roster of", () => {
  assert.match(
    renderRosterButton("NYL").text,
    /^<button type="button" class="sheet-action" data-roster="NYL">Roster<svg/,
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
  assert.doesNotMatch(loading, /<dt>Head coach/);
  assert.match(
    renderText({ roster: null, isLoading: false }),
    /Couldn&#39;t load the roster\. Close and try again in a minute\./,
  );
});
