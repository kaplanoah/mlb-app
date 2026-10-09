import {
  addDays,
  formatLongDate,
  formatMonth,
  formatShortMonth,
  formatShortWeekday,
  readCalendarDate,
} from "./days.js";
import { html, setHtml } from "./html.js";
import { isAwayLong } from "./last-game-list.js";
import { watchTimeAway } from "./resume.js";
import { scrollWithSpring } from "./spring-scroll.js";

// A season's games as one list of its game days, from its first to its last, under a bar holding
// a strip of every day between them. The strip's chosen day is the one at the top of the list, and
// follows it as it scrolls; a tap on a day, or on Today, brings that day to the top, a day's gap
// under the bar, so nothing of the day before shows. A tap on a date without games brings in its
// No games row, which leaves once it's out of sight, and a tap on Today while the list is already
// there pulses the date. While a finger moves the strip, the month names the day in its middle.
// The list opens on its start day, today or the day the app names, and goes back there once
// someone has been away two minutes. A league hands it each game day's markup, as it draws a day
// elsewhere, and a date without games' markup.

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {{ day: string, markup: Markup }} ListedDay a "YYYY-MM-DD" day and its games */
/**
 * @typedef {object} DayStripFill
 * @property {ListedDay[]} days each game day, in order
 * @property {string} today the viewer's "YYYY-MM-DD" date
 * @property {string} startDay the day the list opens on and Today brings to the top
 * @property {string} emptyNote what the view says while it has no days
 * @property {(day: string) => Markup} renderQuietDay a date without games, as the list shows it
 */

// Phosphor's calendar-dot, at its Regular weight, as beside the words of a Read button.
const CALENDAR_DOT = html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-64-56a16,16,0,1,1-16-16A16,16,0,0,1,144,152Z"/></svg>`;

// A day reaches the top of the list once its top is this close to it, as when a scroll stops
// just short of it.
const TOP_REACH_PX = 24;
// Farther than this many screens, a jump is made at once rather than flown.
const FLOWN_SCREENS = 3;
// A tap on Today while the list is already there grows the date this much and back, this fast.
const PULSE_SCALE = 1.04;
const PULSE_MS = 290;

/** @type {HTMLElement | null} */
let view = null;
/** @type {DayStripFill | null} */
let shown = null;
/** @type {string | null} */
let chosenDay = null;
// A day a tap or Today sent the list to stays chosen while the list travels there, and until it
// moves away again, since the season's last days can't all reach the top.
/** @type {{ day: string, hasArrived: boolean } | null} */
let held = null;
let isPlaced = false;
// The day at the top of the list and how far its top sits from the list's, kept while the list
// shows, so the list can take it back after a redraw, or once its tab shows again.
/** @type {{ day: string, offset: number } | null} */
let anchor = null;
// A date without games that a tap brought into the list, until it's out of sight.
/** @type {string | null} */
let quietDay = null;
// A finger or wheel moving the strip has the month name the day in its middle, until the list moves.
let isStripSwiped = false;
/** @type {Map<string, string>} */
const drawnDays = new Map();

const findBar = () => /** @type {HTMLElement | null} */ (view?.querySelector(".day-bar") ?? null);
const findStrip = () =>
  /** @type {HTMLElement | null} */ (view?.querySelector(".day-strip") ?? null);
const findList = () => /** @type {HTMLElement | null} */ (view?.querySelector(".day-list") ?? null);

/**
 * Every day from the first game day to the last.
 * @param {ListedDay[]} days
 */
function listStripDays(days) {
  if (!days.length) return [];
  const last = days[days.length - 1].day;
  const stripDays = [];
  for (let day = days[0].day; day <= last; day = addDays(day, 1)) stripDays.push(day);
  return stripDays;
}

/**
 * @param {string} day
 * @param {{ isListed: boolean, isToday: boolean, isChosen: boolean }} state
 */
function renderCell(day, { isListed, isToday, isChosen }) {
  const date = readCalendarDate(day);
  const label =
    date.getDate() === 1
      ? html`<span class="cell-month">${formatShortMonth(date)}</span>`
      : html`<span class="cell-name">${formatShortWeekday(date)}</span>`;
  const classes = [
    "day-cell",
    isToday && "is-today",
    isChosen && "is-chosen",
    !isListed && "is-quiet",
  ]
    .filter(Boolean)
    .join(" ");
  const content = html`${label}<span class="cell-number tabular">${date.getDate()}</span>`;
  return html`<button type="button" class="${classes}" data-day="${day}" aria-label="${formatLongDate(date)}"${isToday ? html` aria-current="date"` : ""}>${content}</button>`;
}

