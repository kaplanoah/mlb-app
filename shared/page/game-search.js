// Reading a search of a season's games, like "Liberty at Dream", "Dream in NY", or "Liberty this
// weekend", into what each word asks of a game, finding the games that ask fits, and saying how it
// read the words. A league hands it what differs: its teams, places, rounds, and example searches,
// and how to read one of its games. Everything runs on the phone, from the season the page already
// holds, so a search never waits on the network. Runs in the page and in Node, so it uses no DOM.
//
// Joining words decide roles: "A at B" and "A @ B" have A visiting B, while "A B", "A vs B", and
// "A and B" find their games either way, and "A or B" either team's. "In" takes a place or a month,
// and a game is where its arena is, so "home" is a team's own arena and a home game the league plays
// at a neutral site is left out and named. Every condition must hold, and "next" and "last" then
// pick from what's left. A game whose time isn't set yet counts in a search of its day, and in a
// search for a time of day it's listed by date with the rest and counted apart, since it may yet fit.

import { addDays, formatCalendarDate } from "./days.js";
import {
  CALENDAR_ENTRIES,
  RANGE_TIMES,
  findWeekday,
  formatDays,
  isInRange,
  isOnWeekdays,
  overlapRanges,
  readClockRange,
  readClockWord,
  readMonthDays,
  readNamedRange,
  readNextDays,
  readPartOfMonth,
  readTimeOfDay,
} from "./search-dates.js";
import { createDictionary, readTokens } from "./search-words.js";

/** @typedef {import("./search-words.js").Meaning} Meaning */
/** @typedef {import("./search-words.js").Token} Token */
/** @typedef {import("./search-dates.js").DayRange} DayRange */
/** @typedef {import("./search-dates.js").TimeOfDay} TimeOfDay */
/**
 * A league's game as a search reads it: the day the list shows it under, its start in minutes on
 * the viewer's clock, or null until its time is set, and where it's played, once the league says.
 * @typedef {object} SearchGame
 * @property {string} id
 * @property {string} day "YYYY-MM-DD"
 * @property {number | null} minutes
 * @property {number} startMs
 * @property {string | null} away
 * @property {string | null} home
 * @property {"pre" | "live" | "final"} state
 * @property {string | null} winner
 * @property {"regular" | "playoffs" | "all-star" | "cup"} kind
 * @property {number | null} round
 * @property {number | null} number
 * @property {boolean} isIfNeeded
 * @property {{ name: string, city: string, state: string } | null} arena
 * @property {boolean} isNeutral
 * @property {any} game the league's own game
 */
/**
 * A team as a search knows it: the words that name it, where its arena is, and its conference.
 * @typedef {{ code: string, name: string, words: string[], homeCity: string, conference: string }} SearchTeam
 */
/**
 * A place, the words that name it, and the arena cities and states that are in it, or an arena by
 * its own name.
 * @typedef {{ name: string, words: string[], cities: string[], states?: string[], isArena?: boolean }} SearchPlace
 */
/**
 * What a league hands a search.
 * @typedef {object} SearchTerms
 * @property {SearchTeam[]} teams
 * @property {SearchPlace[]} places
 * @property {{ round: number, name: string, words: string[] }[]} rounds
 * @property {{ cup: string, allStar: string }} kindNames what the league calls its cup and All-Star Game
 * @property {string[]} examples whole searches to offer before anything is typed
 */
/**
 * @typedef {object} SearchContext
 * @property {SearchTerms} terms
 * @property {import("./search-words.js").Dictionary} dictionary
 * @property {SearchGame[]} games the season's games, in order of start
 * @property {string} today
 * @property {number} year the season's
 * @property {string} seasonStart
 * @property {string} seasonEnd
 * @property {Map<string, SearchTeam>} teamsByCode
 */
/**
 * What a search asks of a game.
 * @typedef {object} Search
 * @property {{ code: string, join: string | null }[]} teams each team, with the joining word before it
 * @property {string | null} conference
 * @property {"home" | "away" | null} side
 * @property {SearchPlace[]} places
 * @property {DayRange[]} ranges
 * @property {{ value: number[], label: string } | null} weekdays
 * @property {TimeOfDay[]} times
 * @property {string[]} kinds
 * @property {number[]} rounds
 * @property {number | null} gameNumber
 * @property {boolean} isIfNeeded
 * @property {string[]} states
 * @property {"win" | "loss" | null} outcome
 * @property {{ which: "next" | "last", count: number } | null} pick
 * @property {{ name: string, label: string } | null} landmark
 * @property {string[]} skipped the words it couldn't use, as typed
 */

