import {
  chooseGameList,
  isAwayLong,
  readLastGameList,
  saveLastGameList,
} from "./last-game-list.js";
import { createPager } from "./pager.js";
import { watchTimeAway } from "./resume.js";

// The Games view's Previous, Today, and Next lists, which keep the list someone was on until
// they've been away an hour, and then go back to the one the view starts from: today's, or, for a
// season that's over, its results.

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {import("./last-game-list.js").GameList} GameList */

/** @type {ReturnType<typeof createPager> | null} */
let gamePager = null;
/** @type {GameList} */
let startList = "today";

const saveShownList = () => saveLastGameList(gamePager.readShownList());

// Leaving the screen is the last moment the page is sure to run, whether it then reloads, sleeps,
// or is dropped.
function keepShownList() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveShownList();
  });
  addEventListener("pagehide", saveShownList);
}

/** @param {number} awayMs */
function showStartListAfterLongAway(awayMs) {
  if (isAwayLong(awayMs)) gamePager.switchToList(startList);
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
  gamePager = createPager(/** @type {HTMLElement} */ (document.getElementById("gamePager")), {
    label: "Games",
    idPrefix: "games",
    lists: [
      { key: "previous", name: "Previous" },
      { key: "today", name: "Today" },
      { key: "next", name: "Next" },
    ],
    openOn: chooseGameList(readLastGameList(), Date.now()),
  });
  keepShownList();
  watchTimeAway(showStartListAfterLongAway);
}

/** @param {(list: GameList) => Markup} renderList */
export function fillGameLists(renderList) {
  gamePager.fill(/** @type {(key: string) => Markup} */ (renderList));
}
