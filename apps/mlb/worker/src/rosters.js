import { readLeagueRows } from "./pitchers.js";

// Each club's roster for its sheet's Roster section: its active players and who is on the injured
// list, from its 40-man roster, each with his regular season so far, from every player's numbers.
// The store keeps each club's (roster-updater.js), so the page reads only the store.

const ROSTER_FIELDS = [
  "roster",
  "person",
  "id",
  "fullName",
  "jerseyNumber",
  "position",
  "abbreviation",
  "status",
  "description",
].join(",");
const HITTING_FIELDS = [
  "stats",
  "splits",
  "player",
  "id",
  "stat",
  "plateAppearances",
  "avg",
  "homeRuns",
  "rbi",
  "ops",
].join(",");
const PITCHING_FIELDS = [
  "stats",
  "splits",
  "player",
  "id",
  "stat",
  "gamesPlayed",
  "gamesStarted",
  "era",
  "wins",
  "losses",
  "inningsPitched",
  "strikeOuts",
  "saves",
].join(",");
const ACTIVE = "Active";
// MLB's word for a stay on the injured list, as in "Injured 15-Day".
const INJURED = /^Injured\b/;

// Where the store keeps each club's roster.
const ROSTERS_COLLECTION = "rosters";

/** @param {string} club */
export const nameRosterKey = (club) => `${ROSTERS_COLLECTION}/${club}`;

/**
 * A club's 40-man roster, with each player's status.
 * @param {number} mlbTeamId
 * @param {number} season
 */
export const listRosterRequest = (mlbTeamId, season) =>
  `/api/v1/teams/${mlbTeamId}/roster?rosterType=40Man&season=${season}&fields=${ROSTER_FIELDS}`;

/**
 * Every player's regular season so far, at the plate or on the mound.
 * @param {number} season
 * @param {"hitting" | "pitching"} group
 */
export const listSeasonStatsRequest = (season, group) =>
  `/api/v1/stats?stats=season&group=${group}&season=${season}&gameType=R&sportId=1` +
  `&playerPool=all&limit=3000&fields=${group === "hitting" ? HITTING_FIELDS : PITCHING_FIELDS}`;

/**
 * Each player's numbers in one of MLB's league tables, by id.
 * @param {any} table
 * @returns {Map<number, any>}
 */
export const indexSeasonStats = (table) =>
  new Map(readLeagueRows(table).map((row) => [row.player.id, row.stat]));

/**
 * A stay on the injured list as the sheet names it, as "15-day IL".
 * @param {string} status
 */
const describeInjury = (status) => {
  const days = /(\d+)-Day/.exec(status)?.[1];
  return days ? `${days}-day IL` : "IL";
};

/**
 * @param {any} entry a player on MLB's roster
 * @param {Map<number, any>} hitting
 * @param {Map<number, any>} pitching
 */
function describePlayer(entry, hitting, pitching) {
  const id = entry.person?.id;
  const status = entry.status?.description ?? "";
  const player = {
    id,
    name: entry.person?.fullName ?? "",
    number: entry.jerseyNumber ?? "",
    position: entry.position?.abbreviation ?? "",
    injury: INJURED.test(status) ? describeInjury(status) : null,
  };
  return {
    ...player,
    ...(hitting.has(id) && { hitting: hitting.get(id) }),
    ...(pitching.has(id) && { pitching: pitching.get(id) }),
  };
}

/** @param {any} entry */
const isOnRoster = (entry) => {
  const status = entry.status?.description ?? "";
  return status === ACTIVE || INJURED.test(status);
};

/**
 * A club's active players and its injured list, each with his season so far.
 * @param {{ club: string, season: number, roster: any, hitting: Map<number, any>, pitching: Map<number, any> }} sources
 */
export const describeRoster = ({ club, season, roster, hitting, pitching }) => ({
  club,
  season,
  players: (roster?.roster ?? [])
    .filter(isOnRoster)
    .map((/** @type {any} */ entry) => describePlayer(entry, hitting, pitching)),
});
