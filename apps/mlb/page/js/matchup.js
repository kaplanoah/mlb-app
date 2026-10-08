// The Matchup section of a game's sheet: the two starters face to face, where each ranks among the
// season's qualified starters, what each throws, and their last starts. A club yet to name today's starter
// shows who started its last games instead, and how rested each would be, and any other starter
// still to be named is one to check back for. Until each side loads, placeholders hold its shape.
// A side that didn't load says so with a Try again button: under the starter's club when the other
// side did load, or once for the whole section when nothing did.

import { nameTeam, renderClub, renderClubName } from "./clubs.js";
import { renderArm } from "./games-view.js";
import { formatShortDate, readCalendarDate, readEasternDay } from "#shared/days.js";
import { html } from "#shared/html.js";
import { renderPlaceholder } from "#shared/placeholder.js";
import {
  renderRetryBlock,
  renderRetryButton,
  renderRetryMessage,
  renderRetryNote,
} from "#shared/retry.js";
import { measureSpeedRange, renderPendingPitchMix, renderPitchMix } from "./pitch-mix.js";
import { fetchPitcher, fetchRotation } from "./pitcher-fetch.js";
import { renderPlayerButton } from "./player-button.js";
import { formatInnings } from "./stat-table.js";
import { PENDING_TAPE_SIDE, renderTapeRow } from "#shared/tape.js";

const SIDES = ["away", "home"];
const USUAL_REST_DAYS = 4;
// The Worker sends a starter's last three starts, and a club's last five starters.
const PENDING_STARTS = 3;
const PENDING_ROTATION = 5;
const TAPE = [
  { key: "era", label: "ERA", format: (line) => line.era },
  { key: "k9", label: "K/9", format: (line) => line.k9.toFixed(1) },
  { key: "bb9", label: "BB/9", format: (line) => line.bb9.toFixed(1) },
  { key: "speed", label: "Fastball mph", format: (line) => line.speed.toFixed(1) },
];

const isLoadingPitcher = (side) => Boolean(side.starter?.name) && !side.pitcher && !side.failed;

function renderBio(side) {
  const { pitcher } = side;
  if (isLoadingPitcher(side))
    return html`<span class="pitcher-bio">${renderPlaceholder("R Age 00")}</span>`;
  if (!pitcher) return html``;
  const age = pitcher.age && html`<span>Age ${pitcher.age}</span>`;
  return html`<span class="pitcher-bio">${renderArm(pitcher.hand)}${age}</span>`;
}

// The game keeps a starter's first name beside his last, so it shows even when his numbers don't.
const readFirstName = (side) => side.pitcher?.firstName || side.starter?.firstName || "";

function renderFirstName(side) {
  if (isLoadingPitcher(side) && !side.starter?.firstName)
    return html`<span class="pitcher-first">${renderPlaceholder("Firstname")}</span>`;
  const first = readFirstName(side);
  return first ? html`<span class="pitcher-first">${first}</span>` : html``;
}

// A named starter's name opens his sheet.
function renderName(side) {
  const { starter, pitcher } = side;
  const last = pitcher?.lastName || starter?.name || (starter ? "Not named yet" : "Still TBD");
  const content = html`${renderFirstName(side)}<span class="pitcher-last">${last}</span>`;
  if (!starter?.id || !side.club) return html`<span class="pitcher-name">${content}</span>`;
  const name = [readFirstName(side), last].filter(Boolean).join(" ");
  return renderPlayerButton({ id: starter.id, name }, side.club, {
    content,
    className: "pitcher-name",
  });
}

// Under the club of a starter whose numbers didn't load, where his hand and age would be.
const renderSideRetry = () =>
  html`<div class="retry-side">${renderRetryMessage("Couldn't load")}${renderRetryButton()}</div>`;

/**
 * @param {any} side
 * @param {boolean} isSectionFailed
 */
function renderPitcherId(side, isSectionFailed) {
  const { club } = side;
  const isRetryShown = side.failed && Boolean(side.starter?.name) && !isSectionFailed;
  return html`<div class="pitcher-id ${side.key}">
    ${renderName(side)}
    ${club ? renderClub(club) : html``}
    ${renderBio(side)}
    ${isRetryShown && renderSideRetry()}
  </div>`;
}

// A bar's length is the share of the other starters he beats: full for the best, empty for the worst.
function measureBeaten(rank) {
  if (!rank || rank.of < 2) return null;
  return Math.round(((rank.of - rank.rank) / (rank.of - 1)) * 100);
}

function findLeader(sides, key) {
  const [away, home] = sides.map((side) => side.pitcher?.ranks?.[key]?.rank);
  if (!away || !home || away === home) return null;
  return away < home ? "away" : "home";
}