/** @param {DayStripFill} fill */
function renderCells({ days, today }) {
  const listed = new Set(days.map(({ day }) => day));
  return html`${listStripDays(days).map((day) =>
    renderCell(day, {
      isListed: listed.has(day),
      isToday: day === today,
      isChosen: day === chosenDay,
    }),
  )}`;
}

/** @param {string} day */
const renderMonth = (day) => formatMonth(readCalendarDate(day));

/** @param {DayStripFill} fill */
const renderBar = (fill) =>
  html`<div class="day-bar-head">
      <p class="strip-month">${renderMonth(chosenDay ?? fill.startDay)}</p>
      <button type="button" class="go-today">${CALENDAR_DOT}<span>Today</span></button>
    </div>
    <div class="day-strip" role="group" aria-label="Days">${renderCells(fill)}</div>`;

/**
 * The days the list shows: each game day, and the date without games a tap brought in.
 * @param {DayStripFill} fill
 * @returns {ListedDay[]}
 */
function listShownDays(fill) {
  if (!quietDay || fill.days.some(({ day }) => day === quietDay)) return fill.days;
  const quiet = { day: quietDay, markup: fill.renderQuietDay(quietDay) };
  return [...fill.days, quiet].sort((first, second) => (first.day < second.day ? -1 : 1));
}

/** @param {ListedDay} listed */
const renderListedDay = ({ day, markup }) =>
  html`<div class="listed-day" data-day="${day}">${markup}</div>`;

/**
 * @param {DayStripFill} fill
 * @param {ListedDay[]} days
 */
const renderView = (fill, days) =>
  html`<div class="day-bar">${renderBar(fill)}</div>
    <div class="day-list">${days.map(renderListedDay)}</div>`;

/** @param {string} day */
const findListedDay = (day) =>
  /** @type {HTMLElement | null} */ (findList()?.querySelector(`[data-day="${day}"]`) ?? null);

/** @param {string} day */
const findCell = (day) =>
  /** @type {HTMLElement | null} */ (findStrip()?.querySelector(`[data-day="${day}"]`) ?? null);

/** @param {ScrollBehavior} behavior */
function centerChosenCell(behavior) {
  const strip = findStrip();
  const cell = chosenDay && findCell(chosenDay);
  if (!strip || !cell) return;
  const left = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2;
  strip.scrollTo({ left, behavior });
}

/** @param {string} day */
function showMonth(day) {
  const month = view?.querySelector(".strip-month");
  const name = renderMonth(day);
  if (month && month.textContent !== name) month.textContent = name;
}

/**
 * @param {string} day
 * @param {ScrollBehavior} behavior
 */
function chooseDay(day, behavior) {
  if (day === chosenDay) return;
  if (chosenDay) findCell(chosenDay)?.classList.remove("is-chosen");
  chosenDay = day;
  findCell(day)?.classList.add("is-chosen");
  showMonth(day);
  centerChosenCell(behavior);
}

/** The strip's day under the middle of its width. */
function findMiddleCell() {
  const strip = findStrip();
  const cells = /** @type {HTMLElement[]} */ ([...(strip?.children ?? [])]);
  if (!strip || !cells.length) return null;
  const middle = strip.scrollLeft + strip.clientWidth / 2;
  let low = 0;
  let high = cells.length - 1;
  while (low < high) {
    const index = Math.ceil((low + high) / 2);
    if (cells[index].offsetLeft <= middle) low = index;
    else high = index - 1;
  }
  return cells[low].dataset.day ?? null;
}

let isStripFramePending = false;
function followStrip() {
  if (isStripFramePending || !isStripSwiped) return;
  isStripFramePending = true;
  requestAnimationFrame(() => {
    isStripFramePending = false;
    const middle = isStripSwiped && findMiddleCell();
    if (middle) showMonth(middle);
  });
}

/** The day at the top of the list: the last whose top has reached it. */
function findTopDay() {
  const list = findList();
  const listed = /** @type {HTMLElement[]} */ ([...(list?.children ?? [])]);
  if (!list || !listed.length) return null;
  const line = list.scrollTop + readDayGap(list) + TOP_REACH_PX;
  let low = 0;
  let high = listed.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (listed[middle].offsetTop <= line) low = middle;
    else high = middle - 1;
  }
  return listed[low].dataset.day ?? null;
}

const isReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** @returns {ScrollBehavior} */
const chooseMotion = () => (isReducedMotion() ? "instant" : "smooth");

// The list keeps the gap between its days above its first, which is the gap a day brought to the
// top keeps under the bar.
/** @param {HTMLElement} list */
const readDayGap = (list) => Number.parseFloat(getComputedStyle(list).paddingTop) || 0;

/**
 * Where the list stands with `day` a day's gap under its top, or as near as its ends let it.
 * @param {string} day
 */