const FILLER = [
  "a",
  "an",
  "the",
  "games",
  "when",
  "whens",
  "do",
  "does",
  "did",
  "is",
  "are",
  "was",
  "were",
  "will",
  "what",
  "whats",
  "who",
  "whos",
  "show",
  "me",
  "schedule",
  "of",
  "for",
  "team",
  "teams",
  "match",
  "matchup",
  "matchups",
  "see",
  "find",
  "all",
  "any",
  "every",
  "please",
  "list",
  "my",
  "i",
  "can",
  "where",
  "there",
  "that",
  "with",
  "day",
  "days",
  "this",
  "season",
  "s",
  "?",
];

// What every league's searches share: how words join, and words for a game's state and kind.
/** @type {{ phrase: string, meaning: Meaning }[]} */
const GENERAL_ENTRIES = [
  ...FILLER.map((phrase) => ({ phrase, meaning: { kind: "filler" } })),
  { phrase: "game", meaning: { kind: "game" } },
  ...["at", "@"].map((phrase) => ({ phrase, meaning: { kind: "join", value: "at" } })),
  ...[
    "vs",
    "v",
    "versus",
    "against",
    "play",
    "plays",
    "playing",
    "face",
    "faces",
    "facing",
    "meet",
    "meets",
    "host",
    "hosts",
    "hosting",
  ].map((phrase) => ({ phrase, meaning: { kind: "join", value: "vs" } })),
  { phrase: "and", meaning: { kind: "join", value: "and" } },
  { phrase: "or", meaning: { kind: "join", value: "or" } },
  { phrase: "in", meaning: { kind: "in" } },
  { phrase: "on", meaning: { kind: "on" } },
  ...["home", "at home", "home games"].map((phrase) => ({
    phrase,
    meaning: { kind: "side", value: "home", display: "at home" },
  })),
  ...["away", "road", "on the road", "away games", "road games"].map((phrase) => ({
    phrase,
    meaning: { kind: "side", value: "away", display: "away" },
  })),
  ...["next", "upcoming game"].map((phrase) => ({
    phrase,
    meaning: { kind: "pick", value: "next", display: "next game" },
  })),
  ...["last", "previous", "latest", "most recent"].map((phrase) => ({
    phrase,
    meaning: { kind: "pick", value: "last", display: "last game" },
  })),
  ...["live", "on now", "right now", "now", "in progress"].map((phrase) => ({
    phrase,
    meaning: { kind: "state", value: "live", display: "live" },
  })),
  ...["upcoming", "remaining", "left", "future", "unplayed", "to come"].map((phrase) => ({
    phrase,
    meaning: { kind: "state", value: "pre", display: "upcoming" },
  })),
  ...["results", "result", "scores", "score", "final", "played", "finished", "past"].map(
    (phrase) => ({ phrase, meaning: { kind: "state", value: "final", display: "results" } }),
  ),
  ...["playoffs", "playoff", "postseason", "post season"].map((phrase) => ({
    phrase,
    meaning: { kind: "kind", value: "playoffs", display: "playoffs" },
  })),
  {
    phrase: "regular season",
    meaning: { kind: "kind", value: "regular", display: "regular season" },
  },
  ...["all star", "allstar", "all star game", "asg"].map((phrase) => ({
    phrase,
    meaning: { kind: "kind", value: "all-star", display: "All-Star" },
  })),
  ...["if needed", "if necessary"].map((phrase) => ({
    phrase,
    meaning: { kind: "if-needed", display: "if needed" },
  })),
  ...["win", "wins", "won", "victory", "victories", "beat"].map((phrase) => ({
    phrase,
    meaning: { kind: "outcome", value: "win", display: "wins" },
  })),
  ...["loss", "losses", "lost", "lose", "defeat", "defeats"].map((phrase) => ({
    phrase,
    meaning: { kind: "outcome", value: "loss", display: "losses" },
  })),
  ...["opening night", "opener", "season opener", "opening day", "first game of the season"].map(
    (phrase) => ({
      phrase,
      meaning: { kind: "landmark", value: "opener", display: "season opener" },
    }),
  ),
  ...["season finale", "finale", "last game of the season", "final game of the season"].map(
    (phrase) => ({
      phrase,
      meaning: { kind: "landmark", value: "finale", display: "season finale" },
    }),
  ),
  ...["all star break", "allstar break", "break"].map((phrase) => ({
    phrase,
    meaning: { kind: "landmark", value: "break" },
  })),
];

