import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describePlayerNote,
  describePosition,
  describeRankNote,
  drawSpread,
  renderPlayerBody,
  renderPlayerFacts,
  renderPlayerHeading,
} from "../page/js/player-view.js";
import { renderPlayerButton } from "../page/js/player-button.js";
import { buildSnapshot } from "../page/js/snapshot.js";
import { stripTags } from "../../../tests/text.js";
import { checkInTimeZone, EASTERN } from "../../../tests/time-zone.js";

const AFTERNOON = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-09-30-afternoon.json`, "utf8"),
);
const NOW = Date.parse(AFTERNOON.now);
const SEASON = buildSnapshot(AFTERNOON.responses, { season: 2026, now: NOW });

/** @param {any} markup */
const readText = (markup) =>
  stripTags(String(markup.text ?? markup).replace(/</g, " <"))
    .replace(/&bull;/g, " | ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const SUBJECT = { id: "1627668", team: "NYL", name: "Breanna Stewart" };

/** @param {Partial<Record<string, any>>} [stat] */
const describeStat = (stat) => ({
  key: "points",
  value: 20.8,
  rank: 7,
  count: 125,
  values: [2, 8, 20.8, 25],
  ...stat,
});

/** @returns {any} */
function createPlayer(changes = {}) {
  return {
    id: SUBJECT.id,
    team: "NYL",
    season: 2026,
    firstName: "Breanna",
    lastName: "Stewart",
    facts: {
      id: SUBJECT.id,
      number: "30",
      firstName: "Breanna",
      lastName: "Stewart",
      position: "F",
      height: `6'4"`,
      age: 32,
      college: "Connecticut",
      country: "USA",
      isOut: true,
      debut: 2016,
    },
    lastGame: {
      gameId: "1042600102",
      day: "2026-09-29",
      isPlayoffs: true,
      isWin: true,
      teamScore: 90,
      opponentScore: 81,
      points: 21,
      rebounds: 9,
      assists: 4,
      minutes: 36.95,
      steals: 2,
      blocks: 1,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: 15,
      threesMade: 1,
      threesAttempted: 4,
      freeThrowsMade: 4,
      freeThrowsAttempted: 5,
    },
    playoffPoints: { 1042600101: 34 },
    regularSeason: {
      games: 42,
      gamesNeeded: 31,
      averages: { points: 20.83, rebounds: 8.29, assists: 3.26, minutes: 32.95 },
      stats: [
        describeStat(),
        describeStat({ key: "threeShare", value: 0.254, rank: 76, count: 76 }),
      ],
    },
    ...changes,
  };
}

/** @param {any} player */
const renderBody = (player, { isLoading = false, isPastSeason = false } = {}) =>
  readText(renderPlayerBody({ player, isLoading, season: SEASON, isPastSeason, now: NOW }));

test("her heading is her team's dot and her name, with Out only while her team still plays", () => {
  const player = createPlayer();
  assert.match(readText(renderPlayerHeading(SUBJECT, player, true)), /^Breanna Stewart ?Out$/);
  assert.equal(readText(renderPlayerHeading(SUBJECT, player, false)), "Breanna Stewart");
  assert.equal(readText(renderPlayerHeading(SUBJECT, null, true)), "Breanna Stewart");
});

test("under her name, her team, number, and college, or her country for a player who skipped college", () => {
  assert.equal(
    readText(describePlayerNote(SUBJECT, createPlayer())),
    "Liberty | #30 | Connecticut",
  );
  const player = createPlayer();
  player.facts.college = null;
  assert.equal(readText(describePlayerNote(SUBJECT, player)), "Liberty | #30 | USA");
});

test("her facts name her position in words, and leave out any the league doesn't have", () => {
  assert.equal(
    readText(renderPlayerFacts(createPlayer(), false)),
    `Position Forward Height 6'4" Age 32 Debut 2016`,
  );
  const player = createPlayer();
  player.facts.age = null;
  assert.doesNotMatch(readText(renderPlayerFacts(player, false)), /Age/);
  assert.deepEqual(["G", "F", "C", "G-F", "F-C"].map(describePosition), [
    "Guard",
    "Forward",
    "Center",
    "Guard-Forward",
    "Forward-Center",
  ]);
});

test("her last game has its day and score, her numbers over her season's averages, and her shooting and defense", () => {
  const text = checkInTimeZone(EASTERN, () => renderBody(createPlayer()));
  assert.match(
    text,
    /^Last game Yesterday \| W 90-81 Pts Reb Ast Min 21 9 4 37\.0 Avg 20\.8 8\.3 3\.3 33\.0 /,
  );
  assert.match(text, /Shooting 8-15 FG \| 1-4 3PT \| 4-5 FT Defense 2 STL \| 1 BLK/);
});

