// The Games list someone was on, kept while they're away for less than two minutes: long enough
// to glance at another app and come back to it, short enough that the next sitting starts over,
// on the list the view started from, which is kept beside it.

/** @typedef {"previous" | "today" | "next"} GameList */
/** @typedef {{ list: string, start?: string, leftAt: number }} LeftGameList */

const LAST_GAME_LIST_KEY = "lastGameList";
const GAME_LISTS = ["previous", "today", "next"];

const TODAY_AFTER_AWAY_MS = 2 * 60 * 1000;

/** @param {number} awayMs */
export const isAwayLong = (awayMs) => awayMs >= TODAY_AFTER_AWAY_MS;

/**
 * @param {string | undefined} list
 * @returns {GameList}
 */
const readGameList = (list) =>
  GAME_LISTS.includes(list) ? /** @type {GameList} */ (list) : "today";

/**
 * The list the Games view started from when it was left, or Today.
 * @param {LeftGameList | null} left
 */
export const readLeftStartList = (left) => readGameList(left?.start);

/**
 * The list the Games view opens on: the one it was left on, unless that was two minutes or more
 * ago, when it's the one it started from.
 * @param {LeftGameList | null} left
 * @param {number} now
 * @returns {GameList}
 */
export function chooseGameList(left, now) {
  const isKept = !!left && GAME_LISTS.includes(left.list) && !isAwayLong(now - left.leftAt);
  return isKept ? readGameList(left.list) : readLeftStartList(left);
}

// Storage can be empty or refuse access, as in a private window, so the page never depends on it.

/** @returns {LeftGameList | null} */
export function readLastGameList() {
  try {
    return JSON.parse(localStorage.getItem(LAST_GAME_LIST_KEY) ?? "null");
  } catch {
    return null;
  }
}

/**
 * @param {string} list
 * @param {string} start
 */
export function saveLastGameList(list, start) {
  try {
    localStorage.setItem(LAST_GAME_LIST_KEY, JSON.stringify({ list, start, leftAt: Date.now() }));
  } catch {
    /* the next load starts over instead */
  }
}
