import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { listSides, renderMatchupBody } from "../page/js/matchup.js";
import { Markup, convertToText } from "../../../shared/page/html.js";
import { normalizeSpaces } from "../../../tests/text.js";
import { EASTERN, useTimeZone } from "../../../tests/time-zone.js";

useTimeZone(EASTERN);

// What the Worker answers for Astros at Athletics' starters, Blubaugh and Springs.
const describePitcher = (id, [firstName, lastName], line, ranks, pitches) => ({
  id,
  firstName,
  lastName,
  hand: "R",
  age: 27,
  line,
  ranks,
  starters: { count: 46 },
  pitches,
  starts: [
    { date: "2026-09-19", opp: "SEA", home: true, ip: "5.2", runs: 2, k: 6 },
    { date: "2026-09-13", opp: "TEX", home: false, ip: "6.0", runs: 0, k: 8 },
  ],
});
const BLUBAUGH = describePitcher(
  1,
  ["AJ", "Blubaugh"],
  { starts: 28, era: "3.66", k9: 9.1, bb9: 3.4, speed: 95.4 },
  {
    era: { rank: 17, of: 46 },
    k9: { rank: 3, of: 46 },
    bb9: { rank: 33, of: 46 },
    speed: { rank: 10, of: 46 },
  },
  [
    { code: "FF", name: "Four-seam FB", share: 0.52, mph: 95.4 },
    { code: "SL", name: "Slider", share: 0.3, mph: 86.1 },
    { code: "CH", name: "Changeup", share: 0.17, mph: 87.0 },
  ],
);
const SPRINGS = describePitcher(
  2,
  ["Jeffrey", "Springs"],
  { starts: 24, era: "4.02", k9: 7.7, bb9: 2.9, speed: 90.8 },
  {
    era: { rank: 29, of: 46 },
    k9: { rank: 26, of: 46 },
    bb9: { rank: 20, of: 46 },
    speed: { rank: 43, of: 46 },
  },
  [
    { code: "FF", name: "Four-seam FB", share: 0.4, mph: 90.8 },
    { code: "CH", name: "Changeup", share: 0.35, mph: 79.5 },
  ],
);

const TONIGHT = "2026-09-24";
const AT_ATHLETICS = {
  date: TONIGHT,
  start: "2026-09-25T01:40:00Z",
  state: "pre",
  away: "HOU",
  home: "ATH",
  starters: [
    { id: 1, name: "Blubaugh" },
    { id: 2, name: "Springs" },
  ],
  today: true,
};

/**
 * The sheet's markup once each side has loaded what the Worker answers for it.
 * @param {object} game
 * @param {object[]} loaded what each side, away then home, loads
 */
function renderLoaded(game, loaded) {
  const sides = listSides(game).map((side, index) => ({ ...side, ...loaded[index] }));
  return normalizeSpaces(String(renderMatchupBody(game, sides)));
}

const renderStarters = (away = BLUBAUGH, home = SPRINGS) =>
  renderLoaded(AT_ATHLETICS, [{ pitcher: away }, { pitcher: home }]);

const readText = (markup) => convertToText(new Markup(markup)).replace(/\s+/g, " ").trim();

/**
 * The text of every element with the class, in order.
 * @param {string} markup
 * @param {string} name
 */
const readClass = (markup, name) =>
  [...markup.matchAll(new RegExp(`<(\\w+) class="${name}"[^>]*>([\\s\\S]*?)</\\1>`, "g"))].map(
    ([, , inner]) => readText(inner),
  );

/**
 * Each measure's two sides, as the tape draws them.
 * @param {string} markup
 */
const readTape = (markup) =>
  [
    ...markup.matchAll(
      /<div class="tape-row">([\s\S]*?)<span class="tape-label">([^<]*)<\/span>([\s\S]*?)<\/div>\s*<\/div>/g,
    ),
  ].map(([, away, label, home]) => ({ label, away: readTapeSide(away), home: readTapeSide(home) }));

/** @param {string} side */
function readTapeSide(side) {
  const bar = side.match(/<i class="(lead)?" style="width: (\d+)%">/);
  return {
    value: readClass(side, "tape-value tabular")[0],
    bar: bar ? { width: Number(bar[2]), isLead: Boolean(bar[1]) } : null,
  };
}

const countMatches = (markup, pattern) => [...markup.matchAll(pattern)].length;

/** @param {string} isoTime @param {() => void} check */
function checkAt(isoTime, check) {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(isoTime) });
  try {
    check();
  } finally {
    mock.timers.reset();
  }
}