const KIND_LABELS = { playoffs: "Playoffs", regular: "Regular season" };
const STATE_LABELS = { live: "Live", pre: "Upcoming", final: "Results" };
const OUTCOME_LABELS = { win: "Wins", loss: "Losses" };

// When a phrase can mean several things, the word before it decides: after "in", a place or a date
// comes before a team, as in "Dream in New York", and otherwise a team comes first.
const PREFERRED_AFTER = {
  in: ["place", "month", "range", "weekday", "team"],
  at: ["team", "place", "side"],
  none: ["team", "conference", "place", "month", "range", "weekday"],
};

/**
 * Every phrase a league's searches know, its own words and the calendar's.
 * @param {SearchTerms} terms
 */
export function createSearchDictionary(terms) {
  const conferences = [...new Set(terms.teams.map((team) => team.conference))];
  return createDictionary([
    ...GENERAL_ENTRIES,
    ...CALENDAR_ENTRIES,
    ...terms.teams.flatMap((team) =>
      team.words.map((phrase) => ({
        phrase,
        meaning: { kind: "team", value: team.code, display: team.name },
      })),
    ),
    ...terms.places.flatMap((place) =>
      place.words.map((phrase) => ({
        phrase,
        meaning: { kind: "place", value: place, display: place.name },
      })),
    ),
    ...terms.rounds.flatMap(({ round, name, words }) =>
      words.map((phrase) => ({ phrase, meaning: { kind: "round", value: round, display: name } })),
    ),
    ...conferences.flatMap((conference) =>
      [conference, `${conference}ern`, `${conference}ern conference`, `${conference} teams`].map(
        (phrase) => ({
          phrase,
          meaning: { kind: "conference", value: conference, display: conference },
        }),
      ),
    ),
    {
      phrase: "commissioners cup",
      meaning: { kind: "kind", value: "cup", display: terms.kindNames.cup },
    },
    { phrase: "cup", meaning: { kind: "kind", value: "cup", display: terms.kindNames.cup } },
  ]);
}

/**
 * What a search needs to know of the season, read once for each drawing.
 * @param {{ terms: SearchTerms, dictionary: import("./search-words.js").Dictionary, games: SearchGame[], now: number }} season
 * @returns {SearchContext}
 */
export function createSearchContext({ terms, dictionary, games, now }) {
  const today = formatCalendarDate(new Date(now));
  const days = games.map((game) => game.day);
  const seasonStart = days[0] ?? today;
  return {
    terms,
    dictionary,
    games,
    today,
    year: Number(seasonStart.slice(0, 4)),
    seasonStart,
    seasonEnd: days.at(-1) ?? today,
    teamsByCode: new Map(terms.teams.map((team) => [team.code, team])),
  };
}

/** @returns {Search} */
const createEmptySearch = () => ({
  teams: [],
  conference: null,
  side: null,
  places: [],
  ranges: [],
  weekdays: null,
  times: [],
  kinds: [],
  rounds: [],
  gameNumber: null,
  isIfNeeded: false,
  states: [],
  outcome: null,
  pick: null,
  landmark: null,
  skipped: [],
});

/**
 * The meaning a phrase has where it is, from the word before it.
 * @param {Meaning[]} meanings
 * @param {string | null} before "in", "at", or null
 */
function chooseMeaning(meanings, before) {
  if (meanings.length < 2) return meanings[0] ?? null;
  const order = PREFERRED_AFTER[before ?? "none"] ?? PREFERRED_AFTER.none;
  const rank = (/** @type {Meaning} */ meaning) => {
    const index = order.indexOf(meaning.kind);
    return index < 0 ? order.length : index;
  };
  return [...meanings].sort((first, second) => rank(first) - rank(second))[0];
}

/** @param {Token | undefined} token */
const readNumber = (token) =>
  token && /^\d{1,2}(st|nd|rd|th)?$/.test(token.text) ? Number.parseInt(token.text, 10) : null;

/**
 * @param {Token | undefined} token
 * @param {string} kind
 */
const hasKind = (token, kind) => !!token?.meanings.some((meaning) => meaning.kind === kind);

/**
 * @param {Token | undefined} token
 * @param {string} kind
 */
const findKind = (token, kind) => token?.meanings.find((meaning) => meaning.kind === kind);

