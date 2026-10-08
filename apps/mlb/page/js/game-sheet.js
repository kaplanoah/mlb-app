// The sheet every game opens, from its row, an update about it, or its card on a club's sheet, in
// two sections under pills: Game, the game's row with its score and status as the store updates
// them, where to watch it, its starters on one line that slides to Matchup, which sets the two face
// to face (matchup.js), and its box score (box-score-view.js), which the store pushes as it changes.
// Phones show it over the whole screen, wider screens as a modal, like Settings.

import { fetchBoxScore } from "./box-score-fetch.js";
import { renderBoxScore } from "./box-score-view.js";
import { renderTeamDot } from "./clubs.js";
import {
  describeStart,
  formatGameDay,
  nameGame,
  nameGameKey,
  renderArm,
  renderGameFaceOff,
} from "./games-view.js";
import { watchGameOpens } from "#shared/game-row.js";
import { html, joinWithSeparator, setHtml } from "#shared/html.js";
import { isLoadingSide, listSides, loadSide, renderMatchupBody } from "./matchup.js";
import { renderNetworks } from "#shared/network-logos.js";
import { session } from "./session.js";
import { listSlateGames } from "./slate.js";
import { wireSheetSections } from "#shared/sheet-sections.js";
import { openSheet, wireSheet } from "#shared/sheet.js";

/** @typedef {import("./matchup.js").MatchupGame} MatchupGame */
/** @typedef {{ game: MatchupGame, sides: any[], boxScore: any }} ShownGame */

const SIDES = ["away", "home"];
const STATE_ORDER = ["pre", "live", "final"];

// Phosphor's caret-right, at its Regular weight.
const STARTERS_CARET = html`<svg class="starters-caret" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
  <path
    d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"
  />
</svg>`;

// Each opening counts, so a sheet reopened on another game ignores the first one's answers.
let opening = 0;
/** @type {ShownGame | null} */
let shown = null;
/** @type {(() => void) | null} */
let unwatchBoxScore = null;
/** @type {ReturnType<typeof wireSheetSections> | null} */
let sections = null;