function describeTapeSide(side, measure) {
  if (isLoadingPitcher(side)) return PENDING_TAPE_SIDE;
  const line = side.pitcher?.line;
  if (line?.[measure.key] == null) return null;
  return { value: measure.format(line), bar: measureBeaten(side.pitcher.ranks?.[measure.key]) };
}

const isUnranked = (side) => Boolean(side.pitcher?.line && !side.pitcher.ranks);

const describeUnranked = ({ pitcher }) =>
  `${pitcher.lastName} hasn't pitched enough innings to rank among this season's qualified starters`;

function renderTapeNotes(sides, counted) {
  const barsNote =
    sides.some((side) => side.pitcher?.ranks) &&
    html`<p class="tape-note">Bars are the share of this season's ${counted.count} qualified starters he beats</p>`;
  const unrankedNotes = sides
    .filter(isUnranked)
    .map((side) => html`<p class="tape-note">${describeUnranked(side)}</p>`);
  return html`${barsNote}${unrankedNotes}`;
}

function renderTape(sides) {
  const counted = sides.find((side) => side.pitcher?.line)?.pitcher.starters;
  if (!counted && !sides.some(isLoadingPitcher)) return html``;
  const rows = TAPE.map((measure) =>
    renderTapeRow({
      label: measure.label,
      away: describeTapeSide(sides[0], measure),
      home: describeTapeSide(sides[1], measure),
      leader: findLeader(sides, measure.key),
    }),
  );
  const notes = counted
    ? renderTapeNotes(sides, counted)
    : html`<p class="tape-note">${renderPlaceholder("Bars are the share of this season's qualified starters he beats")}</p>`;
  return html`<div class="tape">
    ${rows}
    ${notes}
  </div>`;
}

const formatStartDay = (date) => formatShortDate(readCalendarDate(date));

const isUnderWay = (start, side, game) =>
  game.state === "live" && start.date === game.date && start.opp === side.opponent;

const isToday = (date) => date === readEasternDay(Date.now()).date;

// A start still adding up says Now while he pitches, and once he's pulled, Today, like any other
// start from today.
function renderStartDay(start, side, game) {
  const isUnderWayStart = isUnderWay(start, side, game);
  if (isUnderWayStart && side.starter?.pitching) return html`<span class="start-now">Now</span>`;
  if (isUnderWayStart || isToday(start.date)) return html`<span>Today</span>`;
  return html`<span class="tabular">${formatStartDay(start.date)}</span>`;
}

function renderStart(start, side, game) {
  const opponent = start.opp ? `${start.home ? "vs" : "@"} ${nameTeam(start.opp)}` : "";
  const line = `${formatInnings(start.ip)} IP, ${start.runs} R, ${start.k} K`;
  return html`<li>${renderStartDay(start, side, game)}<span>${opponent}</span><span class="tabular">${line}</span></li>`;
}

function describeRest(rest) {
  if (rest === 1) return "1 day's rest";
  return `${rest} days' rest`;
}

function renderRotationStarter(starter) {
  const { start } = starter;
  const pitches = start.pitches != null ? `, ${start.pitches} pitches` : "";
  const isRested = starter.rest >= USUAL_REST_DAYS;
  return html`<li class="${isRested ? "rested" : ""}">
    <span class="rotation-name"><span>${starter.name}</span>${renderArm(starter.hand)}</span>
    <span class="tabular">${formatInnings(start.ip)} IP${pitches}</span>
    <span class="tabular">${describeRest(starter.rest)}</span>
  </li>`;
}

const renderPendingRotationStarter = () =>
  html`<li>
    <span class="rotation-name">${renderPlaceholder("Lastname")}</span>
    <span>${renderPlaceholder("6 1/3 IP, 98 pitches")}</span>
    <span>${renderPlaceholder("4 days' rest")}</span>
  </li>`;

const isLoadingRotation = (side) => !side.rotation && !side.failed;

function describeRotationNote(side, game) {
  if (isLoadingRotation(side))
    return renderPlaceholder("No starter named yet. Each recent starter");
  if (!side.rotation.starters.length) return "No starts in the last two weeks to go by";
  return `No starter named yet. Each recent starter's last start, and the rest he'd have on ${formatStartDay(game.date)}.`;
}

function renderRotationStarters(side) {
  if (isLoadingRotation(side))
    return Array.from({ length: PENDING_ROTATION }, renderPendingRotationStarter);
  return (side.rotation?.starters || []).map(renderRotationStarter);
}

function renderRotation(side, game) {
  const heading = html`<h3>${renderClubName(side.club)}<span>Who's rested</span></h3>`;
  if (side.failed)
    return html`<section class="scout">
      ${heading}${renderRetryNote("Couldn't load who started lately", "scout-note")}
    </section>`;
  const starters = renderRotationStarters(side);
  const list =
    starters.length > 0 &&
    html`<ul class="rotation">${starters}</ul>
      <p class="tape-note">Gold is a starter's usual rest, ${USUAL_REST_DAYS} days or more</p>`;
  return html`<section class="scout">
    ${heading}
    <p class="scout-note">${describeRotationNote(side, game)}</p>
    ${list}
  </section>`;
}

