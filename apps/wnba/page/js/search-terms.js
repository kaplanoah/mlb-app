// The WNBA's words for a search of its season's games: its teams by name, city, code, and the
// nicknames fans use, the places its games are played, its playoff rounds, and how to read one of
// its games. Runs in the page and in Node, so it uses no DOM.

import { formatCalendarDate } from "#shared/days.js";
import { readGameDay } from "./days.js";
import { ROUNDS } from "./snapshot.js";
import { TEAMS } from "./teams.js";

/** @typedef {import("#shared/game-search.js").SearchTerms} SearchTerms */
/** @typedef {import("#shared/game-search.js").SearchGame} SearchGame */
/** @typedef {import("#shared/game-search.js").SearchPlace} SearchPlace */
/** @typedef {import("./games-view.js").Game} Game */

// The city of each team's own arena, as the league's schedule names it.
const HOME_CITIES = {
  ATL: "Atlanta",
  CHI: "Chicago",
  CON: "Uncasville",
  DAL: "Arlington",
  GSV: "San Francisco",
  IND: "Indianapolis",
  LAS: "Los Angeles",
  LVA: "Las Vegas",
  MIN: "Minneapolis",
  NYL: "Brooklyn",
  PDX: "Portland",
  PHX: "Phoenix",
  SEA: "Seattle",
  TOR: "Toronto",
  WAS: "Washington",
};

// What fans call a team besides its name, its city, and its code.
const NICKNAMES = {
  ATL: ["atl"],
  DAL: ["dallas"],
  GSV: ["valks", "golden state", "gs"],
  IND: ["indy"],
  LAS: ["la", "los angeles"],
  LVA: ["vegas", "lv"],
  NYL: ["libs", "ny", "nyc"],
  PHX: ["phx"],
  WAS: ["dc"],
};

// The places a search can name, each with the arena cities in it.
/** @type {SearchPlace[]} */
const PLACES = [
  {
    name: "New York",
    words: ["new york", "ny", "nyc", "brooklyn"],
    cities: ["Brooklyn", "New York"],
  },
  {
    name: "San Francisco",
    words: ["san francisco", "sf", "bay area", "golden state"],
    cities: ["San Francisco"],
  },
  { name: "Las Vegas", words: ["las vegas", "vegas", "lv"], cities: ["Las Vegas"] },
  { name: "Washington", words: ["washington", "dc", "washington dc"], cities: ["Washington"] },
  { name: "Atlanta", words: ["atlanta", "atl"], cities: ["Atlanta", "College Park"] },
  { name: "Dallas", words: ["dallas", "arlington"], cities: ["Arlington", "Dallas"] },
  { name: "Minnesota", words: ["minnesota", "minneapolis"], cities: ["Minneapolis"] },
  { name: "Indiana", words: ["indiana", "indianapolis", "indy"], cities: ["Indianapolis"] },
  { name: "Connecticut", words: ["connecticut", "uncasville", "ct"], cities: ["Uncasville"] },
  { name: "Los Angeles", words: ["los angeles", "la"], cities: ["Los Angeles"] },
  { name: "Chicago", words: ["chicago"], cities: ["Chicago"] },
  { name: "Seattle", words: ["seattle"], cities: ["Seattle"] },
  { name: "Phoenix", words: ["phoenix"], cities: ["Phoenix"] },
  { name: "Portland", words: ["portland"], cities: ["Portland"] },
  { name: "Toronto", words: ["toronto"], cities: ["Toronto"] },
];

const ROUND_WORDS = {
  1: ["first round", "1st round", "round 1", "round one", "opening round", "1st rd"],
  2: ["semifinals", "semifinal", "semis", "semi finals", "second round", "2nd round", "round 2"],
  3: ["finals", "wnba finals", "the finals", "championship", "final round"],
};

// Searches to tap before anything is typed, each offered only when it finds a game.
const EXAMPLES = [
  "Dream at Valkyries",
  "Aces in New York",
  "Games this weekend",
  "Finals",
  "Liberty last game",
  "Liberty next game",
  "Playoffs",
];

