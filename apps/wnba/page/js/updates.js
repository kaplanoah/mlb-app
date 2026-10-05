// The Updates box: each playoff game finished since this device last dismissed it, with where its
// series stood after it, each opening the game's sheet, and the release notes out since then.
// Nobody signs in, and people share the page's address, so each device keeps its own dismissal,
// and only phones and tablets show the box, only for the current season.

import { countDaysBetween, readEasternDay } from "#shared/days.js";
import { isTouchDevice } from "#shared/device.js";
import { keepOnDevice, readFromDevice } from "#shared/device-storage.js";
import { listFreshNotes, showUpdates } from "#shared/updates.js";
import { renderTeamName } from "./clubs.js";
import { readGameDay } from "./days.js";
import { renderGameOpenButton } from "./games-view.js";
import { RELEASE_NOTES } from "./release-notes.js";
import { isPastSeason, session } from "./session.js";
import { describeWin, isPlayoffFinal } from "./win-text.js";

/** @typedef {import("./games-view.js").Game} Game */
/** @typedef {{ at: number, leagueDay: string, day: Date | null, endedNextDay: boolean, text: import("#shared/html.js").Markup, action: import("#shared/html.js").Markup | false }} PlayoffWin */

const SEEN_KEY = "updatesSeenAt";

// Null when this device has never dismissed the box.
function readSeenAt() {
  const seenAt = readFromDevice(SEEN_KEY);
  return typeof seenAt === "number" && seenAt > 0 ? seenAt : null;
}

/** @param {number} at */
const saveSeenAt = (at) => keepOnDevice(SEEN_KEY, at);

// The feeds give no time a game ended but the Worker's first sight of it final, so a game found
// final without being seen live goes by its start.
/** @param {Game} game */
const readFinishedAt = (game) => Date.parse(game.end ?? game.start ?? "");

// A game that ends after midnight still counts on the league's day it started.
/**
 * @param {Game} game
 * @param {number} finishedAt
 */
function readLeagueDay(game, finishedAt) {
  const startedAt = Date.parse(game.start ?? "");
  return readEasternDay(Number.isFinite(startedAt) ? startedAt : finishedAt).date;
}

/**
 * @param {Game} game
 * @param {Game[]} games the season's games
 * @returns {PlayoffWin}
 */
function describePlayoffWin(game, games) {
  const at = readFinishedAt(game);
  const day = readGameDay(game);
  return {
    at,
    leagueDay: readLeagueDay(game, at),
    day,
    endedNextDay: !!day && countDaysBetween(day, new Date(at)) > 0,
    text: describeWin(game, games, renderTeamName),
    action: renderGameOpenButton(game),
  };
}

/**
 * Every playoff game the season has finished, newest first.
 * @param {{ games?: Game[] } | null} season
 * @returns {PlayoffWin[]}
 */
export function listPlayoffWins(season) {
  const games = season?.games ?? [];
  return games
    .filter((game) => isPlayoffFinal(game) && Number.isFinite(readFinishedAt(game)))
    .map((game) => describePlayoffWin(game, games))
    .sort((first, second) => second.at - first.at);
}

/**
 * Just before the first of the latest day's finals.
 * @param {PlayoffWin[]} wins newest first
 */
function findLatestDayStart(wins) {
  const latestDay = wins.filter((win) => win.leagueDay === wins[0].leagueDay);
  return Math.min(...latestDay.map((win) => win.at)) - 1;
}

// A device that has never dismissed the box starts it at the latest day's finals, not the whole
// postseason, and keeps that start, so nothing that finishes later is skipped.
/** @param {PlayoffWin[]} wins newest first */
function readOrStartSeenAt(wins) {
  const seenAt = readSeenAt();
  if (seenAt != null || !wins.length) return seenAt ?? 0;
  const start = findLatestDayStart(wins);
  saveSeenAt(start);
  return start;
}

const findPanel = () => /** @type {HTMLElement} */ (document.getElementById("updates"));

/** The playoff games finished since this device last dismissed the box, newest first. */
export function listFreshUpdates() {
  const wins = listPlayoffWins(session.season);
  const seenAt = readOrStartSeenAt(wins);
  return wins.filter((win) => win.at > seenAt);
}

/** The release notes out since this device last dismissed the box. */
const listFreshReleaseNotes = () =>
  listFreshNotes(RELEASE_NOTES, readOrStartSeenAt(listPlayoffWins(session.season)));

// The newest update's time is the Worker's, and a note's is the one it was given, so the
// dismissal doesn't depend on this device's clock.
function dismissUpdates() {
  const times = [...listFreshUpdates(), ...listFreshReleaseNotes()].map((item) => item.at);
  if (times.length) saveSeenAt(Math.max(...times));
  drawUpdates();
}

export function drawUpdates() {
  const isShown = isTouchDevice() && !isPastSeason();
  showUpdates(findPanel(), isShown ? listFreshUpdates() : [], {
    dismiss: dismissUpdates,
    notes: isShown ? listFreshReleaseNotes() : [],
  });
}
