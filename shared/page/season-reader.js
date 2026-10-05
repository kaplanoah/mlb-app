import { isSameJson } from "./compare.js";

// Reads a league's season from the store, which says which season is current, so a page never goes
// by its own clock, and pushes each change to the season's record. A page showing the current
// season moves on to the next one when the store does.

const CURRENT_PATH = "live/current";
const STATUS_PATH = "live/status";

/** @param {number} year */
const nameSeasonPath = (year) => `seasons/${year}`;

/**
 * @typedef {object} SeasonReaderOptions
 * @property {any} store the page's store, from `createWorkerStore`
 * @property {(now: number) => number} guessYear the season the clock suggests, for a store that
 *   hasn't yet said which is current
 * @property {(year: number, season: any) => void} keepSeason takes each answer for the shown
 *   season's record, null when it has none
 * @property {() => void} showChange redraws for an answer that comes after the season has loaded
 * @property {(status: any) => void} showStatus takes the store's status of its last update
 * @property {() => void} showLoadFailure says the new current season couldn't be read as the
 *   store moved on to it, so the page loads the current season again later
 * @property {(year: number) => void} [noteCurrentYear] hears that the store names a new current
 *   season, whether or not the page is showing it
 */

/** @param {SeasonReaderOptions} options */
export function createSeasonReader({
  store,
  guessYear,
  keepSeason,
  showChange,
  showStatus,
  showLoadFailure,
  noteCurrentYear = () => {},
}) {
  /** @type {number | null} */
  let currentYear = null;
  /** @type {number | null} */
  let shownYear = null;
  /** @type {any} */
  let keptSeason = null;
  let unwatchSeason = () => {};
  let isFollowing = false;

  /** @param {string} path */
  async function readDoc(path) {
    const snapshot = await store.doc(path).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  // A store that hasn't said which season is current has the clock's guess once it has a record
  // for it, and otherwise the season before.
  async function readUnsaidYear() {
    const year = guessYear(Date.now());
    return (await readDoc(nameSeasonPath(year))) ? year : year - 1;
  }

  async function readCurrentYear() {
    const current = await readDoc(CURRENT_PATH);
    return current ? current.season : readUnsaidYear();
  }

  // The record is read once, which answers at once, and then watched. Once it has loaded, a record
  // that answers it doesn't exist is a gap, as when the store restarts for a deploy, and the page
  // keeps what it shows.
  /** @param {number} year */
  function watchSeason(year) {
    unwatchSeason();
    unwatchSeason = store.doc(nameSeasonPath(year)).onSnapshot(
      (/** @type {any} */ snapshot) => {
        if (year !== shownYear || !snapshot.exists) return;
        if (isSameJson(snapshot.data(), keptSeason)) return;
        keptSeason = snapshot.data();
        keepSeason(year, keptSeason);
        showChange();
      },
      () => {},
    );
  }

  /**
   * Shows a season's record, resolving once it has loaded, and then follows its changes.
   * @param {number} year
   */
  async function showYear(year) {
    shownYear = year;
    const season = await readDoc(nameSeasonPath(year));
    if (year !== shownYear) return;
    keptSeason = season;
    keepSeason(year, season);
    watchSeason(year);
  }

  /** @param {number} year */
  async function moveOnToYear(year) {
    const wasShowingCurrent = shownYear === currentYear;
    currentYear = year;
    noteCurrentYear(year);
    if (!wasShowingCurrent) return;
    await showYear(year);
    showChange();
  }

  function followStore() {
    if (isFollowing) return;
    isFollowing = true;
    store.doc(CURRENT_PATH).onSnapshot(
      (/** @type {any} */ snapshot) => {
        const year = snapshot.exists ? snapshot.data().season : null;
        if (year !== null && year !== currentYear) moveOnToYear(year).catch(showLoadFailure);
      },
      () => {},
    );
    store.doc(STATUS_PATH).onSnapshot(
      (/** @type {any} */ snapshot) => showStatus(snapshot.exists ? snapshot.data() : null),
      () => {},
    );
  }

  // A load that failed is tried again by loading again, since the store may since have answered
  // or moved on to a new season.
  async function loadCurrentSeason() {
    try {
      currentYear = await readCurrentYear();
      await showYear(currentYear);
    } finally {
      followStore();
    }
  }

  return {
    /** Loads the season the store says is current, and then follows the store. */
    loadCurrentSeason,
    showYear,
  };
}
