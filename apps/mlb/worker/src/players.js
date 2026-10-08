import { readLeagueRows } from "./pitchers.js";
import { trimHitting, trimPitching } from "./rosters.js";

// What each player's sheet shows: his facts, from MLB's list of every player this season, and his
// regular season and postseason so far, at the plate and on the mound, from every player's numbers;
// and the numbers of every hitter MLB ranks, which a hitter's sheet ranks him among. The store keeps
// each player on a club's roster (roster-updater.js), so a sheet reads only the store.

const PEOPLE_FIELDS = [
  "people",
  "id",
  "fullName",
  "currentAge",
  "birthCity",
  "birthStateProvince",
  "birthCountry",
  "height",
  "weight",
  "mlbDebutDate",
  "batSide",
  "pitchHand",
  "code",
].join(",");
const USA = "USA";

/**
 * @param {number} season
 * @param {number} id
 */
export const namePlayerKey = (season, id) => `players/${season}-${id}`;

/** @param {number} season */
export const nameHittersKey = (season) => `hitters/${season}`;

/**
 * Every player in MLB this season, with his facts.
 * @param {number} season
 */
export const listPeopleRequest = (season) =>
  `/api/v1/sports/1/players?season=${season}&fields=${PEOPLE_FIELDS}`;

/**
 * Each player's facts in MLB's list, by id.
 * @param {any} peopleResponse
 * @returns {Map<number, any>}
 */
export const indexPeople = (peopleResponse) =>
  new Map((peopleResponse?.people ?? []).map((/** @type {any} */ person) => [person.id, person]));

/**
 * Where a player was born, as his sheet writes it: a city and state in the United States, or a
 * city and country elsewhere.
 * @param {any} person
 */
const describeBirthplace = (person) => {
  const place = person.birthCountry === USA ? person.birthStateProvince : person.birthCountry;
  return [person.birthCity, place].filter(Boolean).join(", ") || null;
};

/**
 * @param {any} person a player in MLB's list
 */
const describeFacts = (person) => ({
  bats: person.batSide?.code ?? null,
  throws: person.pitchHand?.code ?? null,
  age: person.currentAge ?? null,
  height: person.height ? person.height.replace(" ", "") : null,
  weight: person.weight ?? null,
  debut: person.mlbDebutDate ? Number(person.mlbDebutDate.slice(0, 4)) : null,
  birthplace: describeBirthplace(person),
});

/**
 * A player's numbers in one of MLB's tables, kept to what his sheet shows, or null when he has none.
 * @param {Map<number, any>} table
 * @param {number} id
 * @param {(stat: any) => any} trim
 */
const readNumbers = (table, id, trim) => (table.has(id) ? trim(table.get(id)) : null);

/**
 * Every player's numbers this season, by id: at the plate and on the mound, in the regular season
 * and the postseason.
 * @typedef {{ hitting: Map<number, any>, pitching: Map<number, any>, postseasonHitting: Map<number, any>, postseasonPitching: Map<number, any> }} PlayerNumbers
 */

/**
 * A player's sheet: his facts, and his season at the plate and on the mound, regular and post.
 * @param {PlayerNumbers & { entry: any, club: string, season: number, person: any }} sources
 *   `entry` is his line on the club's roster
 */
export function describePlayer({ entry, club, season, person, ...numbers }) {
  const id = entry.person.id;
  return {
    id,
    season,
    club,
    name: entry.person.fullName ?? person?.fullName ?? "",
    number: entry.jerseyNumber ?? "",
    position: entry.position?.abbreviation ?? "",
    facts: person ? describeFacts(person) : null,
    hitting: readNumbers(numbers.hitting, id, trimHitting),
    pitching: readNumbers(numbers.pitching, id, trimPitching),
    postseasonHitting: readNumbers(numbers.postseasonHitting, id, trimHitting),
    postseasonPitching: readNumbers(numbers.postseasonPitching, id, trimPitching),
  };
}

/**
 * A share of a hitter's plate appearances, like his walks, to three places.
 * @param {number} count
 * @param {number} plateAppearances
 */
const shareOf = (count, plateAppearances) =>
  plateAppearances ? Math.round((count / plateAppearances) * 1000) / 1000 : 0;

/**
 * Every hitter MLB ranks, each with the numbers a hitter's sheet ranks.
 * @param {any} qualifiedResponse MLB's qualified hitters
 */
export const describeHitters = (qualifiedResponse) => ({
  hitters: readLeagueRows(qualifiedResponse).map((row) => ({
    id: row.player.id,
    avg: Number(row.stat.avg),
    obp: Number(row.stat.obp),
    slg: Number(row.stat.slg),
    ops: Number(row.stat.ops),
    homeRuns: row.stat.homeRuns,
    rbi: row.stat.rbi,
    runs: row.stat.runs,
    stolenBases: row.stat.stolenBases,
    walkRate: shareOf(row.stat.baseOnBalls, row.stat.plateAppearances),
    strikeoutRate: shareOf(row.stat.strikeOuts, row.stat.plateAppearances),
  })),
});
