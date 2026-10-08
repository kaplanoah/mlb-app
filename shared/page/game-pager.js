import {
  chooseGameList,
  isAwayLong,
  readLastGameList,
  readLeftStartList,
  saveLastGameList,
} from "./last-game-list.js";
import { createPager } from "./pager.js";
import { watchTimeAway } from "./resume.js";

// The Games view's Previous, Today, and Next lists, which keep the list someone was on until
// they've been away two minutes, and then go back to the one the view starts from: today's, the
// next games on a day without any, or, for a season that's over, its results.

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {import("./last-game-list.js").GameList} GameList */

/** @type {ReturnType<typeof createPager> | null} */
let gamePager = null;
/** @type {GameList} */
let startList = "today";

const saveShownList = () => saveLastGameList(gamePager.readShownList(), startList);

// Leaving the screen is the last moment the page is sure to run, whether it then reloads, sleeps,
// or is dropped.
function keepShownList() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveShownList();
  });
  addEventListener("pagehide", saveShownList);
}

// Safari loses a scroll made as the page comes back, before it draws again, and goes on drawing
// the list the page left, so the lists move in the first frame it draws, before it shows any.
/** @param {number} awayMs */
function showStartListAfterLongAway(awayMs) {
  if (isAwayLong(awayMs)) requestAnimationFrame(() => gamePager.switchToList(startList));
}

// The start list counts while a tapped pill is still sliding to it, and not while it slides away.
export const isStartListChosen = () => gamePager.readChosenList() === startList;

/** Slides the shown Games view over to its start list, as a tap on its name in the pill does. */
export function showStartList() {
  gamePager.showList(startList);
}

/**
 * Makes `list` the one the Games view starts from, and moves the view to it when that changes.
 * @param {GameList} list
 */
export function startGamesOn(list) {
  if (list === startList) return;
  startList = list;
  gamePager.switchToList(list);
}

/** Builds the pill and the three lists inside the page's #gamePager, and wires them. */
export function startGamePager() {
  const left = readLastGameList();
  startList = readLeftStartList(left);
  gamePager = createPager(/** @type {HTMLElement} */ (document.getElementById("gamePager")), {
    label: "Games",
    idPrefix: "games",
    lists: [
      { key: "previous", name: "Previous" },
      { key: "today", name: "Today" },
      { key: "next", name: "Next" },
    ],
    openOn: chooseGameList(left, Date.now()),
  });
  keepShownList();
  watchTimeAway(showStartListAfterLongAway);
}

/**
 * The list the Games view starts from: a finished season's results, or today's games, unless
 * today has none and there are games ahead.
 * @param {{ isSeasonOver?: boolean, hasGamesToday: boolean, hasGamesAhead: boolean }} games
 * @returns {GameList}
 */
export function chooseStartList({ isSeasonOver = false, hasGamesToday, hasGamesAhead }) {
  if (isSeasonOver) return "previous";
  return !hasGamesToday && hasGamesAhead ? "next" : "today";
}

/**
 * Fills the lists and makes `start` the one the view starts from. The view moves there only from
 * the list it started from before, so a list someone chose stays shown.
 * @param {(list: GameList) => Markup} renderList
 * @param {GameList} start
 */
export function fillGameLists(renderList, start) {
  gamePager.fill(/** @type {(key: string) => Markup} */ (renderList));
  if (start === startList) return;
  const isOnStartList = isStartListChosen();
  startList = start;
  if (isOnStartList) gamePager.switchToList(start);
}
