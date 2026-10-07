import { fetchBoxScore } from "./box-score.js";
import { createLeadReader } from "./lead.js";

// The details of each game a page has open, which the store reads with each update and pushes to
// the pages watching: its box score and its lead. A game that hasn't started has none, and one
// whose final box score is saved needs no more. A read that fails keeps what was saved.

/** @param {{ fetchImpl?: (input: string, init: object) => Promise<Response> }} [options] */
export function createWatchedGameLoader({ fetchImpl = (input, init) => fetch(input, init) } = {}) {
  const readLead = createLeadReader({ fetchImpl });

  /**
   * @param {string} id
   * @param {any} snapshot
   * @param {any} stored the details saved last
   */
  return async function loadWatchedGame(id, snapshot, stored) {
    const game = [...snapshot.games, ...snapshot.nearestGames].find((each) => each.id === id);
    if (!game || game.state === "pre" || stored?.boxScore?.state === "final") return null;
    const teams = { away: game.away.team, home: game.home.team, start: game.start };
    const [boxScore, lead] = await Promise.all([
      fetchBoxScore(fetchImpl, id).catch(() => stored?.boxScore ?? null),
      readLead(teams).catch(() => stored?.lead ?? null),
    ]);
    return { boxScore, lead };
  };
}
