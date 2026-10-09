// The games the page lists, from the slate the store keeps with the season: each club's last games,
// today's, and each club's next. Runs in both the page and the Worker, so it uses no DOM and no
// globals.

/** @typedef {"previous" | "today" | "next"} SlateList */

/**
 * @param {any} slate
 * @param {SlateList} list
 */
function listClubGames(slate, list) {
  if (list === "previous") return slate.previous || [];
  if (list === "next") return slate.next || [];
  const { date, games, postponed = [] } = slate.today;
  return [...games, ...postponed].map((/** @type {any} */ game) => ({ date, ...game }));
}

/**
 * Every club's game the slate lists, each with its day.
 * @param {any} slate
 */
export const listSlateGames = (slate) =>
  /** @type {SlateList[]} */ (["previous", "today", "next"]).flatMap((list) =>
    listClubGames(slate, list),
  );
