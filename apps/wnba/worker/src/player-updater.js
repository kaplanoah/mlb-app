import { isSameJson } from "#shared/compare.js";
import { createFeedKeeper } from "../../../../shared/worker/feed-keeper.js";
import { describeError } from "../../../../shared/worker/responses.js";
import { isStillPlaying } from "../../page/js/series.js";
import { TEAMS } from "../../page/js/teams.js";
import {
  GAME_LOG_COLUMNS,
  PLAYOFFS,
  REGULAR_SEASON,
  TEAM_GAME_COLUMNS,
  TOTALS_COLUMNS,
  describeSeasonPlayers,
  nameGameLogRequest,
  nameNumbersKey,
  nameRanksKey,
  nameTeamGameLogRequest,
  nameTotalsRequest,
} from "./player.js";
import {
  describeRoster,
  fetchEspnRoster,
  listOutNames,
  nameLeagueRosterRequest,
  namePlayerListRequest,
  nameRosterKey,
} from "./roster.js";
import { fetchWnbaJson, hasTable, trimColumns } from "./wnba.js";

// Keeps what player and roster sheets show, so a tap reads only the store and never waits on the
// league. Each run reads only the feeds that may have changed: every player's totals and game logs
// and every team's games as a game ends, each team's roster every few hours, the league's list of
// every player once a day, and who ESPN lists as out on each team still playing every hour. It
// keeps each feed trimmed to the columns the sheets read, and saves only the documents that
// changed: each team's roster, each player's numbers, and the season's ranked numbers, which go
// last, so a season that has them is whole. Each run also fills one season the store keeps from
// before the current one, newest first, and a filled season is never read again, since a past
// season doesn't change, unless the sheets come to read a column it was filled without.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const RUN_DELAY_MS = 5 * MINUTE_MS;
const LEAGUE_NAME = "The WNBA";
const TEAM_KEYS = Object.keys(TEAMS);

const FEEDS = {
  totals: { maxAgeMs: 6 * HOUR_MS, changesWithGames: true },
  playerGames: { maxAgeMs: 6 * HOUR_MS, changesWithGames: true },
  teamGames: { maxAgeMs: 6 * HOUR_MS, changesWithGames: true },
  roster: { maxAgeMs: 6 * HOUR_MS, changesWithGames: false },
  playerList: { maxAgeMs: 24 * HOUR_MS, changesWithGames: false },
  out: { maxAgeMs: HOUR_MS, changesWithGames: false },
};

const ROSTER_COLUMNS = [
  "PLAYER_ID",
  "PLAYER",
  "NUM",
  "POSITION",
  "HEIGHT",
  "BIRTH_DATE",
  "COACH_TYPE",
  "COACH_NAME",
];
const PLAYER_LIST_COLUMNS = [
  "PERSON_ID",
  "PLAYER_FIRST_NAME",
  "PLAYER_LAST_NAME",
  "COLLEGE",
  "COUNTRY",
  "FROM_YEAR",
];

// A team no one reads ESPN for, or whose read failed, has no one out.
/** @type {string[]} */
const NO_ONE_OUT = [];

/** @typedef {import("../../../../shared/worker/season-store.js").JobContext} JobContext */

/** @param {number} season */
const nameFilledKey = (season) => `filled:${season}`;
// What a filled season was kept with, so one filled with fewer columns is filled again.
const FILLED_COLUMNS = [
  ...new Set([...TOTALS_COLUMNS, ...GAME_LOG_COLUMNS, ...TEAM_GAME_COLUMNS]),
].join(" ");

/**
 * How many of a season's games the store has seen end.
 * @param {any} savedSeason
 */
const countFinals = (savedSeason) =>
  Array.isArray(savedSeason?.games)
    ? savedSeason.games.filter((/** @type {any} */ game) => game.state === "final").length
    : null;

/**
 * The seasons the store keeps from before the current one, newest first.
 * @param {JobContext["docs"]} docs
 * @param {number} current
 */
