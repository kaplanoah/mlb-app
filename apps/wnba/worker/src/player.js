import { REQUESTS } from "../../page/js/snapshot.js";
import { TEAMS } from "../../page/js/teams.js";
import { describeError, respondJson } from "../../../../shared/worker/responses.js";
import { createReusedLoader } from "../../../../shared/worker/upstream.js";
import { SEASON_PARAM, fetchWnbaJson, hasTable, isCurrentSeason, readTable } from "./wnba.js";

// Reads what a player's sheet shows for a season: her facts from her team's roster that season,
// her last game and her points in each playoff game from her game logs, with the score from the
// league's log of every team's games, and, from every player's totals in the regular season, her
// averages and where each ranks among the players who meet the WNBA's rule for its leaders.

const WNBA_STATS = "https://stats.wnba.com/stats";
const REGULAR_SEASON = "Regular Season";
const PLAYOFFS = "Playoffs";
// The season's logs and totals change after each game, and a past season's never.
const CACHE_SECONDS = 10 * 60;
const PAST_CACHE_SECONDS = 24 * 60 * 60;
// A sheet opened again soon, on this phone or another, reuses what was just read.
const REUSE_MS = 5 * 60 * 1000;

// The WNBA ranks a player among its leaders once she has played 31 of the season's 44 games or
// reached a season's total in that stat, and in a percentage once she has made enough shots. Part
// way through a season, each is that share of it.
const FULL_SEASON_GAMES = 44;
const LEADER_GAMES = 31;

/**
 * @typedef {object} RankedStat
 * @property {string} key what the page calls it
 * @property {(row: Record<string, number>) => number | null} read her number, from her totals
 * @property {(row: Record<string, number>) => number} count what the rule counts, from her totals
 * @property {number} needed how many of it the rule asks for over a whole season
 * @property {boolean} [isShare] whether the rule counts only what she counts, not her games
 */

/**
 * @param {string} total
 * @returns {(row: Record<string, number>) => number | null}
 */
const readPerGame = (total) => (row) => (row.GP > 0 ? row[total] / row.GP : null);

/**
 * @param {string} made
 * @param {string} attempted
 * @returns {(row: Record<string, number>) => number | null}
 */
const readShare = (made, attempted) => (row) =>
  row[attempted] > 0 ? row[made] / row[attempted] : null;

/** @type {RankedStat[]} */
const RANKED_STATS = [
  { key: "points", read: readPerGame("PTS"), count: (row) => row.PTS, needed: 525 },
  { key: "rebounds", read: readPerGame("REB"), count: (row) => row.REB, needed: 260 },
  { key: "assists", read: readPerGame("AST"), count: (row) => row.AST, needed: 150 },
  { key: "steals", read: readPerGame("STL"), count: (row) => row.STL, needed: 55 },
  { key: "blocks", read: readPerGame("BLK"), count: (row) => row.BLK, needed: 40 },
  {
    key: "fieldGoalShare",
    read: readShare("FGM", "FGA"),
    count: (row) => row.FGM,
    needed: 110,
    isShare: true,
  },
  {
    key: "threeShare",
    read: readShare("FG3M", "FG3A"),
    count: (row) => row.FG3M,
    needed: 30,
    isShare: true,
  },
  {
    key: "freeThrowShare",
    read: readShare("FTM", "FTA"),
    count: (row) => row.FTM,
    needed: 55,
    isShare: true,
  },
];

// Two numbers this close are the same, however the division rounds.
const SAME_NUMBER = 1e-9;

/**
 * @param {string} id
 * @param {number} season
 * @param {string} seasonType
 */
export const nameGameLogRequest = (id, season, seasonType) =>
  `${WNBA_STATS}/playergamelogs?${new URLSearchParams({
    LeagueID: "10",
    PlayerID: id,
    Season: String(season),
    SeasonType: seasonType,
  })}`;

/**
 * Every team's games in a season.
 * @param {number} season
 * @param {string} seasonType
 */
export const nameTeamGameLogRequest = (season, seasonType) =>
  `${WNBA_STATS}/leaguegamelog?${new URLSearchParams({
    Counter: "0",
    Direction: "DESC",
    LeagueID: "10",
    PlayerOrTeam: "T",
    Season: String(season),
    SeasonType: seasonType,
    Sorter: "DATE",
  })}`;

/**
 * Every player's totals in a regular season, from the feed the season's averages come from.
 * @param {number} season
 */
export function nameTotalsRequest(season) {
  const url = new URL(REQUESTS.players(season));
  url.searchParams.set("PerMode", "Totals");
  return String(url);
}

// The feeds write a player's name whole; everything after the first space is her last name.
/** @param {string} name */
function splitName(name) {
  const [firstName, ...rest] = String(name).split(" ");
  return { firstName, lastName: rest.join(" ") };
}

