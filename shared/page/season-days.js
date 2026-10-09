import {
  chooseListedDay,
  countDaysBetween,
  formatShortMonth,
  formatShortWeekday,
  formatWeekday,
  nameDay,
  readCalendarDate,
} from "./days.js";
import { html } from "./html.js";

// A season's game days as the day strip lists them (day-strip.js), each beside its date as a wall
// calendar shows it. A league hands over each game day's games, already drawn, and which day is
// its today.

/** @typedef {import("./html.js").Markup} Markup */

const NEAR_DAY_ABBREVIATIONS = new Map([
  [-1, "Yest"],
  [1, "Tmrw"],
]);

/**
 * A day's name beside its date, which doesn't need "Today": the Games list it heads already says so.
 * @param {Date} day
 * @param {Date} today
 */
const nameListDay = (day, today) =>
  nameDay(day, today, { nearDays: [-1, 1], nameOtherDay: formatWeekday, isCapitalized: true });

/**
 * nameListDay's short form, for the narrow column beside a day's games.
 * @param {Date} day
 * @param {Date} today
 */
const abbreviateDay = (day, today) =>
  NEAR_DAY_ABBREVIATIONS.get(countDaysBetween(today, day)) ?? formatShortWeekday(day);

/**
 * @param {string} day "YYYY-MM-DD"
 * @param {string} today "YYYY-MM-DD"
 */
function renderDayLabel(day, today) {
  const date = readCalendarDate(day);
  const todayDate = readCalendarDate(today);
  const month = formatShortMonth(date);
  return html`<h3 class="day-label" aria-label="${nameListDay(date, todayDate)}, ${month} ${date.getDate()}">
    <span class="day-month">${month}</span
    ><span class="day-number tabular">${date.getDate()}</span
    ><span class="day-name">${abbreviateDay(date, todayDate)}</span>
  </h3>`;
}

/**
 * A day's games in a box of their own, beside its date, with how many it holds, so the box takes
 * its height before it's drawn.
 * @param {{ day: string, count: number, games: Markup }} gameDay
 * @param {string} today
 */
const renderGameDay = ({ day, count, games }, today) =>
  html`<section class="game-day${day === today ? " is-today" : ""}" style="--games: ${count}">
    ${renderDayLabel(day, today)} ${games}
  </section>`;

/** @param {string} today */
const renderNoGamesToday = (today) =>
  html`<section class="game-day no-games is-today">
    ${renderDayLabel(today, today)}
    <p class="empty-note">No games today</p>
  </section>`;

/**
 * A date without games, which a tap on it in the strip brings into the list.
 * @param {string} day
 * @param {string} today
 */
const renderQuietDay = (day, today) =>
  html`<section class="game-day no-games quiet-day">
    ${renderDayLabel(day, today)}
    <p class="empty-note">No games</p>
  </section>`;

/**
 * Each game day of the season as the day strip lists it, from its first to its last, with a day
 * saying there are no games today when today falls between them, and the day the list opens on:
 * today, or `openDay` when a game still under way began before it.
 * @param {object} options
 * @param {{ day: string, count: number, games: Markup }[]} options.gameDays in order
 * @param {string} options.today
 * @param {string | null} [options.openDay]
 * @param {string} options.emptyNote
 * @returns {import("./day-strip.js").DayStripFill}
 */
export function listSeasonDays({ gameDays, today, openDay = null, emptyNote }) {
  const days = gameDays.map((gameDay) => ({
    day: gameDay.day,
    markup: renderGameDay(gameDay, today),
  }));
  const isTodayInSeason = !!days.length && days[0].day < today && today < days.at(-1).day;
  if (isTodayInSeason && !days.some(({ day }) => day === today)) {
    const after = days.findIndex(({ day }) => day > today);
    days.splice(after, 0, { day: today, markup: renderNoGamesToday(today) });
  }
  const startDay = chooseListedDay(days, openDay && openDay < today ? openDay : today);
  return {
    days,
    today,
    startDay,
    emptyNote,
    renderQuietDay: (day) => renderQuietDay(day, today),
  };
}
