import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderBoxScore } from "../page/js/box-score-view.js";
import { isEarlierBoxScore, renderGameBody } from "../page/js/game-sheet.js";
import { listSides } from "../page/js/matchup.js";
import { buildSnapshot } from "../page/js/snapshot.js";
import { describeBoxScore } from "../worker/src/box-score.js";
import { EASTERN, useTimeZone } from "../../../tests/time-zone.js";

useTimeZone(EASTERN);

const BROADCASTS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-broadcasts.json`, "utf8"),
);
// MLB's live feed for each of the Division Series' games on the evening of Oct 7.
const GAMES = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-games.json`, "utf8"),
);
const { slate } = buildSnapshot(BROADCASTS.responses, {
  season: BROADCASTS.season,
  now: Date.parse(BROADCASTS.now),
});

/** @param {(game: any) => boolean} isWanted */
function renderSlateGame(isWanted) {
  const game = { ...[...slate.today.games, ...slate.previous].find(isWanted), today: true };
  return String(renderGameBody(game, listSides(game)));
}

test("a game still to come shows where to watch it, between its row and its starters", () => {
  const markup = renderSlateGame((game) => game.away === "MIL" && game.home === "SD");
  const where = markup.indexOf('aria-label="Where to watch"');
  assert.ok(markup.indexOf("game-row") < where && where < markup.indexOf("starters-open"));
  assert.match(markup, /alt="FS1"/);
  assert.match(markup, /alt="FOX One"/);
});

test("a live game still shows where it's on", () => {
  const markup = renderSlateGame((game) => game.away === "CLE" && game.state === "live");
  assert.match(markup, /aria-label="Where to watch"/);
  assert.match(markup, /<span class="network-name">TruTV<\/span>/);
});

test("a game that has ended no longer says where it was on", () => {
  const markup = renderSlateGame((game) => game.state === "final");
  assert.doesNotMatch(markup, /class="networks/);
});

test("a game still to come with no channels listed yet says to check back", () => {
  const game = { ...slate.today.games.find((each) => each.state === "pre"), networks: undefined };
  const markup = String(renderGameBody({ ...game, today: true }, listSides(game)));
  assert.match(markup, /Check back for where to watch/);
});

/** @param {string} id */
const describeGame = (id) => describeBoxScore(id, GAMES.feeds[id]);

/**
 * Each row of each table of a kind in markup, as its cells' text.
 * @param {string} markup
 * @param {string} tableClass
 */
function readRows(markup, tableClass) {
  const tables = markup.split(`<table class="st ${tableClass}">`).slice(1);
  return tables.map((table) =>
    [...table.split("</table>")[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) =>
        cell[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    ),
  );
}

test("a final's Innings show each club's runs in each, an x where the home club never batted, and its runs, hits, and errors", () => {
  const markup = String(renderBoxScore({ away: "MIL", home: "SD" }, describeGame("849826")));
  assert.deepEqual(readRows(markup, "line-score")[0], [
    ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "R", "H", "E"],
    ["MIL", "0", "0", "0", "1", "1", "0", "1", "0", "0", "3", "11", "1"],
    ["SD", "0", "0", "2", "0", "1", "1", "0", "0", "x", "4", "6", "0"],
  ]);
});

test("a game being played leaves the half innings still to come blank", () => {
  const markup = String(renderBoxScore({ away: "CLE", home: "CWS" }, describeGame("849833")));
  assert.deepEqual(readRows(markup, "line-score")[0][2], [
    "CWS",
    "1",
    "0",
    "0",
    "1",
    "0",
    "1",
    "0",
    "",
    "",
    "3",
    "6",
    "0",
  ]);
});

test("each club's batters, with their team's totals, come before its pitchers, with each one's decision", () => {
  const markup = String(renderBoxScore({ away: "LAD", home: "ATL" }, describeGame("849819")));
  const [batters, pitchers] = readRows(markup, "box-table");
  assert.deepEqual(batters[0], ["Batters", "AB", "R", "H", "RBI", "BB", "K"]);
  assert.deepEqual(batters[1], ["Betts SS", "5", "0", "2", "0", "0", "1"]);
  assert.deepEqual(batters.at(-1), ["Team", "36", "3", "8", "3", "2", "12"]);
  assert.deepEqual(pitchers[0], ["Pitchers", "IP", "H", "R", "ER", "BB", "K"]);
  assert.deepEqual(pitchers.map((row) => row[0]).slice(1), ["Yamamoto W", "Scott", "Díaz S"]);
  assert.match(
    markup,
    /<tr class="box-sub">\s*<td class="team"><span class="box-name">Muncy<\/span>/,
  );
});

test("before first pitch, each club's posted lineup shows its batters' seasons, and no innings", () => {
  const markup = String(renderBoxScore({ away: "TB", home: "NYY" }, describeGame("849838")));
  assert.doesNotMatch(markup, /line-score/);
  const lineups = readRows(markup, "box-table");
  assert.equal(lineups.length, 2);
  assert.deepEqual(lineups[0].slice(0, 2), [
    ["Batters", "AVG", "HR", "RBI"],
    ["Díaz, Y DH", ".293", "22", "85"],
  ]);
  assert.equal((markup.match(/<span>Lineup<\/span>/g) ?? []).length, 2);
});
test("a game whose clubs haven't posted their lineups shows nothing below its starters", () => {
  const game = { ...slate.next.find((each) => each.id === "849832"), today: false };
  const markup = String(renderGameBody(game, listSides(game), describeGame("849832")));
  assert.doesNotMatch(markup, /sheet-part/);
});

test("the box score follows the game's row and its starters", () => {
  const game = {
    ...slate.today.games.find((each) => each.id === "849838"),
    date: slate.today.date,
    today: true,
  };
  const markup = String(renderGameBody(game, listSides(game), describeGame("849838")));
  assert.ok(markup.indexOf("starters-open") < markup.indexOf("Lineup"));
});

test("a box score from before the one shown is passed over, and one from after it, or the same, is taken", () => {
  const live = describeGame("849822");
  const later = structuredClone(live);
  later.away.batters[0].atBats += 1;
  const final = { ...structuredClone(later), state: "final" };
  const lineups = describeGame("849838");

  assert.equal(isEarlierBoxScore(live, later), true);
  assert.equal(isEarlierBoxScore(later, final), true);
  assert.equal(isEarlierBoxScore(lineups, live), true);
  assert.equal(isEarlierBoxScore(later, live), false);
  assert.equal(isEarlierBoxScore(live, live), false);
  assert.equal(isEarlierBoxScore(live, null), false);
});
