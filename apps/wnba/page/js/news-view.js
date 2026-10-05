import { formatShortDate, formatShortWeekday, nameDay } from "#shared/days.js";
import { html, joinWithSeparator } from "#shared/html.js";
import { renderClub } from "./clubs.js";
import { buildNewsCards, isWebAddress } from "./news-picks.js";
import { TEAMS } from "./teams.js";

// The News view: each topic's card, newest first, with its lead story and the one that adds the
// most to it. A story shows only its headline, a short summary, and who wrote it; the whole story
// is on its outlet's site, which opens apart from the page and is never told the page's address.

/** @typedef {import("./news-picks.js").NewsStory} NewsStory */
/** @typedef {import("./opened-stories.js").OpenedStories} OpenedStories */

const WEEK_DAYS = 7;

// Phosphor's arrow-up-right, at its Regular weight.
const READ_ARROW = html`<svg class="read-arrow" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/></svg>`;

// Phosphor's check, at its Regular weight.
const READ_CHECK = html`<svg class="read-check" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`;

/**
 * @param {Date} date
 * @param {number} daysAway
 */
const nameEarlierDay = (date, daysAway) =>
  Math.abs(daysAway) < WEEK_DAYS ? formatShortWeekday(date) : formatShortDate(date);

/**
 * "Today", "Yesterday", or the day's short weekday, or its date over a week ago.
 * @param {string} publishedAt
 * @param {number} now
 */
const nameStoryDay = (publishedAt, now) =>
  nameDay(new Date(publishedAt), new Date(now), {
    nearDays: [-1, 0],
    nameOtherDay: nameEarlierDay,
    isCapitalized: true,
  });

/** @param {string} credit */
const describeCredit = (credit) =>
  credit.startsWith("via ") ? `Photo ${credit}` : `Photo: ${credit}`;

/** @param {NewsStory["photo"]} photo */
const findPhotoUrl = (photo) => (photo && isWebAddress(photo.url) ? photo.url : null);

/**
 * @param {NewsStory} story
 * @param {import("#shared/html.js").Markup | string} content
 */
const renderStoryLink = (story, content) =>
  html`<a href="${story.url}" target="_blank" rel="noopener noreferrer">${content}</a>`;

/**
 * The button that opens the story, with a check in place of its arrow once this device has opened
 * it. Its label keeps room for itself at its unread weight, so the button keeps its width.
 * @param {NewsStory} story
 * @param {OpenedStories} opened
 */
function renderReadButton(story, opened) {
  const isOpened = Object.hasOwn(opened, story.url);
  const label = `Read on ${story.outlet}`;
  return html`<div class="news-foot">
    <a
      class="read-button${isOpened ? " opened" : ""}"
      href="${story.url}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${label}: ${story.title}"
      ><span class="read-label" data-label="${label}">${label}</span>${
        isOpened ? READ_CHECK : READ_ARROW
      }</a
    >
  </div>`;
}

/**
 * @param {NewsStory} story
 * @param {number} now
 */
const renderMeta = (story, now) =>
  html`<p class="news-meta">
    ${joinWithSeparator([story.author, story.outlet, nameStoryDay(story.publishedAt, now)].filter(Boolean))}
  </p>`;

/** @param {NewsStory} story */
const renderSummary = (story) =>
  story.summary && html`<p class="news-summary" data-quoted>${story.summary}</p>`;

/** @param {string[]} teams */
function renderTeams(teams) {
  const known = teams.filter((code) => code in TEAMS);
  return (
    known.length > 0 && html`<p class="news-teams">${known.map((code) => renderClub(code))}</p>`
  );
}