// Each reader takes the tokens from where it stands and says how many it used, or 0 when the words
// there aren't its own.
/**
 * @typedef {object} ReadState
 * @property {Token[]} tokens
 * @property {number} at
 * @property {Search} search
 * @property {SearchContext} context
 * @property {string | null} join the joining word waiting for the team after it
 * @property {string | null} before "in", "at", or "on", waiting for what comes next
 */

/**
 * A month, a day of one, or days of one: "June", "June 12", "June 12th", "June 12 to 15", or
 * "June 12 - July 2".
 * @param {ReadState} state
 * @param {number} month
 */
function readMonthAt(state, month) {
  const { tokens, at, context, search } = state;
  const day = readNumber(tokens[at + 1]);
  if (day === null) {
    search.ranges.push(readMonthDays(month, context.year));
    return 1;
  }
  const from = readMonthDays(month, context.year, [day, day]).from;
  const toMonth = findKind(tokens[at + 3], "month")?.value;
  const endOffset = toMonth ? 4 : 3;
  const endDay = hasKind(tokens[at + 2], "to") ? readNumber(tokens[at + endOffset]) : null;
  const to =
    endDay === null ? from : readMonthDays(toMonth ?? month, context.year, [endDay, endDay]).from;
  search.ranges.push({ from, to, label: formatDays(from, to) });
  return endDay === null ? 2 : endOffset + 1;
}

/** @param {ReadState} state */
function readNumberAt(state) {
  const { tokens, at, context, search } = state;
  const token = tokens[at];
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(token.text);
  if (slash) {
    const day = readMonthDays(Number(slash[1]), context.year, [Number(slash[2]), Number(slash[2])]);
    search.ranges.push({ ...day, label: formatDays(day.from, day.to) });
    return 1;
  }
  const number = readNumber(token);
  const month = findKind(tokens[at + 1], "month")?.value;
  if (number !== null && month) {
    const day = readMonthDays(month, context.year, [number, number]);
    search.ranges.push({ ...day, label: formatDays(day.from, day.to) });
    return 2;
  }
  if (number !== null && /(st|nd|rd|th)$/.test(token.text)) {
    const thisMonth = Number(context.today.slice(5, 7));
    const day = readMonthDays(thisMonth, context.year, [number, number]);
    search.ranges.push({ ...day, label: formatDays(day.from, day.to) });
    return 1;
  }
  return readClockAt(state, "at");
}

/**
 * A clock time, with the side of it a game starts on: "after 9", "before 7 pm", or "at 7:30".
 * @param {ReadState} state
 * @param {"after" | "before" | "at"} side
 */
function readClockAt(state, side) {
  const { tokens, at, search } = state;
  const meridiem = findKind(tokens[at + 1], "meridiem")?.value;
  const minutes = readClockWord(tokens[at]?.text ?? "", meridiem);
  if (minutes === null) return 0;
  search.times.push(readClockRange(side, minutes));
  return meridiem ? 2 : 1;
}

/**
 * "Next" or "last", with how many: "next game", "last 5", or the days ahead, "next 7 days". Before
 * a weekday, it picks the day, as "last Saturday" does.
 * @param {ReadState} state
 * @param {"next" | "last"} which
 */
function readPickAt(state, which) {
  const { tokens, at, context, search } = state;
  const weekday = findKind(tokens[at + 1], "weekday")?.value;
  if (weekday !== undefined) {
    const day = findWeekday(
      weekday,
      which === "last" ? context.today : addDays(context.today, 1),
      which,
    );
    search.ranges.push({ from: day, to: day, label: formatDays(day, day) });
    return 2;
  }
  const count = readNumber(tokens[at + 1]);
  if (count !== null && which === "next" && /^days?$/.test(tokens[at + 2]?.text ?? "")) {
    search.ranges.push(readNextDays(count, context.today));
    return 3;
  }
  search.pick = { which, count: count ?? 1 };
  return count === null ? 1 : 2;
}

/**
 * "Before" or "after" a clock time, or the All-Star break.
 * @param {ReadState} state
 * @param {"before" | "after"} side
 */
