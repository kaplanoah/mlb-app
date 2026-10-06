import { TEAMS } from "../../page/js/teams.js";
import { describeError, respondJson } from "../../../../shared/worker/responses.js";
import { createReusedLoader, fetchUpstream } from "../../../../shared/worker/upstream.js";
import { ESPN_HEADERS } from "./wnba.js";

// Reads ESPN for a team's roster, for its sheet's Roster page: each player's number, position,
// height, age, college or country, whether she's out, and her first WNBA season, with the team's
// head coach. The page takes each player's averages from the store, which the season updater keeps.

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba";
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba";
// A roster changes with a signing or an injury, and a player's seasons once a year.
const ROSTER_CACHE_SECONDS = 30 * 60;
const SEASONS_CACHE_SECONDS = 24 * 60 * 60;
// A sheet opened again soon, on this phone or another, reuses the roster just read.
const ROSTER_REUSE_MS = 5 * 60 * 1000;
// Enough for every season a player has had in the league.
const SEASONS_LIMIT = 50;

/** @param {number} espnId */
export const nameRosterRequest = (espnId) => `${ESPN_SITE}/teams/${espnId}/roster`;

/** @param {string | number} athleteId */
export const nameSeasonsRequest = (athleteId) =>
  `${ESPN_CORE}/athletes/${athleteId}/seasons?limit=${SEASONS_LIMIT}`;

/** @param {{ $ref?: string }} item */
const readSeasonYear = (item) => Number(String(item?.$ref ?? "").match(/\/seasons\/(\d{4})/)?.[1]);

/**
 * The first season ESPN lists a player in, or null when it lists none.
 * @param {any} seasons ESPN's list of a player's seasons
 */
export function findDebut(seasons) {
  const years = (seasons?.items ?? []).map(readSeasonYear).filter(Number.isFinite);
  return years.length ? Math.min(...years) : null;
}

// ESPN writes a height with a space after the feet, as 6' 2".
/** @param {string | undefined} height */
const formatHeight = (height) => (height ? height.replace(/\s+/g, "") : null);

/** @param {any} athlete */
const isOut = (athlete) => (athlete.injuries ?? []).some((injury) => injury.status === "Out");

/**
 * @param {any} athlete one of ESPN's roster's athletes
 * @param {number | null} debut
 */
const describePlayer = (athlete, debut) => ({
  id: String(athlete.id),
  number: athlete.jersey ?? null,
  firstName: athlete.firstName,
  lastName: athlete.lastName,
  position: athlete.position?.abbreviation ?? null,
  height: formatHeight(athlete.displayHeight),
  age: athlete.age ?? null,
  college: athlete.college?.shortName ?? athlete.college?.name ?? null,
  country: athlete.birthPlace?.country || null,
  isOut: isOut(athlete),
  debut,
});

/** @param {{ firstName?: string, lastName?: string } | undefined} coach */
const nameCoach = (coach) =>
  coach ? [coach.firstName, coach.lastName].filter(Boolean).join(" ") || null : null;

/**
 * @param {string} team
 * @param {any} roster ESPN's roster
 * @param {Map<string, number | null>} debuts each player's first season, by ESPN's id for her
 */
export const describeRoster = (team, roster, debuts) => ({
  team,
  coach: nameCoach(roster.coach?.[0]),
  players: roster.athletes.map((athlete) =>
    describePlayer(athlete, debuts.get(String(athlete.id)) ?? null),
  ),
});

/** @param {any} roster */
const hasAthletes = (roster) => Array.isArray(roster?.athletes);

/** @param {URLSearchParams} searchParams */
function readTeam(searchParams) {
  const team = searchParams.get("team") ?? "";
  return Object.hasOwn(TEAMS, team) ? team : null;
}

export function createRosterServer({
  fetchImpl = (input, init) => fetch(input, init),
  now = () => Date.now(),
} = {}) {
  /**
   * @param {string} url
   * @param {number} cacheSeconds
   */
  async function fetchEspnJson(url, cacheSeconds) {
    const response = await fetchUpstream(fetchImpl, url, { headers: ESPN_HEADERS, cacheSeconds });
    if (!response.ok) throw new Error(`ESPN answered ${response.status}`);
    return response.json();
  }

  // A player whose seasons don't answer shows no first season, rather than holding up the roster.
  /** @param {any} athlete */
  async function readDebut(athlete) {
    try {
      const seasons = await fetchEspnJson(nameSeasonsRequest(athlete.id), SEASONS_CACHE_SECONDS);
      return /** @type {[string, number | null]} */ ([String(athlete.id), findDebut(seasons)]);
    } catch {
      return /** @type {[string, number | null]} */ ([String(athlete.id), null]);
    }
  }

  /** @param {string} team */
  async function readRoster(team) {
    const roster = await fetchEspnJson(nameRosterRequest(TEAMS[team].espnId), ROSTER_CACHE_SECONDS);
    if (!hasAthletes(roster)) throw new Error("ESPN answered without a roster");
    const debuts = new Map(await Promise.all(roster.athletes.map(readDebut)));
    return describeRoster(team, roster, debuts);
  }

  const loadRoster = createReusedLoader(readRoster, ROSTER_REUSE_MS, now);

  /** @param {URL} url */
  async function serveRoster(url) {
    const team = readTeam(url.searchParams);
    if (!team) return respondJson({ error: "team must name a WNBA team" }, 400);
    try {
      return respondJson(await loadRoster(team));
    } catch (error) {
      return respondJson({ error: `Couldn't read ESPN: ${describeError(error)}` }, 502);
    }
  }

  return { loadRoster, serveRoster };
}