async function listPastSeasons(docs, current) {
  const seasons = await docs.list("seasons");
  return seasons
    .map((/** @type {any} */ saved) => Number(saved?.year))
    .filter((year) => Number.isInteger(year) && year < current)
    .sort((first, second) => second - first);
}

/** What one store keeps between runs, while it stays in memory, and how it runs. */
function createStoreKeeper() {
  /** @type {ReturnType<typeof createFeedKeeper> | null} */
  let keeper = null;
  // What each document was last saved as, so a run compares without reading the store.
  /** @type {Map<string, string>} */
  const saved = new Map();

  /**
   * @param {JobContext} context
   * @param {string} key
   * @param {any} doc
   */
  async function saveDoc({ docs }, key, doc) {
    const text = JSON.stringify(doc);
    if (saved.get(key) === text) return;
    if (!saved.has(key) && isSameJson(await docs.read(key), doc)) {
      saved.set(key, text);
      return;
    }
    await docs.write(key, doc);
    saved.set(key, text);
  }

  /**
   * Reads a feed trimmed to its columns, kept under them, so one kept with fewer is read again.
   * @param {JobContext} context
   * @param {string} name which feed's limits apply
   * @param {string} url
   * @param {string} table
   * @param {string[]} columns
   */
  const readStats = (context, name, url, table, columns) =>
    /** @type {ReturnType<typeof createFeedKeeper>} */ (keeper).readFeed(
      name,
      `${url} ${columns.join(" ")}`,
      async () =>
        trimColumns(await fetchWnbaJson(context.fetchImpl, url, null, hasTable(table)), columns),
    );

  /**
   * Who ESPN lists as out on a team today, or no one when ESPN hasn't answered.
   * @param {JobContext} context
   * @param {string} team
   */
  const readOutNames = (context, team) =>
    /** @type {ReturnType<typeof createFeedKeeper>} */ (keeper)
      .readFeed("out", team, async () =>
        listOutNames(await fetchEspnRoster(context.fetchImpl, team, null)),
      )
      .catch(() => NO_ONE_OUT);

  /**
   * @param {JobContext} context
   * @param {number} season
   */
  const readSeasonFeeds = (context, season) =>
    Promise.all([
      readStats(
        context,
        "totals",
        nameTotalsRequest(season),
        "LeagueDashPlayerStats",
        TOTALS_COLUMNS,
      ),
      ...[REGULAR_SEASON, PLAYOFFS].map((seasonType) =>
        readStats(
          context,
          "playerGames",
          nameGameLogRequest(season, seasonType),
          "PlayerGameLogs",
          GAME_LOG_COLUMNS,
        ),
      ),
      ...[REGULAR_SEASON, PLAYOFFS].map((seasonType) =>
        readStats(
          context,
          "teamGames",
          nameTeamGameLogRequest(season, seasonType),
          "LeagueGameLog",
          TEAM_GAME_COLUMNS,
        ),
      ),
    ]);

  /**
   * Each team's roster answer, or null for one the league hasn't answered.
   * @param {JobContext} context
   * @param {number} season
   */
  const readRosterFeeds = (context, season) =>
    Promise.all(
      TEAM_KEYS.map((team) =>
        readStats(
          context,
          "roster",
          nameLeagueRosterRequest(team, season),
          "CommonTeamRoster",
          ROSTER_COLUMNS,
        ).catch(() => null),
      ),
    );

  /**
   * Who is out on each team, read only for a team that still plays this season, since a page shows
   * it only then.
   * @param {JobContext} context
   * @param {any[] | null} series the season's series, or null for a past season
   */
  const readOutFeeds = (context, series) =>
    Promise.all(
      TEAM_KEYS.map((team) =>
        series && isStillPlaying(series, team) ? readOutNames(context, team) : NO_ONE_OUT,
      ),
    );

  /**
   * @param {JobContext} context
   * @param {number} season
   * @param {{ leagueRosters: any[], outNames: string[][], playerList: any }} answers
   */
  async function saveRosters(context, season, { leagueRosters, outNames, playerList }) {
    for (const [index, team] of TEAM_KEYS.entries()) {
      const leagueRoster = leagueRosters[index];
      if (!leagueRoster) continue;
      const roster = describeRoster({
        team,
        season,
        leagueRoster,
        playerList,
        outNames: outNames[index],
        now: context.now(),
      });
      await saveDoc(context, nameRosterKey(season, team), roster);
    }
  }

  /**
   * @param {JobContext} context
   * @param {number} season
   * @param {any[]} answers
   */
  async function savePlayers(context, season, answers) {
    const [totals, regularGames, playoffGames, teamRegularGames, teamPlayoffGames] = answers;
    const { ranks, players } = describeSeasonPlayers({
      totals,
      regularGames,
      playoffGames,
      teamRegularGames,
      teamPlayoffGames,
    });
    for (const [id, numbers] of players)
      await saveDoc(context, nameNumbersKey(season, id), numbers);
    await saveDoc(context, nameRanksKey(season), ranks);
  }

  /**
   * Saves a season's rosters, and its numbers once its stats feeds have answered, and says whether
   * every feed answered. A feed that doesn't answer leaves what it feeds as it was saved.
   * @param {JobContext} context
   * @param {number} season
   * @param {any[] | null} series the season's series, or null for a past season
   */
  async function updateSeason(context, season, series) {
    const [stats, leagueRosters, outNames, playerList] = await Promise.all([
      readSeasonFeeds(context, season).catch((error) => {
        console.error(`Reading ${season}'s stats failed: ${describeError(error)}`);
        return null;
      }),
      readRosterFeeds(context, season),
      readOutFeeds(context, series),
      readStats(
        context,
        "playerList",
        namePlayerListRequest(season),
        "PlayerIndex",
        PLAYER_LIST_COLUMNS,
      ).catch(() => null),
    ]);
    await saveRosters(context, season, { leagueRosters, outNames, playerList });
    if (stats) await savePlayers(context, season, stats);
    return !!stats && !!playerList && leagueRosters.every(Boolean);
  }

  /**
   * Fills the newest past season the store keeps that it hasn't filled.
   * @param {JobContext} context
   * @param {number} current
   */
  async function fillPastSeason(context, current) {
    for (const season of await listPastSeasons(context.docs, current)) {
      if ((await context.storage.get(nameFilledKey(season))) === FILLED_COLUMNS) continue;
      const isWhole = await updateSeason(context, season, null);
      if (isWhole) await context.storage.put(nameFilledKey(season), FILLED_COLUMNS);
      return;
    }
  }

  /**
   * @param {string} what what failed, as an error names it
   * @param {() => Promise<unknown>} work
   */
  async function logFailure(what, work) {
    try {
      await work();
    } catch (error) {
      console.error(`${what} failed: ${describeError(error)}`);
    }
  }

  /** @param {JobContext} context */
  async function run(context) {
    keeper ??= createFeedKeeper({
      feeds: FEEDS,
      leagueName: LEAGUE_NAME,
      now: context.now,
      storage: context.storage,
    });
    const current = (await context.docs.read("live/current"))?.season;
    if (!Number.isInteger(current)) return;
    const savedSeason = await context.docs.read(`seasons/${current}`);
    await keeper.noteFinalCount(countFinals(savedSeason));
    await logFailure(`Keeping ${current}'s players`, () =>
      updateSeason(context, current, savedSeason?.series ?? []),
    );
    await logFailure("Filling a past season's players", () => fillPastSeason(context, current));
  }

  return { run };
}

export function createPlayerJob() {
  // One job serves every store made from its module, as each test makes its own, so each store
  // keeps its own reads.
  /** @type {WeakMap<JobContext["docs"], ReturnType<typeof createStoreKeeper>>} */
  const keepers = new WeakMap();
  return {
    chooseDelay: () => RUN_DELAY_MS,
    /** @param {JobContext} context */
    run(context) {
      if (!keepers.has(context.docs)) keepers.set(context.docs, createStoreKeeper());
      return /** @type {ReturnType<typeof createStoreKeeper>} */ (keepers.get(context.docs)).run(
        context,
      );
    },
  };
}