function readSideOfAt(state, side) {
  const { tokens, at, search } = state;
  const breakAt = tokens.findIndex(
    (token, index) =>
      index > at && !hasKind(token, "filler") && findKind(token, "kind")?.value !== "all-star",
  );
  if (findKind(tokens[breakAt], "landmark")?.value === "break") {
    search.landmark = {
      name: `${side}-break`,
      label: `${side === "before" ? "Before" : "After"} the All-Star break`,
    };
    return breakAt - at + 1;
  }
  const next = tokens[at + 1];
  const used = next ? readClockAt({ ...state, at: at + 1 }, side) : 0;
  return used ? used + 1 : 0;
}

/**
 * "Early", "mid", or "late" in a month, or, for "late", late games.
 * @param {ReadState} state
 * @param {string} part
 */
function readPartAt(state, part) {
  const { tokens, at, context, search } = state;
  const month = findKind(tokens[at + 1], "month")?.value;
  if (month) {
    search.ranges.push(readPartOfMonth(part, month, context.year));
    return 2;
  }
  if (part !== "late") return 0;
  search.times.push(readTimeOfDay("late"));
  return 1;
}

/**
 * "Game 3", a game of a series.
 * @param {ReadState} state
 */
function readGameNumberAt(state) {
  const number = readNumber(state.tokens[state.at + 1]);
  if (number === null) return 1;
  state.search.gameNumber = number;
  return 2;
}

/**
 * What one meaning asks of a game, from where it stands.
 * @param {ReadState} state
 * @param {Meaning} meaning
 * @returns {number} how many tokens it used
 */
function readMeaningAt(state, meaning) {
  const { search, context } = state;
  const readers = {
    filler: () => 1,
    to: () => 1,
    game: () => readGameNumberAt(state),
    join: () => {
      state.join = meaning.value;
      if (meaning.value === "at") state.before = "at";
      return 1;
    },
    in: () => ((state.before = "in"), 1),
    on: () => ((state.before = "on"), 1),
    team: () => {
      search.teams.push({ code: meaning.value, join: state.join });
      state.join = null;
      return 1;
    },
    conference: () => ((search.conference = meaning.value), 1),
    place: () => (search.places.push(meaning.value), 1),
    side: () => ((search.side = meaning.value), 1),
    month: () => readMonthAt(state, meaning.value),
    weekday: () => {
      const day = findWeekday(meaning.value, context.today);
      search.ranges.push({ from: day, to: day, label: formatDays(day, day) });
      return 1;
    },
    weekdays: () => ((search.weekdays = { value: meaning.value, label: meaning.display }), 1),
    range: () => {
      search.ranges.push(readNamedRange(meaning.value, context));
      if (RANGE_TIMES[meaning.value]) search.times.push(readTimeOfDay(RANGE_TIMES[meaning.value]));
      return 1;
    },
    time: () => (search.times.push(readTimeOfDay(meaning.value)), 1),
    "part-of-month": () => readPartAt(state, meaning.value),
    after: () => readSideOfAt(state, "after"),
    before: () => readSideOfAt(state, "before"),
    pick: () => readPickAt(state, meaning.value),
    state: () => (search.states.push(meaning.value), 1),
    kind: () => (search.kinds.push(meaning.value), 1),
    round: () => (search.rounds.push(meaning.value), 1),
    "if-needed": () => ((search.isIfNeeded = true), 1),
    outcome: () => ((search.outcome = meaning.value), 1),
    landmark: () => {
      if (meaning.value === "break") return 0;
      search.landmark = {
        name: meaning.value,
        label: meaning.value === "opener" ? "Season opener" : "Season finale",
      };
      return 1;
    },
  };
  return readers[meaning.kind]?.() ?? 0;
}

/**
 * Reads a search's words into what it asks of a game.
 * @param {string} text
 * @param {SearchContext} context
 * @returns {Search}
 */
export function readSearch(text, context) {
  const tokens = readTokens(text, context.dictionary);
  /** @type {ReadState} */
  const state = { tokens, at: 0, search: createEmptySearch(), context, join: null, before: null };
  while (state.at < tokens.length) {
    const token = tokens[state.at];
    const meaning = chooseMeaning(token.meanings, state.before);
    const before = state.before;
    const used = meaning ? readMeaningAt(state, meaning) : readNumberAt(state);
    if (state.before === before && meaning?.kind !== "filler") state.before = null;
    if (!used) state.search.skipped.push(token.text);
    state.at += Math.max(used, 1);
  }
  return state.search;
}

/**
 * Whether a game has a team in it.
 * @param {SearchGame} game
 * @param {string} code
 */
const hasTeam = (game, code) => game.away === code || game.home === code;

