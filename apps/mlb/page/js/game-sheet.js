// The sheet every game opens, from its row, an update about it, or its card on a club's sheet, in
// two sections under pills: Game, the game's row with its score and status as the store updates
// them, where to watch it, and its starters on one line that slides to Matchup, which sets the two
// face to face (matchup.js). Phones show it over the whole screen, wider screens as a modal, like
// Settings.

import { renderTeamDot } from "./clubs.js";
import {
  describeStart,
  formatGameDay,
  listSlateGames,
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
import { wireSheetSections } from "#shared/sheet-sections.js";
import { openSheet, wireSheet } from "#shared/sheet.js";

/** @typedef {import("./matchup.js").MatchupGame} MatchupGame */

// Phosphor's caret-right, at its Regular weight.
const STARTERS_CARET = html`<svg class="starters-caret" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
  <path
    d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"
  />
</svg>`;

// Each opening counts, so a sheet reopened on another game ignores the first one's answers.
let opening = 0;
/** @type {{ game: MatchupGame, sides: any[] } | null} */
let shown = null;
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
 * The Game section: the game's row, where to watch it, and its starters.
 * @param {MatchupGame} game
 * @param {any[]} sides
 */
export const renderGameBody = (game, sides) =>
  html`${renderGameFaceOff(game)}${renderWhereToWatch(game)}${renderStarters(sides)}`;

function renderSheet() {
  if (!shown) return;
  const game = readCurrentGame(shown.game);
  setHtml(findElement("gameTitle"), nameGame(game));
  setHtml(findElement("gameWhen"), renderWhen(game));
  setHtml(findElement("gameBody"), renderGameBody(game, shown.sides));
  const matchup = findElement("matchupBody");
  setHtml(matchup, renderMatchupBody(game, shown.sides));
  matchup.setAttribute("aria-busy", String(shown.sides.some((side) => isLoadingSide(side, game))));
}

/**
 * Draws the game, then each side of its matchup again as it loads.
 * @param {MatchupGame} game
 * @param {any[]} sides
 */
async function showGame(game, sides) {
  const sequence = ++opening;
  shown = { game, sides };
  renderSheet();
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

// What each side showed stays until it loads again.
/** @param {{ game: MatchupGame, sides: any[], section?: unknown } | null} saved */
function reopenGameSheet(saved) {
  if (!saved?.game || !Array.isArray(saved.sides)) return false;
  showGame(saved.game, saved.sides);
  if (typeof saved.section === "string") sections?.showSection(saved.section, true);
  return true;
}

/** Redraws the open sheet from the season as the store has it now. */
export const refreshGameSheet = () => renderSheet();

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
      shown = null;
    },
  });
}