const isAwaitingStarter = (side, game) =>
  !side.starter && Boolean(side.club) && game.state === "pre" && Boolean(game.today);

// Only a game still to start can yet name a starter worth coming back for.
const isCheckBackSide = (side, game) =>
  game.state === "pre" && !side.starter?.name && !isAwaitingStarter(side, game);

const renderCheckBack = (sides, game) =>
  sides.some((side) => isCheckBackSide(side, game))
    ? html`<p class="check-back">Check back for pitchers</p>`
    : html``;

function renderScouting(side, game, speedRange) {
  if (isAwaitingStarter(side, game)) return renderRotation(side, game);
  if (!side.starter?.name) return html``;
  const name = side.starter.name;
  if (side.failed) return html``;
  if (!side.pitcher) return renderPendingScouting(name);
  const { pitcher } = side;
  const starts =
    pitcher.starts.length &&
    html`<h4>Last starts</h4><ul class="recent-starts">${pitcher.starts.map((start) => renderStart(start, side, game))}</ul>`;
  return html`<section class="scout">
    <h3>${name}<span>What he throws</span></h3>
    ${renderPitchMix(pitcher.pitches, speedRange)}
    ${starts}
  </section>`;
}

const renderPendingStart = () =>
  html`<li>
    <span>${renderPlaceholder("Sep 00")}</span>
    <span>${renderPlaceholder("vs Mariners")}</span>
    <span>${renderPlaceholder("5 2/3 IP, 2 R, 6 K")}</span>
  </li>`;

function renderPendingScouting(name) {
  return html`<section class="scout">
    <h3>${name}<span>What he throws</span></h3>
    ${renderPendingPitchMix()}
    <h4>Last starts</h4>
    <ul class="recent-starts">${Array.from({ length: PENDING_STARTS }, renderPendingStart)}</ul>
  </section>`;
}

// Both starters' speed lines share one range, so a dot sits at the same place for the same speed.
const measureSidesSpeedRange = (sides) =>
  measureSpeedRange(sides.filter((side) => side.pitcher).map((side) => side.pitcher.pitches));

/**
 * The sides that read something for the section: a named starter's numbers, or the last starters
 * of a club yet to name one.
 * @param {any[]} sides
 * @param {MatchupGame} game
 */
const listReadingSides = (sides, game) =>
  sides.filter((side) => Boolean(side.starter?.name) || isAwaitingStarter(side, game));

/**
 * @param {any[]} sides
 * @param {MatchupGame} game
 */
function isSectionFailed(sides, game) {
  const reading = listReadingSides(sides, game);
  return reading.length > 0 && reading.every((side) => side.failed);
}

/** @param {any[]} failed */
function describeSectionFailure(failed) {
  const named = failed.filter((side) => side.starter?.name);
  if (named.length === failed.length)
    return named.length === 1 ? "Couldn't load his numbers" : "Couldn't load the starters' numbers";
  if (named.length === 0) return "Couldn't load who started lately";
  return "Couldn't load the matchup";
}

export function renderMatchupBody(game, sides) {
  const speedRange = measureSidesSpeedRange(sides);
  const isFailed = isSectionFailed(sides, game);
  const scouting = isFailed
    ? renderRetryBlock(describeSectionFailure(listReadingSides(sides, game)), "scout-note")
    : sides.map((side) => renderScouting(side, game, speedRange));
  return html`<div class="faceoff">${sides.map((side) => renderPitcherId(side, isFailed))}</div>
    ${renderCheckBack(sides, game)}
    ${renderTape(sides)}
    ${scouting}`;
}

export const isLoadingSide = (side, game) =>
  isLoadingPitcher(side) || (isAwaitingStarter(side, game) && isLoadingRotation(side));

export const listSides = (game) =>
  SIDES.map((key, index) => ({
    key,
    club: game[key],
    opponent: game[SIDES[1 - index]],
    starter: game.starters?.[index] || null,
    pitcher: null,
    rotation: null,
    failed: false,
  }));

/**
 * @param {any} side
 * @param {MatchupGame} game
 * @param {number} season
 */
export async function loadSide(side, game, season) {
  try {
    if (side.starter?.name) side.pitcher = await fetchPitcher(side.starter.id, season);
    else if (isAwaitingStarter(side, game))
      side.rotation = await fetchRotation(side.club, game.date);
    side.failed = false;
  } catch {
    side.failed = true;
  }
}

/**
 * @typedef {{ id?: string, date: string, start: string, state: string, tbd?: boolean, doubleheader?: number, away: string, home: string, starters?: object[], networks?: string[], today: boolean }} MatchupGame
 */