/**
 * Who a search's teams are and how they're joined: one, one visiting another, both either way, or
 * any of them.
 * @param {Search} search
 * @returns {{ how: "one" | "at" | "vs" | "or", codes: string[] } | null}
 */
export function readTeamsAsked({ teams }) {
  if (!teams.length) return null;
  const codes = [...new Set(teams.map((team) => team.code))];
  if (codes.length === 1) {
    const isHostOnly = teams[0].join === "at";
    return { how: isHostOnly ? "at" : "one", codes: isHostOnly ? [null, codes[0]] : codes };
  }
  if (teams.some((team) => team.join === "or") || codes.length > 2) return { how: "or", codes };
  return { how: teams[1].join === "at" ? "at" : "vs", codes };
}

/**
 * The teams in a conference.
 * @param {SearchContext} context
 * @param {string} conference
 */
const listConferenceTeams = (context, conference) =>
  context.terms.teams.filter((team) => team.conference === conference).map((team) => team.code);

/**
 * Whether a game has the teams a search asks for, on the side it asks, leaving aside a home game
 * at a neutral site, which `isHomeElsewhere` names.
 * @param {Search} search
 * @param {SearchContext} context
 * @param {SearchGame} game
 */
function hasTeamsAsked(search, context, game) {
  const asked = readTeamsAsked(search);
  const rivals = search.conference ? listConferenceTeams(context, search.conference) : null;
  if (!asked) return !rivals || rivals.some((code) => hasTeam(game, code));
  const [first, second] = asked.codes;
  const checks = {
    one: () =>
      hasTeam(game, first) &&
      (!rivals || rivals.some((code) => code !== first && hasTeam(game, code))),
    at: () => (first === null || game.away === first) && game.home === second && !game.isNeutral,
    vs: () => hasTeam(game, first) && hasTeam(game, second),
    or: () => asked.codes.some((code) => hasTeam(game, code)),
  };
  if (!checks[asked.how]()) return false;
  if (search.side === "home") return game.home === first && !game.isNeutral;
  if (search.side === "away") return game.away === first;
  return true;
}

/**
 * Whether a game is a home game a search would find but for being at a neutral site.
 * @param {Search} search
 * @param {SearchGame} game
 */
function isHomeElsewhere(search, game) {
  const asked = readTeamsAsked(search);
  if (!asked || !game.isNeutral) return false;
  const host = asked.how === "at" ? asked.codes[1] : asked.codes[0];
  const isHomeAsked = search.side === "home" || asked.how === "at";
  return (
    isHomeAsked &&
    game.home === host &&
    (asked.how !== "at" || asked.codes[0] === null || game.away === asked.codes[0])
  );
}

/**
 * The city a game is played in: its arena's, or, until the league names one, its home team's.
 * @param {SearchContext} context
 * @param {SearchGame} game
 */
function readGameCity(context, game) {
  if (game.arena) return { city: game.arena.city, state: game.arena.state };
  const home = game.home && context.teamsByCode.get(game.home);
  return home && !game.isNeutral ? { city: home.homeCity, state: "" } : null;
}

/**
 * @param {SearchPlace} place
 * @param {{ city: string, state: string } | null} where
 */
const isInPlace = (place, where) =>
  !!where &&
  (place.cities.some((city) => city.toLowerCase() === where.city.toLowerCase()) ||
    !!place.states?.some((state) => state.toLowerCase() === where.state.toLowerCase()));

/**
 * Whether a game is played in a place.
 * @param {SearchPlace} place
 * @param {SearchGame} game
 * @param {SearchContext} context
 */
export const isGameInPlace = (place, game, context) =>
  isInPlace(place, readGameCity(context, game));

/**
 * The day a landmark of the season names, or the days on one side of it.
 * @param {SearchContext} context
 * @param {string} name
 * @param {SearchGame} game
 */
function isAtLandmark(context, name, game) {
  const regular = context.games.filter((each) => each.kind === "regular");
  const allStar = context.games.find((each) => each.kind === "all-star");
  const checks = {
    opener: () => game.kind === "regular" && game.day === regular[0]?.day,
    finale: () => game.kind === "regular" && game.day === regular.at(-1)?.day,
    "before-break": () => !!allStar && game.day < allStar.day && game.kind !== "all-star",
    "after-break": () => !!allStar && game.day > allStar.day,
  };
  return checks[name]();
}

/**
 * Whether a game fits every condition but for the time of day.
 * @param {Search} search
 * @param {SearchContext} context
 * @param {SearchGame} game
 */