test("each bar is the share of starters he beats, gold for whichever starter ranks higher", () => {
  const markup = renderStarters();
  const tape = readTape(markup);
  assert.deepEqual(
    tape.map((measure) => measure.label),
    ["ERA", "K/9", "BB/9", "Fastball mph"],
  );
  assert.deepEqual(tape[0], {
    label: "ERA",
    away: { value: "3.66", bar: { width: 64, isLead: true } },
    home: { value: "4.02", bar: { width: 38, isLead: false } },
  });
  assert.deepEqual(readClass(markup, "tape-note"), [
    "Bars are the share of this season's 46 qualified starters he beats",
  ]);
});

test("a finished game without its starters names both clubs and has nothing to check back for", () => {
  const final = { ...AT_ATHLETICS, state: "final", starters: [] };
  const markup = renderLoaded(final, [{}, {}]);
  assert.equal(countMatches(markup, /<div class="pitcher-id (away|home)">/g), 2);
  assert.equal(countMatches(markup, /class="club team-open"/g), 2);
  assert.doesNotMatch(markup, /check-back/);
});

test("a game with its starters named has nothing to check back for", () => {
  const markup = renderStarters();
  assert.equal(countMatches(markup, /class="pitch-mix"/g), 2);
  assert.doesNotMatch(markup, /check-back/);
});

test("a club with no starts to go by says so", () => {
  const stillTbd = { ...AT_ATHLETICS, starters: [] };
  const markup = renderLoaded(stillTbd, [
    { rotation: { club: "HOU", date: TONIGHT, starters: [] } },
    { failed: true },
  ]);
  const astros = markup.slice(
    0,
    markup.indexOf('<section class="scout">', markup.indexOf("scout") + 1),
  );
  assert.deepEqual(readClass(astros, "scout-note"), ["No starts in the last two weeks to go by"]);
  assert.doesNotMatch(astros, /class="rotation"/);
});

test("a starter outside the qualified starters has his numbers, and a line saying why he has no bars", () => {
  const markup = renderStarters(BLUBAUGH, { ...SPRINGS, ranks: null });
  const tape = readTape(markup);
  assert.deepEqual(
    tape.map((measure) => measure.home),
    ["4.02", "7.7", "2.9", "90.8"].map((value) => ({ value, bar: null })),
  );
  assert.equal(tape[0].away.value, "3.66");
  assert.ok(tape.every((measure) => !measure.away.bar.isLead));
  assert.deepEqual(readClass(markup, "tape-note"), [
    "Bars are the share of this season's 46 qualified starters he beats",
    "Springs hasn't pitched enough innings to rank among this season's qualified starters",
  ]);
});

test("with neither starter ranked, the sheet says why and drops the note about bars", () => {
  const markup = renderStarters({ ...BLUBAUGH, ranks: null }, { ...SPRINGS, ranks: null });
  assert.deepEqual(readClass(markup, "tape-note"), [
    "Blubaugh hasn't pitched enough innings to rank among this season's qualified starters",
    "Springs hasn't pitched enough innings to rank among this season's qualified starters",
  ]);
});

/** @param {{ isStillPitching: boolean }} options */
function readLiveStarts({ isStillPitching }) {
  const [blubaugh, springs] = AT_ATHLETICS.starters;
  const live = {
    ...AT_ATHLETICS,
    state: "live",
    starters: [{ ...blubaugh, pitching: isStillPitching }, springs],
  };
  const tonight = { date: TONIGHT, opp: "ATH", home: false, ip: "2.0", runs: 0, k: 3 };
  const pitcher = { ...BLUBAUGH, starts: [tonight, ...BLUBAUGH.starts] };
  const markup = renderLoaded(live, [{ pitcher }, { pitcher: SPRINGS }]);
  const [starts] = [...markup.matchAll(/<ul class="recent-starts">([\s\S]*?)<\/ul>/g)];
  return [...starts[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, start]) => ({
    parts: [...start.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(([, part]) => readText(part)),
    isNow: start.includes('class="start-now"'),
  }));
}

test("a start in the game under way says Now while he's still pitching", () =>
  checkAt("2026-09-25T02:30:00Z", () => {
    const [now, last] = readLiveStarts({ isStillPitching: true });
    assert.deepEqual(now, { parts: ["Now", "@ Athletics", "2 IP, 0 R, 3 K"], isNow: true });
    assert.deepEqual(last, {
      parts: ["Sep 19", "vs Mariners", "5 2/3 IP, 2 R, 6 K"],
      isNow: false,
    });
  }));