/**
 * The most games any team has played, which the rule's share of a season counts from.
 * @param {Record<string, any>[]} teamGames
 */
function countSeasonGames(teamGames) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const game of teamGames) counts.set(game.TEAM_ID, (counts.get(game.TEAM_ID) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * What the rule asks for this far into a season.
 * @param {number} seasonGames
 * @param {number} needed over a whole season
 */
const prorate = (seasonGames, needed) => Math.ceil((needed * seasonGames) / FULL_SEASON_GAMES);

/**
 * Whether a player's totals meet the rule for a stat.
 * @param {Record<string, number>} row
 * @param {RankedStat} stat
 * @param {number} seasonGames
 */
function meetsRule(row, stat, seasonGames) {
  const hasCount = stat.count(row) >= prorate(seasonGames, stat.needed);
  if (stat.isShare) return hasCount;
  return hasCount || row.GP >= prorate(seasonGames, LEADER_GAMES);
}

/**
 * Her number in a stat, and, among the players who meet the rule, her place and every number, from
 * the lowest, for the page to draw how they spread.
 * @param {Record<string, number>} her
 * @param {Record<string, number>[]} everyone
 * @param {RankedStat} stat
 * @param {number} seasonGames
 */
function rankStat(her, everyone, stat, seasonGames) {
  const value = stat.read(her);
  const values = everyone
    .filter((row) => meetsRule(row, stat, seasonGames))
    .map(stat.read)
    .filter((each) => each != null)
    .sort((first, second) => first - second);
  const isRanked = value != null && meetsRule(her, stat, seasonGames);
  const rank = isRanked ? 1 + values.filter((each) => each > value + SAME_NUMBER).length : null;
  return { key: stat.key, value, rank, count: values.length, values: values.map(roundForCurve) };
}

// The page draws the spread a few dozen points wide, so four places are plenty.
/** @param {number} value */
const roundForCurve = (value) => Math.round(value * 10000) / 10000;

/**
 * Her regular season: her games, her averages, and her place in each ranked stat, or null before
 * she has played.
 * @param {string} id
 * @param {any} totals every player's totals in the regular season
 * @param {any} teamGames every team's games in it
 */
export function describeRegularSeason(id, totals, teamGames) {
  const everyone = readTable(totals, "LeagueDashPlayerStats");
  const her = everyone.find((row) => String(row.PLAYER_ID) === id);
  if (!her || !(her.GP > 0)) return null;
  const seasonGames = countSeasonGames(readTable(teamGames, "LeagueGameLog"));
  return {
    games: her.GP,
    gamesNeeded: prorate(seasonGames, LEADER_GAMES),
    averages: {
      points: her.PTS / her.GP,
      rebounds: her.REB / her.GP,
      assists: her.AST / her.GP,
      minutes: her.MIN / her.GP,
    },
    stats: RANKED_STATS.map((stat) => rankStat(her, everyone, stat, seasonGames)),
  };
}

/**
 * Her team's score and the other team's in a game, from every team's log, or nulls when the log
 * doesn't have it yet.
 * @param {Record<string, any>} game her row in her game log
 * @param {any} teamGames
 */
function readScore(game, teamGames) {
  const row = readTable(teamGames, "LeagueGameLog").find(
    (each) => each.GAME_ID === game.GAME_ID && each.TEAM_ID === game.TEAM_ID,
  );
  if (!row) return { teamScore: null, opponentScore: null };
  return { teamScore: row.PTS, opponentScore: row.PTS - row.PLUS_MINUS };
}

/**
 * Her line in a game and how it ended.
 * @param {Record<string, any>} game her row in her game log
 * @param {boolean} isPlayoffs
 * @param {any} teamGames every team's games of that kind
 */
const describeGame = (game, isPlayoffs, teamGames) => ({
  gameId: game.GAME_ID,
  day: String(game.GAME_DATE).slice(0, 10),
  isPlayoffs,
  isWin: game.WL === "W",
  ...readScore(game, teamGames),
  points: game.PTS,
  rebounds: game.REB,
  assists: game.AST,
  minutes: game.MIN,
  steals: game.STL,
  blocks: game.BLK,
  fieldGoalsMade: game.FGM,
  fieldGoalsAttempted: game.FGA,
  threesMade: game.FG3M,
  threesAttempted: game.FG3A,
  freeThrowsMade: game.FTM,
  freeThrowsAttempted: game.FTA,
});

/** @param {Record<string, any>[]} games */
const findLatest = (games) =>
  games.reduce(
    (latest, game) => (!latest || game.GAME_DATE > latest.GAME_DATE ? game : latest),
    /** @type {Record<string, any> | null} */ (null),
  );

/**
 * Her first and last names: her roster's, or her game log's or totals' when her team's roster that
 * season doesn't have her.
 * @param {any} facts
 * @param {Record<string, any>[]} rows
 */
function readNames(facts, rows) {
  if (facts) return { firstName: facts.firstName, lastName: facts.lastName };
  const named = rows.find((row) => row?.PLAYER_NAME);
  return named ? splitName(named.PLAYER_NAME) : null;
}

/** @param {URLSearchParams} searchParams */
function readId(searchParams) {
  const id = searchParams.get("id") ?? "";
  return /^\d{1,12}$/.test(id) ? id : null;
}

/** @param {URLSearchParams} searchParams */
function readTeam(searchParams) {
  const team = searchParams.get("team") ?? "";
  return Object.hasOwn(TEAMS, team) ? team : null;
}

/**
 * @param {object} options
 * @param {(key: string) => Promise<{ players: any[] }>} options.loadRoster a team's roster for a
 *   season, keyed as NYL:2026
 * @param {(input: string, init: object) => Promise<Response>} [options.fetchImpl]
 * @param {() => number} [options.now]
 */
export function createPlayerServer({
  loadRoster,
  fetchImpl = (input, init) => fetch(input, init),
  now = () => Date.now(),
}) {
  /**
   * @param {string} url
   * @param {number} season
   * @param {string} table
   */
  const readFeed = (url, season, table) =>
    fetchWnbaJson(
      fetchImpl,
      url,
      isCurrentSeason(season, now()) ? CACHE_SECONDS : PAST_CACHE_SECONDS,
      hasTable(table),
    );

  // Each key is a season, or a season and the kind of games, as 2026:Playoffs.
  const loadTotals = createReusedLoader(
    (/** @type {number} */ season) =>
      readFeed(nameTotalsRequest(season), season, "LeagueDashPlayerStats"),
    REUSE_MS,
    now,
  );
  const loadTeamGames = createReusedLoader(
    (/** @type {string} */ key) => {
      const [season, seasonType] = key.split(":");
      return readFeed(
        nameTeamGameLogRequest(Number(season), seasonType),
        Number(season),
        "LeagueGameLog",
      );
    },
    REUSE_MS,
    now,
  );

  /**
   * @param {string} id
   * @param {number} season
   * @param {string} seasonType
   */
  const readGameLog = async (id, season, seasonType) =>
    readTable(
      await readFeed(nameGameLogRequest(id, season, seasonType), season, "PlayerGameLogs"),
      "PlayerGameLogs",
    );

  /**
   * @param {Record<string, any>[]} regularGames
   * @param {Record<string, any>[]} playoffGames
   * @param {number} season
   */
  async function readLastGame(regularGames, playoffGames, season) {
    const isPlayoffs = playoffGames.length > 0;
    const latest = findLatest(isPlayoffs ? playoffGames : regularGames);
    if (!latest) return null;
    const teamGames = await loadTeamGames(`${season}:${isPlayoffs ? PLAYOFFS : REGULAR_SEASON}`);
    return describeGame(latest, isPlayoffs, teamGames);
  }

  /**
   * @param {{ id: string, team: string, season: number }} asked
   */
  async function readPlayer({ id, team, season }) {
    const [roster, regularGames, playoffGames, totals, teamGames] = await Promise.all([
      loadRoster(`${team}:${season}`),
      readGameLog(id, season, REGULAR_SEASON),
      readGameLog(id, season, PLAYOFFS),
      loadTotals(season),
      loadTeamGames(`${season}:${REGULAR_SEASON}`),
    ]);
    const facts = roster.players.find((player) => player.id === id) ?? null;
    const regularSeason = describeRegularSeason(id, totals, teamGames);
    const names = readNames(facts, [
      ...playoffGames,
      ...regularGames,
      ...readTable(totals, "LeagueDashPlayerStats").filter((row) => String(row.PLAYER_ID) === id),
    ]);
    if (!names) return null;
    return {
      id,
      team,
      season,
      ...names,
      facts,
      lastGame: await readLastGame(regularGames, playoffGames, season),
      playoffPoints: Object.fromEntries(playoffGames.map((game) => [game.GAME_ID, game.PTS])),
      regularSeason,
    };
  }

  /** @param {URL} url */
  async function servePlayer(url) {
    const id = readId(url.searchParams);
    if (!id) return respondJson({ error: "id must be a player's number in the WNBA's stats" }, 400);
    const team = readTeam(url.searchParams);
    if (!team) return respondJson({ error: "team must name a WNBA team" }, 400);
    const season = SEASON_PARAM.readSeason(url.searchParams, now());
    if (season == null) return respondJson({ error: SEASON_PARAM.rule }, 400);
    try {
      const player = await readPlayer({ id, team, season });
      if (!player) return respondJson({ error: `The WNBA has no player ${id} in ${season}` }, 404);
      return respondJson(player);
    } catch (error) {
      return respondJson({ error: `Couldn't read the WNBA: ${describeError(error)}` }, 502);
    }
  }

  return { servePlayer };
}