function fitsAllButTime(search, context, game) {
  const range = search.ranges.length
    ? search.ranges.reduce((all, each) => all && overlapRanges(all, each))
    : null;
  const isPlayoffs = (/** @type {SearchGame} */ each) => each.kind === "playoffs";
  const checks = [
    () => search.ranges.length === 0 || (!!range && isInRange(range, game.day, game.minutes)),
    () => !search.weekdays || isOnWeekdays(search.weekdays.value, game.day, game.minutes),
    () =>
      !search.places.length || search.places.some((place) => isGameInPlace(place, game, context)),
    () => !search.kinds.length || search.kinds.some((kind) => game.kind === kind),
    () =>
      !search.rounds.length ||
      (isPlayoffs(game) && search.rounds.includes(/** @type {number} */ (game.round))),
    () => search.gameNumber === null || game.number === search.gameNumber,
    () => !search.isIfNeeded || game.isIfNeeded,
    () => !search.states.length || search.states.includes(game.state),
    () => !search.outcome || isOutcome(search, game),
    () => !search.landmark || isAtLandmark(context, search.landmark.name, game),
  ];
  return checks.every((check) => check());
}

/**
 * Whether a final went the way a search asks for its one team.
 * @param {Search} search
 * @param {SearchGame} game
 */
function isOutcome(search, game) {
  const team = search.teams[0]?.code;
  if (!team || game.state !== "final" || !game.winner) return false;
  return (game.winner === team) === (search.outcome === "win");
}

/**
 * Whether a game starts in every time of day a search asks for, or null when its time isn't set.
 * @param {Search} search
 * @param {SearchGame} game
 */
function fitsTime(search, game) {
  if (!search.times.length) return true;
  if (game.minutes === null) return null;
  return search.times.every(({ from, to }) => game.minutes >= from && game.minutes < to);
}

/**
 * The games "next" or "last" picks, in order of start.
 * @param {{ which: "next" | "last", count: number }} pick
 * @param {SearchGame[]} games
 */
function pickGames({ which, count }, games) {
  if (which === "next") return games.filter((game) => game.state !== "final").slice(0, count);
  return games.filter((game) => game.state === "final").slice(-count);
}

/**
 * The games a search finds, in order of start, with those whose time isn't set yet that a search for
 * a time of day may yet find, and the home games it leaves out for being at a neutral site.
 * @param {Search} search
 * @param {SearchContext} context
 */
export function findSearchGames(search, context) {
  const fitting = context.games.filter((game) => fitsAllButTime(search, context, game));
  const found = fitting.filter(
    (game) => hasTeamsAsked(search, context, game) && fitsTime(search, game) !== false,
  );
  const picked = search.pick ? pickGames(search.pick, found) : found;
  const timeUnset = search.times.length ? picked.filter((game) => game.minutes === null) : [];
  const leftOut = fitting.filter(
    (game) => isHomeElsewhere(search, game) && fitsTime(search, game) !== false,
  );
  return { games: picked, timeUnset, leftOut };
}

/**
 * @param {SearchContext} context
 * @param {string} code
 */
const nameTeam = (context, code) => context.teamsByCode.get(code)?.name ?? code;

/**
 * Names joined as a sentence does: "A", "A or B", "A, B, or C".
 * @param {string[]} names
 */