test("her playoffs list her team's games with her points in each, DNP for one she missed, and its next game", () => {
  const text = renderBody(createPlayer());
  assert.match(
    text,
    /Playoffs Semis G1 W at Lynx 1st Rd 34 Pts G2 W vs Lynx 1st Rd DNP G1 at TBD Semis Sun, Oct 4 /,
  );
});

test("her regular season ranks each average among the players the WNBA ranks, on a curve, and says why the count varies", () => {
  const text = renderBody(createPlayer());
  assert.match(text, /Regular season 42 games Pts 20\.8 7th of 125 3P% 25\.4 76th of 76/);
  assert.match(text, /only ranks players who've played 31 games or, for shooting percentages/);
  assert.match(
    String(
      renderPlayerBody({
        player: createPlayer(),
        isLoading: false,
        season: SEASON,
        isPastSeason: false,
        now: NOW,
      }).text,
    ),
    /class="player-ranks" style="--mark-light: #449274; --mark-dark: #87d5b5;"/,
  );
});

test("a stat she isn't ranked in shows her number alone, and the note says why", () => {
  const player = createPlayer();
  player.regularSeason.games = 21;
  player.regularSeason.stats[0] = describeStat({ rank: null });
  const body = renderPlayerBody({
    player,
    isLoading: false,
    season: SEASON,
    isPastSeason: false,
    now: NOW,
  });
  assert.match(readText(body), /Pts 20\.8 3P% 25\.4 76th of 76/);
  assert.equal(String(body.text).match(/player-curve-area/g)?.length, 1);
  assert.equal(
    describeRankNote(player.regularSeason, false),
    "The WNBA only ranks players who've played 31 games or, for shooting percentages, made a certain number of shots. She's played 21 games.",
  );
  player.regularSeason.games = 1;
  assert.match(describeRankNote(player.regularSeason, false), /She's played 1 game\.$/);
});

test("a player who played enough games but made too few shots for a percentage is told which, by name", () => {
  const { regularSeason } = createPlayer();
  regularSeason.stats[1] = describeStat({ key: "threeShare", value: 0.125, rank: null });
  assert.equal(
    describeRankNote(regularSeason, false),
    "She hasn't made enough 3-pointers to be ranked in 3P%. The WNBA only ranks shooting percentages for players who've made a certain number of shots.",
  );
  assert.equal(
    describeRankNote(regularSeason, true),
    "She didn't make enough 3-pointers to be ranked in 3P%. The WNBA only ranks shooting percentages for players who've made a certain number of shots.",
  );
  regularSeason.stats.push(describeStat({ key: "freeThrowShare", value: 0.575, rank: null }));
  assert.match(
    describeRankNote(regularSeason, false),
    /^She hasn't made enough 3-pointers or free throws to be ranked in 3P% or FT%\./,
  );
  regularSeason.stats.push(describeStat({ key: "fieldGoalShare", value: 0.638, rank: null }));
  assert.match(
    describeRankNote(regularSeason, false),
    /^She hasn't made enough field goals, 3-pointers, or free throws to be ranked in FG%, 3P%, or FT%\./,
  );
});

test("a player who hasn't played says so above her team's playoff games", () => {
  const player = createPlayer({ lastGame: null, regularSeason: null, playoffPoints: {} });
  assert.match(renderBody(player), /^No games yet this season Playoffs .*DNP.*DNP/);
  assert.match(renderBody(player, { isPastSeason: true }), /^No games this season/);
});

test("while her numbers load the sheet holds their shape, and says so when they don't", () => {
  assert.match(
    String(
      renderPlayerBody({
        player: null,
        isLoading: true,
        season: SEASON,
        isPastSeason: false,
        now: NOW,
      }).text,
    ),
    /placeholder/,
  );
  assert.equal(renderBody(null), "Couldn't load her numbers. Close and try again in a minute.");
  assert.match(String(renderPlayerFacts(null, true)), /placeholder/);
  assert.equal(renderPlayerFacts(null, false), false);
  assert.equal(readText(describePlayerNote(SUBJECT, null)), "Liberty");
});

test("the curve spreads across from the lowest number to the highest, its peak at the top, with her mark on it", () => {
  const { area, edge, left, top } = drawSpread([10, 10, 10, 20], 20);
  assert.match(area, /^M0,20 L0\.0,2\.0 .* L100,20 Z$/);
  assert.match(edge, /^M0\.0,2\.0 /);
  assert.equal(left, 100);
  assert.ok(top > 10 && top < 100);
  assert.equal(drawSpread([5], 5).left, 50);
});

test("a player's name is a button that opens her sheet", () => {
  const button = renderPlayerButton(
    { id: 1627668, team: "NYL", firstName: "Breanna", lastName: "Stewart" },
    "Stewart",
  );
  assert.match(
    String(button.text),
    /<button type="button" class="player-open" data-player="1627668" data-player-team="NYL" data-player-name="Breanna Stewart">Stewart<\/button>/,
  );
});