function findDayTop(day) {
  const list = findList();
  const listed = findListedDay(day);
  if (!list || !listed) return null;
  const top = listed.offsetTop - readDayGap(list);
  return Math.max(0, Math.min(top, list.scrollHeight - list.clientHeight));
}

/**
 * @param {string} day
 * @param {"instant" | "flown"} motion
 */
function showDay(day, motion) {
  const list = findList();
  const top = findDayTop(day);
  if (!list || top === null) return;
  held = { day, hasArrived: false };
  const isFar = Math.abs(top - list.scrollTop) > FLOWN_SCREENS * list.clientHeight;
  if (motion === "instant" || isFar) list.scrollTo({ top, behavior: "instant" });
  else scrollWithSpring(list, top);
  chooseDay(day, motion === "instant" ? "instant" : chooseMotion());
}

// The day's place is read again each time, since the list's end can move as its days draw.
function isStillHeld() {
  const list = findList();
  const top = held && findDayTop(held.day);
  if (!held || !list || top === null) return false;
  const isAtTarget = Math.abs(list.scrollTop - top) < 2;
  if (isAtTarget) held.hasArrived = true;
  else if (held.hasArrived) held = null;
  return !!held;
}

// The bar ends in a line once a day has scrolled under it.
function markStuck() {
  findBar()?.classList.toggle("stuck", (findList()?.scrollTop ?? 0) > 0);
}

let isFramePending = false;
function followList() {
  if (isFramePending) return;
  isFramePending = true;
  requestAnimationFrame(() => {
    isFramePending = false;
    markStuck();
    const top = findTopDay();
    if (top && !isStillHeld()) chooseDay(top, chooseMotion());
    if (isStripSwiped && chosenDay) showMonth(chosenDay);
    isStripSwiped = false;
    noteAnchor();
    dropQuietDayOutOfSight();
  });
}

const isListShown = () => (findList()?.clientHeight ?? 0) > 0;

function noteAnchor() {
  const list = findList();
  const listed = chosenDay && findListedDay(chosenDay);
  if (list && listed && isListShown())
    anchor = { day: /** @type {string} */ (chosenDay), offset: listed.offsetTop - list.scrollTop };
}

function takeBackAnchor() {
  const list = findList();
  const listed = anchor && findListedDay(anchor.day);
  if (list && listed && anchor) list.scrollTop = listed.offsetTop - anchor.offset;
}

// Where the list stands at the start day, which a page that loads again after two minutes away
// opens on (show-last-drawn.js).
function noteStartTop() {
  const list = findList();
  const top = shown && findDayTop(shown.startDay);
  if (list && typeof top === "number") list.dataset.startTop = String(top);
}

/**
 * Brings the start day to the top, as Today does.
 * @param {"instant" | "flown"} [motion]
 */
export function showStartDay(motion = "flown") {
  if (shown?.days.length) showDay(shown.startDay, motion);
}

/** Has the next fill open the list on its start day, as for another season. */
export function startOverDayStrip() {
  isPlaced = false;
  chosenDay = null;
  held = null;
  anchor = null;
  quietDay = null;
  isStripSwiped = false;
}

/**
 * @param {ListedDay[]} days
 * @returns {boolean} whether the list draws these days already, in the same order
 */
function hasSameDays(days) {
  const drawn = [...drawnDays.keys()];
  return (
    !!findList() &&
    drawn.length === days.length &&
    drawn.every((day, index) => days[index].day === day)
  );
}

// Only the days whose games changed are drawn again, so a live game's update doesn't redraw the
// season.
/** @param {ListedDay[]} days */
function redrawChangedDays(days) {
  for (const listed of days) {
    const markup = String(listed.markup);
    if (drawnDays.get(listed.day) === markup) continue;
    const element = findListedDay(listed.day);
    if (element) setHtml(element, listed.markup);
    drawnDays.set(listed.day, markup);
  }
}

/** @param {DayStripFill} fill */
function drawFill(fill) {
  const bar = findBar();
  const days = listShownDays(fill);
  if (hasSameDays(days) && bar) {
    setHtml(bar, renderBar(fill));
    redrawChangedDays(days);
    return;
  }
  setHtml(/** @type {HTMLElement} */ (view), renderView(fill, days));
  drawnDays.clear();
  for (const listed of days) drawnDays.set(listed.day, String(listed.markup));
}

// The list draws its days again with or without a date without games, keeping its top day where
// it is.
function redrawKeepingTopDay() {
  if (!shown) return;
  noteAnchor();
  drawFill(shown);
  takeBackAnchor();
}

/** @param {string} day */
function openQuietDay(day) {
  if (quietDay === day) return;
  quietDay = day;
  redrawKeepingTopDay();
}