test("a start in the game under way says Today once he's pulled", () =>
  checkAt("2026-09-25T02:30:00Z", () => {
    const [today] = readLiveStarts({ isStillPitching: false });
    assert.deepEqual(today, { parts: ["Today", "@ Athletics", "2 IP, 0 R, 3 K"], isNow: false });
  }));

test("both starters' speed lines share one scale, from the slowest pitch either throws to the fastest", () => {
  const markup = renderStarters();
  const scales = [...markup.matchAll(/<div class="speed-labels"[^>]*>([\s\S]*?)<\/div>/g)].map(
    ([, labels]) =>
      labels
        .split(/<span class="speed-label"[^>]*>/)
        .slice(1)
        .map(readText),
  );
  assert.deepEqual(scales, [
    ["70 mph", "80", "90", "100"],
    ["70 mph", "80", "90", "100"],
  ]);
});

test("a starter whose numbers didn't load says so under his club, with Try again, and the other's still show", () => {
  const markup = renderLoaded(AT_ATHLETICS, [{ pitcher: BLUBAUGH }, { failed: true }]);
  const springs = markup.slice(markup.indexOf('<div class="pitcher-id home">'));
  assert.deepEqual(readClass(springs, "retry-side"), ["Couldn't load Try again"]);
  assert.equal(countMatches(markup, /class="retry-side"/g), 1);
  assert.equal(countMatches(markup, /data-retry/g), 1);
  assert.equal(countMatches(markup, /class="pitch-mix"/g), 1);
  assert.equal(countMatches(markup, /<section class="scout">/g), 1);
  assert.doesNotMatch(markup, /retry-block/);
});

test("a starter whose numbers didn't load still shows the first name the game keeps", () => {
  const withFirstNames = {
    ...AT_ATHLETICS,
    starters: [
      { id: 1, name: "Blubaugh", firstName: "AJ" },
      { id: 2, name: "Springs", firstName: "Jeffrey" },
    ],
  };
  const failed = renderLoaded(withFirstNames, [{ pitcher: BLUBAUGH }, { failed: true }]);
  assert.deepEqual(readClass(failed, "pitcher-first"), ["AJ", "Jeffrey"]);
  assert.match(failed, /data-player-name="Jeffrey Springs"/);
  const loading = renderLoaded(withFirstNames, [{ pitcher: BLUBAUGH }, {}]);
  assert.deepEqual(readClass(loading, "pitcher-first"), ["AJ", "Jeffrey"]);
});

test("with neither starter's numbers loaded, the section says so once, centered over Try again", () => {
  const markup = renderLoaded(AT_ATHLETICS, [{ failed: true }, { failed: true }]);
  assert.deepEqual(readClass(markup, "retry-title scout-note"), [
    "Couldn't load the starters' numbers",
  ]);
  assert.equal(countMatches(markup, /data-retry/g), 1);
  assert.match(markup, /class="retry-button filled"/);
  assert.doesNotMatch(markup, /retry-side|<section class="scout">/);
});

test("a club whose last starters didn't load says so with Try again, beside the other's", () => {
  const stillTbd = { ...AT_ATHLETICS, starters: [] };
  const markup = renderLoaded(stillTbd, [
    { rotation: { club: "HOU", date: TONIGHT, starters: [] } },
    { failed: true },
  ]);
  const athletics = markup.slice(markup.lastIndexOf('<section class="scout">'));
  assert.deepEqual(readClass(athletics, "retry-message scout-note"), [
    "Couldn't load who started lately",
  ]);
  assert.equal(countMatches(markup, /data-retry/g), 1);
  assert.doesNotMatch(markup, /retry-block/);
});

test("with neither club's last starters loaded, the section says so once", () => {
  const stillTbd = { ...AT_ATHLETICS, starters: [] };
  const markup = renderLoaded(stillTbd, [{ failed: true }, { failed: true }]);
  assert.deepEqual(readClass(markup, "retry-title scout-note"), [
    "Couldn't load who started lately",
  ]);
  assert.equal(countMatches(markup, /data-retry/g), 1);
});

test("a lone named starter whose numbers didn't load leaves the section saying so", () => {
  const oneNamed = {
    ...AT_ATHLETICS,
    state: "final",
    starters: [{ id: 1, name: "Blubaugh" }, null],
  };
  const markup = renderLoaded(oneNamed, [{ failed: true }, {}]);
  assert.deepEqual(readClass(markup, "retry-title scout-note"), ["Couldn't load his numbers"]);
});
