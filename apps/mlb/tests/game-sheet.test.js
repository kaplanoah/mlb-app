import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderGameBody } from "../page/js/game-sheet.js";
import { listSides } from "../page/js/matchup.js";
import { buildSnapshot } from "../page/js/snapshot.js";
import { EASTERN, useTimeZone } from "../../../tests/time-zone.js";

useTimeZone(EASTERN);

const BROADCASTS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-broadcasts.json`, "utf8"),
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
  assert.match(markup, /FS1/);
  assert.match(markup, /FOX ONE/);
});

test("a live game still shows where it's on", () => {
  const markup = renderSlateGame((game) => game.away === "CLE" && game.state === "live");
  assert.match(markup, /aria-label="Where to watch"/);
  assert.match(markup, /TruTV/);
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
