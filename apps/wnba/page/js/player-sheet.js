// The sheet a tap on a player's name opens, over the sheet it was in: her facts and numbers for
// the season shown, which the Worker reads from the league, read the first time the sheet shows
// her season and again once they're old. She shows as out only while her team still plays.

import { setHtml } from "#shared/html.js";
import { redrawSheet } from "#shared/sheet-resize.js";
import { openSheet, wireSheet } from "#shared/sheet.js";
import { fetchFromWorker } from "#shared/worker-fetch.js";
import {
  describePlayerNote,
  renderPlayerBody,
  renderPlayerFacts,
  renderPlayerHeading,
} from "./player-view.js";
import { isStillPlaying } from "./series.js";
import { isPastSeason, session } from "./session.js";
import { TEAMS } from "./teams.js";

/** @typedef {import("./player-view.js").Player} Player */
/** @typedef {import("./player-view.js").PlayerSubject} PlayerSubject */
/** @typedef {{ at: number, player: Player | null, isLoading: boolean }} PlayerRead */

const FETCH_TIMEOUT_MS = 15 * 1000;
// Her numbers change after each game.
const READ_AGAIN_MS = 10 * 60 * 1000;
// A sheet that didn't load says to try again in a minute.
const RETRY_MS = 60 * 1000;
// What a sheet opened over a player's calls it on its back button.
const NAME_FOR_BACK = "Player";

// Each read is kept by her id, team, and season, as 1627668:NYL:2026.
/** @type {Map<string, PlayerRead>} */
const reads = new Map();
/** @type {PlayerSubject | null} */
let shownPlayer = null;

const findDialog = () => /** @type {HTMLDialogElement} */ (document.getElementById("playerDialog"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {PlayerSubject} subject
 * @param {number} year
 */
const nameRead = ({ id, team }, year) => `${id}:${team}:${year}`;

/**
 * @param {PlayerSubject} subject
 * @param {number} year
 */
const fetchPlayer = ({ id, team }, year) =>
  fetchFromWorker(
    `player?id=${encodeURIComponent(id)}&team=${encodeURIComponent(team)}&season=${year}`,
    {
      reuseMs: READ_AGAIN_MS,
      timeoutMs: FETCH_TIMEOUT_MS,
      isExpected: (body) => body.id === id && body.team === team && body.season === year,
    },
  );

/** @param {PlayerRead} read */
const isFresh = (read) =>
  read.isLoading || Date.now() - read.at < (read.player ? READ_AGAIN_MS : RETRY_MS);

/**
 * Keeps what a read found, or what the last one did when it failed.
 * @param {string} key
 * @param {PlayerRead} read
 * @param {Player | null} player
 */
function keepRead(key, read, player) {
  if (reads.get(key) !== read) return;
  reads.set(key, { ...read, isLoading: false, player: player ?? read.player });
  renderSheet();
}

/**
 * Her last read for the season, after starting a new one when there's none or it's old.
 * @param {PlayerSubject} subject
 * @param {number} year
 */
function readPlayer(subject, year) {
  const key = nameRead(subject, year);
  const kept = reads.get(key);
  if (kept && isFresh(kept)) return kept;
  /** @type {PlayerRead} */
  const read = { at: Date.now(), player: kept?.player ?? null, isLoading: true };
  reads.set(key, read);
  fetchPlayer(subject, year).then(
    (player) => keepRead(key, read, player),
    () => keepRead(key, read, null),
  );
  return read;
}

function renderSheet() {
  const subject = shownPlayer;
  if (!subject) return;
  const { player, isLoading } = readPlayer(subject, session.year);
  const showsOut = !isPastSeason() && isStillPlaying(session.season?.series ?? [], subject.team);
  redrawSheet(findDialog(), () => {
    setHtml(findElement("playerTitle"), renderPlayerHeading(subject, player, showsOut));
    setHtml(findElement("playerNote"), describePlayerNote(subject, player));
    setHtml(findElement("playerFacts"), renderPlayerFacts(player) || "");
    setHtml(
      findElement("playerBody"),
      renderPlayerBody({
        player,
        isLoading,
        season: session.season,
        isPastSeason: isPastSeason(),
        now: Date.now(),
      }),
    );
  });
}

/**
 * Fills the sheet in with a player, ready to open.
 * @param {PlayerSubject} subject
 */
function preparePlayer(subject) {
  shownPlayer = subject;
  renderSheet();
  return findDialog();
}

/** @param {unknown} value */
const isText = (value) => typeof value === "string" && value.length > 0;

/** @param {Partial<PlayerSubject> | null} saved */
function reopenPlayer(saved) {
  if (!saved || !isText(saved.id) || !isText(saved.name)) return false;
  if (typeof saved.team !== "string" || !Object.hasOwn(TEAMS, saved.team)) return false;
  preparePlayer(/** @type {PlayerSubject} */ (saved));
  return true;
}

/** @param {Event} event */
function openOnTap(event) {
  const button = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest("[data-player]")
  );
  const { player: id, playerTeam: team, playerName: name } = button?.dataset ?? {};
  if (!id || !team || !name) return;
  openSheet(preparePlayer({ id, team, name }));
}

/** Redraws the open sheet from what the page shows now. */
export const refreshPlayerSheet = () => renderSheet();

export function startPlayerSheet() {
  const dialog = findDialog();
  wireSheet(dialog, {
    doneButton: findElement("playerDoneBtn"),
    backButton: findElement("playerBackBtn"),
    keeper: { read: () => shownPlayer, reopen: reopenPlayer },
    nameForBack: () => NAME_FOR_BACK,
  });
  document.addEventListener("click", openOnTap);
  dialog.addEventListener("close", () => {
    shownPlayer = null;
  });
}