function joinNames(names) {
  if (names.length < 3) return names.join(" or ");
  return `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;
}

/**
 * What the line calls the teams a search asks for: "Liberty", "Liberty at home", "Liberty vs Dream",
 * "Liberty @ Dream", or "Liberty or Aces".
 * @param {Search} search
 * @param {SearchContext} context
 */
function describeTeams(search, context) {
  const asked = readTeamsAsked(search);
  if (!asked) return search.conference ? `${search.conference} teams` : null;
  const names = asked.codes.map((code) => (code ? nameTeam(context, code) : null));
  const sides = { home: " at home", away: " away" };
  const labels = {
    one: () =>
      `${names[0]}${search.conference ? ` vs ${search.conference}` : ""}${sides[search.side] ?? ""}`,
    at: () => (names[0] ? `${names[0]} @ ${names[1]}` : `${names[1]} at home`),
    vs: () => `${names[0]} vs ${names[1]}`,
    or: () => joinNames(names),
  };
  return labels[asked.how]();
}

/**
 * Each condition but the teams, as the line says it.
 * @param {Search} search
 * @param {SearchContext} context
 */
function listConditionLabels(search, context) {
  const range = search.ranges.length
    ? search.ranges.reduce((all, each) => all && overlapRanges(all, each))
    : null;
  const roundNames = search.rounds.map(
    (round) => context.terms.rounds.find((each) => each.round === round)?.name,
  );
  const kindNames = {
    ...KIND_LABELS,
    cup: context.terms.kindNames.cup,
    "all-star": context.terms.kindNames.allStar,
  };
  return [
    ...search.kinds.map((kind) => kindNames[kind]),
    ...roundNames,
    search.gameNumber !== null && `Game ${search.gameNumber}`,
    search.isIfNeeded && "If needed",
    ...search.places.map((place) => `In ${place.name}`),
    ...search.times.map((time) => time.label),
    search.ranges.length &&
      (range ? (search.ranges.length === 1 ? search.ranges[0].label : range.label) : "No days"),
    search.weekdays?.label,
    search.landmark?.label,
    ...search.states.map((state) => STATE_LABELS[state]),
    search.outcome && OUTCOME_LABELS[search.outcome],
  ].filter(Boolean);
}

/** @param {{ which: "next" | "last", count: number }} pick */
function describePick({ which, count }) {
  const first = which === "next" ? "Next" : "Last";
  return count === 1 ? `${first} game` : `${first} ${count} games`;
}

/** @param {number} count */
export const countGames = (count) =>
  count ? `${count} game${count === 1 ? "" : "s"}` : "No games";

/**
 * The line's note on home games at a neutral site: "1 in Vancouver left out".
 * @param {SearchGame[]} leftOut
 */
function describeLeftOut(leftOut) {
  if (!leftOut.length) return null;
  const cities = [...new Set(leftOut.map((game) => game.arena?.city).filter(Boolean))];
  const where = cities.length === 1 ? `in ${cities[0]}` : "played elsewhere";
  return `${leftOut.length} ${where} left out`;
}

/** @param {string[]} skipped */
function describeSkipped(skipped) {
  if (!skipped.length) return null;
  const quoted = skipped.map((word) => `'${word}'`);
  return `${quoted.length < 3 ? quoted.join(" and ") : `${quoted.slice(0, -1).join(", ")}, and ${quoted.at(-1)}`} unrecognized, skipped`;
}

/**
 * How the line under the field reads a search: what it's about, in bold, then what else it asks,
 * how many games it found, and anything it found only maybe, left out, or couldn't use.
 * @param {Search} search
 * @param {ReturnType<typeof findSearchGames>} found
 * @param {SearchContext} context
 * @returns {{ lead: string, facts: string[] }}
 */
export function describeSearch(search, found, context) {
  const teams = describeTeams(search, context);
  const conditions = listConditionLabels(search, context);
  const lead = teams ?? conditions.shift() ?? (search.pick ? null : "All games");
  const pick = search.pick && describePick(search.pick);
  const sure = found.games.length - found.timeUnset.length;
  const facts = [
    ...conditions,
    ...(lead === null ? [] : [pick]),
    !search.pick && countGames(sure),
    found.timeUnset.length && `${found.timeUnset.length} with no time yet`,
    describeLeftOut(found.leftOut),
    describeSkipped(search.skipped),
  ].filter(Boolean);
  return { lead: lead ?? /** @type {string} */ (pick), facts: /** @type {string[]} */ (facts) };
}

/**
 * When a search's one run of days is, in words that follow "games": "in March", "on Thu, Jun 11", or
 * "Oct 2-4".
 * @param {Search} search
 */
function describeWhen(search) {
  const range = search.ranges.length === 1 ? search.ranges[0] : null;
  if (!range) return "";
  if (range.from === range.to) return ` on ${range.label}`;
  return /\d/.test(range.label) ? ` ${range.label}` : ` in ${range.label}`;
}

/**
 * What the list says when a search finds nothing: "No Liberty games in March".
 * @param {Search} search
 * @param {SearchContext} context
 */
export function describeNoGames(search, context) {
  const asked = readTeamsAsked(search);
  const sides = { home: " home", away: " away" };
  const teams =
    asked?.how === "one" && !search.conference
      ? `${nameTeam(context, asked.codes[0])}${sides[search.side] ?? ""}`
      : describeTeams(search, context);
  const where = search.places.length ? ` in ${search.places[0].name}` : "";
  return `No ${teams ? `${teams} ` : ""}games${where}${describeWhen(search)}`;
}
