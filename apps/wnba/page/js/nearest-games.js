// Runs in both the browser page and the Worker, so it uses no DOM and no globals.

/** @typedef {{ id: string, state: string, series?: string | null, away: { team: string | null }, home: { team: string | null } }} SeasonGame */

/**
 * @param {SeasonGame} game
 * @param {string} team
 */
const isPlaying = (game, team) => game.away.team === team || game.home.team === team;

/** @param {SeasonGame} game */
const hasBothTeams = (game) => !!(game.away.team && game.home.team);

/**
 * A team's last finished game, the one it's playing, and its next, each null when it has none. The
 * next is one whose other team is known, and never one left over in a series that's already
 * decided, which won't be played.
 * @template {SeasonGame} Game
 * @param {Game[]} games in order of start
 * @param {string} team
 * @param {Set<string>} decidedSeries
 * @returns {{ last: Game | null, now: Game | null, next: Game | null }}
 */
export function findNearestGames(games, team, decidedSeries) {
  const own = games.filter((game) => isPlaying(game, team));
  const isPlayable = (/** @type {Game} */ game) =>
    hasBothTeams(game) && !decidedSeries.has(game.series ?? "");
  return {
    last: own.findLast((game) => game.state === "final") ?? null,
    now: own.find((game) => game.state === "live") ?? null,
    next: own.find((game) => game.state === "pre" && isPlayable(game)) ?? null,
  };
}