const findSheet = () => /** @type {HTMLElement} */ (document.getElementById("gameSheet"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * The game as the slate has it now, with whether it's today's, when a club yet to name its starter
 * shows who it might be.
 * @param {string} key
 * @returns {MatchupGame | null}
 */
function findGame(key) {
  const slate = session.state?.slate;
  const game = slate && listSlateGames(slate).find((each) => nameGameKey(each) === key);
  return game ? { ...game, today: game.date === slate.today.date } : null;
}

// Once the slate has moved past a game's day, the sheet shows it as it was when it opened.
/** @param {MatchupGame} game */
const readCurrentGame = (game) => findGame(nameGameKey(game)) ?? game;

/** @param {MatchupGame} game */
const renderWhen = (game) => joinWithSeparator([formatGameDay(game.date), describeStart(game)]);

const nameStarter = (side) => side.pitcher?.lastName || side.starter?.name || "TBD";

function renderStarter(side) {
  const hand = side.pitcher?.hand || side.starter?.hand;
  return html`<span class="starters-side ${side.key}"
    >${side.club ? renderTeamDot(side.club) : html``}<span class="starters-name">${nameStarter(side)}</span
    >${renderArm(hand)}</span
  >`;
}

/** @param {any[]} sides */
function renderStarters(sides) {
  if (!sides.some((side) => side.starter?.name)) return html``;
  const label = `Pitching matchup: ${sides.map(nameStarter).join(" vs ")}`;
  return html`<button type="button" class="starters-open" aria-label="${label}">
    ${renderStarter(sides[0])}<span class="starters-versus">vs</span>${renderStarter(sides[1])}${STARTERS_CARET}
  </button>`;
}

// Only a game still to be played says where it's on.
/** @param {MatchupGame} game */
const renderWhereToWatch = (game) =>
  game.state === "pre" || game.state === "live" ? renderNetworks(game.networks ?? []) : html``;

/**
 * The Game section: the game's row, where to watch it, its starters, and its box score.
 * @param {MatchupGame} game
 * @param {any[]} sides
 * @param {any} [boxScore]
 */
export const renderGameBody = (game, sides, boxScore = null) =>
  html`${renderGameFaceOff(game)}${renderWhereToWatch(game)}${renderStarters(sides)}${renderBoxScore(game, boxScore)}`;

/**
 * How far a box score has come: its game's state, then its plate appearances, then its players,
 * since lineups are posted, batters come up, and pitchers come in, but none of it goes back.
 * @param {any} boxScore
 */
function measureProgress(boxScore) {
  const players = SIDES.flatMap((side) => [...boxScore[side].batters, ...boxScore[side].pitchers]);
  const plateAppearances = players.reduce(
    (total, player) => total + (player.atBats ?? 0) + (player.walks ?? 0),
    0,
  );
  return [STATE_ORDER.indexOf(boxScore.state), plateAppearances, players.length];
}

/**
 * Whether `pushed` is from before `current`, as the store's copy can be when a sheet's own read of
 * MLB came after it.
 * @param {any} pushed
 * @param {any} current
 */
export function isEarlierBoxScore(pushed, current) {
  if (!current) return false;
  const [pushedProgress, currentProgress] = [measureProgress(pushed), measureProgress(current)];
  const index = pushedProgress.findIndex((value, place) => value !== currentProgress[place]);
  return index !== -1 && pushedProgress[index] < currentProgress[index];
}

/**
 * Whether the game's box score has anything to show: a club's lineup, posted on its day, or what
 * has happened since it started.
 * @param {MatchupGame} game
 */
const hasBoxScore = (game) =>
  game.state === "live" || game.state === "final" || (game.state === "pre" && !!game.today);

function renderSheet() {
  if (!shown) return;
  const game = readCurrentGame(shown.game);
  setHtml(findElement("gameTitle"), nameGame(game));
  setHtml(findElement("gameWhen"), renderWhen(game));
  setHtml(findElement("gameBody"), renderGameBody(game, shown.sides, shown.boxScore));
  const matchup = findElement("matchupBody");
  setHtml(matchup, renderMatchupBody(game, shown.sides));
  matchup.setAttribute("aria-busy", String(shown.sides.some((side) => isLoadingSide(side, game))));
}

function stopWatchingBoxScore() {
  unwatchBoxScore?.();
  unwatchBoxScore = null;
}

/**
 * Takes a box score the Worker read or the store pushed, unless the sheet has moved on to another
 * game or already shows a later one.
 * @param {ShownGame} opened
 * @param {any} boxScore
 */
function applyBoxScore(opened, boxScore) {
  if (shown !== opened || !boxScore || isEarlierBoxScore(boxScore, opened.boxScore)) return;
  opened.boxScore = boxScore;
  renderSheet();
}

// Until a game's final box score shows, the store reads it with each update while a page watches
// it, and pushes it.
/** @param {ShownGame} opened */
function watchBoxScore(opened) {
  stopWatchingBoxScore();
  if (opened.boxScore?.state === "final") return;
  unwatchBoxScore = session.db.doc(`games/${opened.game.id}`).onSnapshot((snapshot) => {
    if (snapshot.exists) applyBoxScore(opened, snapshot.data());
  });
}

// A read that fails keeps the box score already showing.
/** @param {ShownGame} opened */
async function loadBoxScore(opened) {
  const game = readCurrentGame(opened.game);
  if (!game.id || !hasBoxScore(game)) return;
  try {
    applyBoxScore(opened, await fetchBoxScore(game.id));
  } catch {
    // The store's copy, or the next update, may still bring it.
  }
  if (shown === opened) watchBoxScore(opened);
}

/**
 * Draws the game, then each side of its matchup and its box score again as they load.
 * @param {MatchupGame} game
 * @param {any[]} sides
 * @param {any} [boxScore] what the sheet showed before a reload
 */
async function showGame(game, sides, boxScore = null) {
  const sequence = ++opening;
  const opened = { game, sides, boxScore };
  shown = opened;
  stopWatchingBoxScore();
  renderSheet();
  loadBoxScore(opened);
  const season = session.activeYear;
  await Promise.all(
    sides.map((side) =>
      loadSide(side, game, season).then(() => {
        if (sequence === opening) renderSheet();
      }),
    ),
  );
}

/** @param {MatchupGame} game */
function openGameSheet(game) {
  openSheet(findSheet(), {
    key: nameGameKey(game),
    show: () => {
      showGame(game, listSides(game));
      sections?.showFirstSection();
    },
  });
}

const readShownGame = () => shown && { ...shown, section: sections?.readShown() ?? null };

// What each side and the box score showed stays until they load again.
/** @param {(ShownGame & { section?: unknown }) | null} saved */
function reopenGameSheet(saved) {
  if (!saved?.game || !Array.isArray(saved.sides)) return false;
  showGame(saved.game, saved.sides, saved.boxScore ?? null);
  if (typeof saved.section === "string") sections?.showSection(saved.section, true);
  return true;
}

/**
 * Redraws the open sheet from the season as the store has it now. A game that started since the
 * sheet read its box score, or whose day came, reads it again.
 */
export function refreshGameSheet() {
  if (!shown) return;
  renderSheet();
  const game = readCurrentGame(shown.game);
  const isOutOfStep = !shown.boxScore || shown.boxScore.state !== game.state;
  if (isOutOfStep && hasBoxScore(game) && game.state !== "final") loadBoxScore(shown);
}

/** @param {HTMLElement} button */
const findButtonGame = (button) => findGame(button.dataset.game ?? "");

/** @param {HTMLElement} button */
function openFromButton(button) {
  const game = findButtonGame(button);
  if (game) openGameSheet(game);
}

/** @param {HTMLElement} button */
function prepareFromButton(button) {
  const game = findButtonGame(button);
  if (!game) return;
  for (const side of listSides(game)) loadSide(side, game, session.activeYear);
}

/** @param {Event} event */
function showMatchupOnTap(event) {
  if (/** @type {Element} */ (event.target).closest(".starters-open"))
    sections?.showSection("matchup");
}

export function startGameSheet() {
  const sheet = findSheet();
  sections = wireSheetSections(sheet);
  for (const holder of ["games-pages", "updates", "teamBody"])
    watchGameOpens(findElement(holder), { open: openFromButton, prepare: prepareFromButton });
  findElement("gameBody").addEventListener("click", showMatchupOnTap);
  wireSheet(sheet, {
    closeButton: findElement("gameCloseBtn"),
    backButton: findElement("gameBackBtn"),
    findScroller: sections.findShownSection,
    keeper: { read: readShownGame, reopen: reopenGameSheet },
    name: "Game",
    forget: () => {
      stopWatchingBoxScore();
      shown = null;
    },
  });
}
