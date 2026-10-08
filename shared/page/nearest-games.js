// A team's nearest games, which its sheet shows as cards (game-cards.js). Runs in both the browser
// page and the Worker, so it uses no DOM and no globals.

/**
 * A team's last finished game, the one it's playing, and its next, each null when it has none.
 * Each league says which of the team's games still to come will be played.
 * @template {{ state: string }} Game
 * @param {Game[]} games the team's own, in order of start
 * @param {(game: Game) => boolean} isPlayable
 * @returns {{ last: Game | null, now: Game | null, next: Game | null }}
 */
export const findNearestGames = (games, isPlayable) => ({
  last: games.findLast((game) => game.state === "final") ?? null,
  now: games.find((game) => game.state === "live") ?? null,
  next: games.find((game) => game.state === "pre" && isPlayable(game)) ?? null,
});