// An arena's name without the word every arena has, when what's left still names it.
const ARENA_WORD = /\s+(center|arena|fieldhouse|coliseum|garden)$/i;
const SHORT_ARENA_NAME_LENGTH = 6;

/** @param {string} code */
function listTeamWords(code) {
  const { city, name } = TEAMS[code];
  return [name, city, `${city} ${name}`, code, ...(NICKNAMES[code] ?? [])].map((word) =>
    word.toLowerCase(),
  );
}

/**
 * A place for each arena the season's games are played in that no place above covers, like a
 * neutral site's city, and for each arena by its own name, like "Barclays".
 * @param {Game[]} games
 * @returns {SearchPlace[]}
 */
function listArenaPlaces(games) {
  const arenas = new Map(
    games.filter((game) => game.arena).map((game) => [game.arena.name, game.arena]),
  );
  const known = new Set(PLACES.flatMap((place) => place.cities));
  const cities = [...new Set([...arenas.values()].map((arena) => arena.city))].filter(
    (city) => !known.has(city),
  );
  return [
    ...cities.map((city) => ({ name: city, words: [city.toLowerCase()], cities: [city] })),
    ...[...arenas.values()].map(({ name, city }) => {
      const short = name.replace(ARENA_WORD, "");
      const words = [
        name,
        ...(short !== name && short.length >= SHORT_ARENA_NAME_LENGTH ? [short] : []),
      ];
      return {
        name,
        words: words.map((word) => word.toLowerCase()),
        cities: [city],
        isArena: true,
      };
    }),
  ];
}

/**
 * The WNBA's terms for a season's search, with each team's conference from its standings.
 * @param {{ games: Game[], standings?: { team: string, conference: string }[] }} season
 * @returns {SearchTerms}
 */
export function createSearchTerms({ games, standings = [] }) {
  const conferences = new Map(standings.map((row) => [row.team, row.conference]));
  return {
    teams: Object.keys(TEAMS).map((code) => ({
      code,
      name: TEAMS[code].name,
      words: listTeamWords(code),
      homeCity: HOME_CITIES[code],
      conference: conferences.get(code) ?? "",
    })),
    places: [...PLACES, ...listArenaPlaces(games)],
    rounds: Object.entries(ROUNDS).map(([round, { name }]) => ({
      round: Number(round),
      name,
      words: ROUND_WORDS[round],
    })),
    kindNames: { cup: "Commissioner's Cup", allStar: "All-Star Game" },
    examples: EXAMPLES,
  };
}

const CUP_GAME_ID = /^105/;

/** @param {Game} game */
function readKind(game) {
  if (game.allStar) return "all-star";
  if (CUP_GAME_ID.test(game.id)) return "cup";
  return game.round ? "playoffs" : "regular";
}

/** @param {Game} game */
function readWinner(game) {
  if (game.state !== "final" || game.away.score === null || game.home.score === null) return null;
  return game.away.score > game.home.score ? game.away.team : game.home.team;
}

/**
 * A game's start in minutes after midnight on the viewer's clock, or null until its time is set.
 * @param {Game} game
 */
function readStartMinutes(game) {
  const start = new Date(game.start ?? "");
  if (!game.isTimeSet || Number.isNaN(start.getTime())) return null;
  return start.getHours() * 60 + start.getMinutes();
}

/**
 * A WNBA game as a search reads it, or null for one without a day.
 * @param {Game} game
 * @returns {SearchGame | null}
 */
export function readSearchGame(game) {
  const day = readGameDay(game);
  if (!day) return null;
  return {
    id: game.id,
    day: formatCalendarDate(day),
    minutes: readStartMinutes(game),
    startMs: Date.parse(game.start ?? "") || day.getTime(),
    away: game.allStar ? null : game.away.team,
    home: game.allStar ? null : game.home.team,
    state: /** @type {"pre" | "live" | "final"} */ (game.state),
    winner: game.allStar ? null : readWinner(game),
    kind: readKind(game),
    round: game.round,
    number: game.number,
    isIfNeeded: game.isIfNeeded,
    arena: game.arena ?? null,
    isNeutral: !!game.isNeutral,
    game,
  };
}