const isQuietDayOutOfSight = (/** @type {HTMLElement} */ list, /** @type {HTMLElement} */ row) =>
  row.offsetTop + row.offsetHeight <= list.scrollTop ||
  row.offsetTop >= list.scrollTop + list.clientHeight;

// The No games row a tap brought in leaves once it's out of sight, without moving the list.
function dropQuietDayOutOfSight() {
  const list = findList();
  const row = quietDay && findListedDay(quietDay);
  if (!list || !row || held?.day === quietDay || !isQuietDayOutOfSight(list, row)) return;
  quietDay = null;
  redrawKeepingTopDay();
}

// A list that isn't showing, as on another tab, has no place to keep, so it's placed once it
// shows: on its start day the first time, unless the page put it back where it was as it loaded
// again (show-last-drawn.js), and after that on the day it last had at its top.
/** @param {number | null} putBackTop where the page put the list back as it loaded, if it did */
function placeList(putBackTop) {
  const list = findList();
  if (!shown || !list || !isListShown()) return;
  if (isPlaced) takeBackAnchor();
  else if (putBackTop === null) showDay(shown.startDay, "instant");
  else list.scrollTop = putBackTop;
  isPlaced = true;
  noteStartTop();
  markStuck();
  const top = findTopDay();
  if (top && !isStillHeld()) chooseDay(top, "instant");
  noteAnchor();
}

/**
 * Draws the season's days, keeping the day at the top of the list where it is.
 * @param {DayStripFill} fill
 */
export function fillDayStrip(fill) {
  if (!view) return;
  if (!fill.days.length) {
    setHtml(view, html`<p class="empty-note">${fill.emptyNote}</p>`);
    shown = fill;
    return;
  }
  const putBack = !shown && isListShown() ? findList() : null;
  const putBackTop = putBack ? Number(putBack.dataset.putBackTop ?? putBack.scrollTop) : null;
  if (isListShown()) noteAnchor();
  drawFill(fill);
  shown = fill;
  placeList(putBackTop);
}

// A finger or wheel on the list takes it over, even on its way to a day, and one on the strip has
// the month follow it.
/** @param {Event} event */
function noteTouch(event) {
  const target = /** @type {Node} */ (event.target);
  if (findList()?.contains(target)) held = null;
  if (findStrip()?.contains(target)) isStripSwiped = true;
}

function isOnStartDay() {
  const list = findList();
  const top = shown && findDayTop(shown.startDay);
  return (
    !!list &&
    !!shown &&
    chosenDay === shown.startDay &&
    typeof top === "number" &&
    Math.abs(list.scrollTop - top) < 2
  );
}

// A tap on Today where the list already is has nowhere to go, so the date says it's there.
function pulseStartDay() {
  const cell = shown && findCell(shown.startDay);
  if (!cell || isReducedMotion()) return;
  cell.animate(
    [
      { transform: "scale(1)" },
      { transform: `scale(${PULSE_SCALE})`, offset: 0.4 },
      { transform: "scale(1)" },
    ],
    { duration: PULSE_MS, easing: "ease-out" },
  );
}

/** @param {Event} event */
function openTappedDay(event) {
  const target = /** @type {Element} */ (event.target);
  if (target.closest(".go-today")) {
    if (isOnStartDay()) pulseStartDay();
    else showStartDay();
    return;
  }
  const cell = /** @type {HTMLElement | null} */ (target.closest(".day-cell"));
  const day = cell?.dataset.day;
  if (!cell || !day) return;
  if (cell.classList.contains("is-quiet")) openQuietDay(day);
  showDay(day, "flown");
}

// Safari loses a scroll made as the page comes back, before it draws again, so the list moves in
// the first frame it draws.
/** @param {number} awayMs */
function showStartAfterLongAway(awayMs) {
  if (isAwayLong(awayMs)) requestAnimationFrame(() => showStartDay("instant"));
}

/**
 * Wires the view in `element`, which `fillDayStrip` fills.
 * @param {HTMLElement} element
 */
export function startDayStrip(element) {
  view = element;
  element.addEventListener("click", openTappedDay);
  element.addEventListener(
    "scroll",
    (event) => {
      if (event.target === findList()) followList();
      else if (event.target === findStrip()) followStrip();
    },
    { capture: true, passive: true },
  );
  for (const type of ["touchstart", "wheel"])
    element.addEventListener(type, noteTouch, { capture: true, passive: true });
  watchTimeAway(showStartAfterLongAway);
  let wasShown = false;
  new ResizeObserver(() => {
    const isShown = isListShown();
    if (isShown && !wasShown) placeList(null);
    wasShown = isShown;
  }).observe(element);
}
