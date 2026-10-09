import { findSeriesBetween, isEliminated } from "./bracket.js";
import { nameTeam, renderClub, renderPlainClub } from "./clubs.js";
import { renderAllStarMark } from "#shared/all-star.js";
import { formatClockTime, formatWeekdayAndDate, readCalendarDate } from "#shared/days.js";
import { chooseStartList, fillGameLists } from "#shared/game-pager.js";
import { html } from "#shared/html.js";
import { renderGameRow } from "#shared/game-row.js";
import { formatOrdinal } from "#shared/ordinal.js";
import { describeRace, findStandingsRow, isSeedFinal } from "./race.js";
import { session } from "./session.js";
import { listSlateList } from "./slate.js";

const HALF_INNING_LABELS = { top: "Top", middle: "Mid", bottom: "Bot", end: "End" };
const OUT_LIGHTS = 2;
const CLINCH_TITLES = {
  z: "Clinched the best record in the league",
  y: "Clinched the division",
  w: "Clinched a wild card spot",
  x: "Clinched a playoff spot",
};
// Trimmed to the drawing, so sized in em its base sits on the text's baseline like a letter.
const SEED_LOCK = html`<svg class="seed-lock" viewBox="1.5 1.3 9 12.4" role="img" aria-label="seed final"><path d="M3.5 7V4.5a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="2.2" y="7.2" width="7.6" height="5.8" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
const EMPTY_LIST_TEXT = {
  previous: "No earlier games this season",
  today: "No games today",
  next: "No games scheduled yet",
};
const ARMS = { L: "Throws left-handed", R: "Throws right-handed" };

export const formatGameDay = (date) => formatWeekdayAndDate(readCalendarDate(date));

export function describeStart(game) {
  if (game.tbd) return game.doubleheader === 2 ? "After 1st game" : "Time TBD";
  return formatClockTime(new Date(game.start));
}

export function describeInning(game) {
  return [HALF_INNING_LABELS[game.half], formatOrdinal(game.inning || 1)].filter(Boolean).join(" ");
}

// The third out ends the half, so only the first two get a light.
export function renderOutLights(game) {
  if (game.state !== "live" || game.delay || game.outs == null) return html``;
  const lights = Array.from(
    { length: OUT_LIGHTS },
    (_, index) => html`<span class="out-light ${index < game.outs ? "on" : ""}"></span>`,
  );
  const label = game.outs === 1 ? "1 out" : `${game.outs} outs`;
  return html`<span class="out-lights" role="img" aria-label="${label}">${lights}</span>`;
}

function describeStatus(game) {
  if (game.delay) return game.delay;
  if (game.state === "final") return "Final";
  if (game.state === "live") return describeInning(game);
  return "";
}

// Not a .team-name: its clipped overflow cuts off the slant of the italic's last letter in Safari.
// The row opens its matchup wherever it's tapped, so its clubs are plain.
function renderSideClub(id) {
  if (id) return renderPlainClub(id);
  return html`<span class="club"><span class="dot unknown-club"></span><span class="tbd">TBD</span></span>`;
}

function renderSeed(id) {
  const team = session.state && session.state.teams && session.state.teams[id];
  if (!team || !team.seed) return html``;
  return html`<span class="seed">${team.seed} seed${isSeedFinal(id) && SEED_LOCK}</span>`;
}

function renderRace(row) {
  const race = describeRace(row);
  if (!race || !race.label) return html``;
  const title = race.standing === "clinched" && CLINCH_TITLES[race.label];
  return html`<span class="race ${race.standing}"${title && html` title="${title}"`}>${race.label}</span>`;
}

function renderFacts(id) {
  if (!id) return html``;
  const row = findStandingsRow(id);
  return html`<span class="game-facts">${renderSeed(id)}${row && html`<span class="tabular">${row.w}-${row.l}</span>`}${renderRace(row)}</span>`;
}

const isNamed = (starter) => Boolean(starter?.name);

export const renderArm = (hand) =>
  ARMS[hand] ? html`<span class="arm" title="${ARMS[hand]}">${hand}</span>` : html``;

const renderStarter = (starter, side) =>
  html`<span class="starter ${side}" title="Starting pitcher"><span class="starter-name">${starter.name}</span>${renderArm(starter.hand)}</span>`;

function isOut(id) {
  const { state } = session;
  const isOutOfPostseason = Boolean(state && state.teams) && isEliminated(state, id);
  return isOutOfPostseason || describeRace(findStandingsRow(id))?.standing === "out";
}

const renderPendingStarter = (side) =>
  html`<span class="starter ${side} pending" title="Starting pitcher"><span class="starter-name">Still TBD</span></span>`;

function renderStarterLine(starter, place, isPending) {
  if (isNamed(starter)) return renderStarter(starter, place);
  return isPending && renderPendingStarter(place);
}

function describeSide(id, place, starter, hasWon, isPending, renderClubLine) {
  return {
    lines: html`${id ? renderClubLine(id) : renderSideClub(id)}${renderFacts(id)}`,
    classes: [hasWon && "won", isOut(id) && "out"],
    extra: renderStarterLine(starter, place, isPending),
  };
}

function renderScore(game, awayLost, homeLost) {
  const [awayScore, homeScore] = game.score;
  return html`<span class="game-score tabular"><span class="${awayLost ? "lost" : ""}">${awayScore}</span><span class="score-dash">-</span><span class="${homeLost ? "lost" : ""}">${homeScore}</span></span>`;
}

function findGameSeries(game) {
  const { state } = session;
  if (!game.postseason || !state || !state.teams || !state.series) return null;
  return findSeriesBetween(state, game.away, game.home);
}

// Short names, since the label shares the row's middle with the time or score.
export function nameRound(series) {
  const [league] = series.id.split("_");
  if (series.round === "WC") return `${league} WC`;
  if (series.round === "WS") return "WS";
  return `${league}${series.round}`;
}

// The saved series counts only finished games, so a game under way shows the series as it stood
// at first pitch. Wins run away-home, like the clubs on either side.
function renderSeriesLabel(game, series) {
  const [awayWins, homeWins] =
    series.teamA === game.away ? [series.winsA, series.winsB] : [series.winsB, series.winsA];
  return html`<span class="series-label ${series.winner ? "decided" : ""}">${nameRound(series)} <span class="series-count tabular">${awayWins}-${homeWins}</span></span>`;
}

function renderHeadline(game, awayLost, homeLost) {
  if (game.score) return renderScore(game, awayLost, homeLost);
  const time = game.state === "off" ? game.detail || "Postponed" : describeStart(game);
  return html`<span class="game-time">${time}</span>`;
}

function renderStatus(game) {
  const status = describeStatus(game);
  return Boolean(status) && html`${status}${renderOutLights(game)}`;
}

const nameSide = (id) => (id ? nameTeam(id) : "TBD");

/** @param {{ away?: string, home?: string }} game */
export const nameGame = (game) => `${nameSide(game.away)} @ ${nameSide(game.home)}`;

// A doubleheader's two games share their day and clubs, so its game number tells them apart.
/** @param {{ date: string, away?: string, home?: string, doubleheader?: number }} game */
export const nameGameKey = (game) =>
  `${game.date} ${game.away ?? ""} ${game.home ?? ""} ${game.doubleheader || 1}`;

/** @param {{ date: string, away?: string, home?: string }} game */
export const describeGameLabel = (game) =>
  `${nameSide(game.away)} at ${nameSide(game.home)}, ${formatGameDay(game.date)}`;

// The whole row, or an update about the game, opens the game's sheet.
export const renderGameButton = (game) =>
  html`<button type="button" class="game-open" aria-label="Game details: ${describeGameLabel(game)}" data-game="${nameGameKey(game)}"></button>`;

const isAwaitingStarter = (game, id, starter, isToday) =>
  isToday && game.state === "pre" && Boolean(id) && !starter;

/**
 * @param {object | null} series the postseason series the game belongs to, when it's labeled
 * @param {boolean} isToday
 * @param {(id: string) => any} renderClubLine
 */
function describeGameRow(game, series, isToday, renderClubLine) {
  const [awayScore, homeScore] = game.score || [];
  const isFinal = game.state === "final";
  const awayLost = isFinal && awayScore < homeScore;
  const homeLost = isFinal && homeScore < awayScore;
  const [awayStarter, homeStarter] = game.starters || [];
  const isAwayPending = isAwaitingStarter(game, game.away, awayStarter, isToday);
  const isHomePending = isAwaitingStarter(game, game.home, homeStarter, isToday);
  return {
    classes: [game.state, game.delay && "delayed"],
    away: describeSide(game.away, "away", awayStarter, homeLost, isAwayPending, renderClubLine),
    home: describeSide(game.home, "home", homeStarter, awayLost, isHomePending, renderClubLine),
    label: Boolean(series) && renderSeriesLabel(game, series),
    headline: renderHeadline(game, awayLost, homeLost),
    status: renderStatus(game),
  };
}

function renderGame(game, series, isToday) {
  return renderGameRow({
    ...describeGameRow(game, series, isToday, renderSideClub),
    action: renderGameButton(game),
  });
}

// The All-Star Game's teams are its leagues, in the colors the page gives them, and its star is set
// in as a club's dot is, with the dot's own shadow and light.
const ALL_STAR_LEAGUES = {
  AL: { name: "American League", color: "var(--al)" },
  NL: { name: "National League", color: "var(--nl)" },
};
const ALL_STAR_LOOK = { size: 19, shadow: { x: 0, y: 2, blur: 3 }, light: { x: 0, y: 1 } };

/**
 * @param {any} game
 * @param {"away" | "home"} place
 */
function renderAllStarClub(game, place) {
  const league = ALL_STAR_LEAGUES[game[place]];
  if (!league) return renderSideClub(null);
  const star = renderAllStarMark({
    id: `all-star-${game.id}-${place}`,
    color: league.color,
    look: ALL_STAR_LOOK,
  });
  return html`<span class="club">${star}<span class="team-name">${league.name}</span></span>`;
}

// Its teams aren't clubs, so it has no sheet, and nor do they.
function renderAllStarGame(game) {
  const [awayScore, homeScore] = game.score || [];
  const isFinal = game.state === "final";
  const awayLost = isFinal && awayScore < homeScore;
  const homeLost = isFinal && homeScore < awayScore;
  return renderGameRow({
    classes: [game.state, game.delay && "delayed"],
    away: { lines: renderAllStarClub(game, "away"), classes: [homeLost && "won"] },
    home: { lines: renderAllStarClub(game, "home"), classes: [awayLost && "won"] },
    label: html`All-Star Game`,
    headline: renderHeadline(game, awayLost, homeLost),
    status: renderStatus(game),
  });
}

function renderListedGame(game, list) {
  if (game.allStar) return renderAllStarGame(game);
  const isToday = list === "today";
  return renderGame(game, isToday ? findGameSeries(game) : null, isToday);
}

// A game's sheet heads its Game section with the game's row, whose clubs each open their own
// sheet, and leaves its starters to the line under it.
export function renderGameFaceOff(game) {
  const row = describeGameRow({ ...game, starters: [] }, findGameSeries(game), false, renderClub);
  return html`<ul class="game-list game-faceoff">${renderGameRow(row)}</ul>`;
}

// A doubleheader's games sit together in game order, since MLB can list game 2 with the earlier start.
function orderDay(games) {
  const isSameMatchup = (game, other) => game.away === other.away && game.home === other.home;
  const findSlot = (game) =>
    Math.min(
      ...games
        .filter((other) => isSameMatchup(game, other))
        .map((other) => Date.parse(other.start)),
    );
  return games
    .map((game) => ({ game, slot: findSlot(game) }))
    .sort(
      (first, second) =>
        first.slot - second.slot ||
        (first.game.doubleheader || 0) - (second.game.doubleheader || 0),
    )
    .map(({ game }) => game);
}

function groupByDay(games, isNewestFirst) {
  const dates = [...new Set(games.map((game) => game.date))].sort();
  if (isNewestFirst) dates.reverse();
  return dates.map((date) => ({
    date,
    games: orderDay(games.filter((game) => game.date === date)),
  }));
}

function describeMissingSlate() {
  if (session.activeYear !== session.currentSeason) return "Games show for the current season only";
  return "Games appear here as soon as the page can reach MLB";
}

export function renderGameList(slate, list) {
  if (!slate) return html`<p class="stand-empty">${describeMissingSlate()}</p>`;
  const games = listSlateList(slate, list);
  if (!games.length) return html`<p class="stand-empty">${EMPTY_LIST_TEXT[list]}</p>`;
  return html`${groupByDay(games, list === "previous").map(
    (day) => html`<h3 class="game-day">${formatGameDay(day.date)}</h3>
      <ul class="game-list">${day.games.map((game) => renderListedGame(game, list))}</ul>`,
  )}`;
}

/** @param {any} slate */
const chooseGamesStart = (slate) =>
  chooseStartList({
    hasGamesToday: !!slate && listSlateList(slate, "today").length > 0,
    hasGamesAhead: !!slate && listSlateList(slate, "next").length > 0,
  });

export function renderGames() {
  const slate = session.state && session.state.slate;
  fillGameLists((list) => renderGameList(slate, list), chooseGamesStart(slate));
}