/** @param {NewsStory["photo"]} photo */
function renderLeadPhoto(photo) {
  const url = findPhotoUrl(photo);
  return (
    url &&
    html`<img class="news-photo" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
  );
}

/**
 * The lead's teams, with its photo's credit across from them, under the photo.
 * @param {string[]} teams
 * @param {NewsStory["photo"]} photo
 */
function renderCardTop(teams, photo) {
  const credit = findPhotoUrl(photo) && photo?.credit;
  const teamLine = renderTeams(teams);
  if (!credit) return teamLine;
  return html`<div class="news-top">
    ${teamLine}
    <p class="news-photo-credit">${describeCredit(credit)}</p>
  </div>`;
}

/**
 * The second story, under the lead, with its photo small beside it.
 * @param {NewsStory} story
 * @param {number} now
 * @param {OpenedStories} opened
 */
function renderSecondStory(story, now, opened) {
  const photoUrl = findPhotoUrl(story.photo);
  return html`<div class="news-more">
    <p class="news-more-label">More on this</p>
    <div class="news-more-main">
      <div class="news-more-text">
        <h4 class="news-title" data-quoted>${renderStoryLink(story, story.title)}</h4>
        ${renderMeta(story, now)}
        ${photoUrl && story.photo?.credit && html`<p class="news-credit">${describeCredit(story.photo.credit)}</p>`}
        ${renderSummary(story)}
      </div>
      ${photoUrl && html`<img class="news-thumb" src="${photoUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" />`}
    </div>
    ${renderReadButton(story, opened)}
  </div>`;
}

/**
 * @param {ReturnType<typeof buildNewsCards>[number]} card
 * @param {number} now
 * @param {OpenedStories} opened
 */
function renderCard({ teams, stories: [lead, second] }, now, opened) {
  return html`<article class="news-card">
    ${renderLeadPhoto(lead.photo)}
    <div class="news-body">
      ${renderCardTop(teams, lead.photo)}
      <h3 class="news-title" data-quoted>${renderStoryLink(lead, lead.title)}</h3>
      ${renderMeta(lead, now)} ${renderSummary(lead)} ${renderReadButton(lead, opened)}
      ${second && renderSecondStory(second, now, opened)}
    </div>
  </article>`;
}

// How tall each part of a card draws, roughly, in the same unit, so the columns a wide screen shows
// come out about as long as each other.
const CARD_TEXT_HEIGHT = 3.4;
const LEAD_PHOTO_HEIGHT = 5.1;
const SECOND_STORY_HEIGHT = 4.9;

/** @param {ReturnType<typeof buildNewsCards>[number]} card */
const estimateCardHeight = ({ stories: [lead, second] }) =>
  CARD_TEXT_HEIGHT +
  (findPhotoUrl(lead.photo) ? LEAD_PHOTO_HEIGHT : 0) +
  (second ? SECOND_STORY_HEIGHT : 0);

/**
 * The cards in `columnCount` columns, each card in turn going to the shortest, so each column
 * stacks its cards without gaps and the newest still come first.
 * @param {ReturnType<typeof buildNewsCards>} cards
 * @param {number} columnCount
 */
function placeInColumns(cards, columnCount) {
  /** @type {{ height: number, cards: typeof cards }[]} */
  const columns = Array.from({ length: columnCount }, () => ({ height: 0, cards: [] }));
  for (const card of cards) {
    const shortest = columns.reduce((best, column) =>
      column.height < best.height ? column : best,
    );
    shortest.height += estimateCardHeight(card);
    shortest.cards.push(card);
  }
  return columns.map((column) => column.cards);
}

/**
 * The cards for the topics the Worker saved, with only the outlets `choices` reads, in
 * `columnCount` columns, each story this device has opened marked with a check.
 * @param {import("./news-picks.js").NewsTopic[]} topics
 * @param {import("./news-picks.js").NewsChoices} choices
 * @param {number} now
 * @param {{ columnCount?: number, opened?: OpenedStories }} [options]
 */
export function renderNews(topics, choices, now, { columnCount = 1, opened = {} } = {}) {
  const cards = buildNewsCards(topics, choices);
  if (!cards.length) return html`<p class="empty-note">No news yet</p>`;
  return html`<h2 class="section-label">This week</h2>
    <div class="news-cards">
      ${placeInColumns(cards, columnCount).map(
        (column) =>
          html`<ul class="news-column">
            ${column.map((card) => html`<li>${renderCard(card, now, opened)}</li>`)}
          </ul>`,
      )}
    </div>`;
}
