// The games the page lists, from the slate the store keeps with the season: each club's last games,
// today's, and each club's next. Runs in both the page and the Worker, so it uses no DOM and no
// globals.

/** @typedef {"previous" | "today" | "next"} SlateList */

/**
 * One of the slate's lists, each game with its day.
 * @param {any} slate
 * @param {SlateList} list
 */
export function listSlateList(slate, list) {
  const games = listClubGames(slate, list);
  return isAllStarIn(slate, list, games) ? [...games, slate.allStar] : games;
}

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

// The All-Star Game shows in the list of its day, and in Previous or Next only while it's the
// nearest game that way, over the All-Star break.
/**
 * @param {any} slate
 * @param {SlateList} list
 * @param {{ date: string }[]} games the list's clubs' games
 */
function isAllStarIn(slate, list, games) {
  const date = slate.allStar?.date;
  if (!date) return false;
  const dates = games.map((game) => game.date);
  if (list === "previous") return date < slate.today.date && dates.every((each) => each <= date);
  if (list === "next") return date > slate.today.date && dates.every((each) => each >= date);
  return date === slate.today.date;
}

/**
 * Every club's game the slate lists, each with its day.
 * @param {any} slate
 */
export const listSlateGames = (slate) =>
  /** @type {SlateList[]} */ (["previous", "today", "next"]).flatMap((list) =>
    listClubGames(slate, list),
  );
