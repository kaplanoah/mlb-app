import { formatShortDate, formatShortWeekday, nameDay } from "#shared/days.js";
import { html, joinWithSeparator } from "#shared/html.js";
import { renderClub } from "./clubs.js";
import { isWebAddress, pickReadCards } from "./news-picks.js";
import { TEAMS } from "./teams.js";

// The News view: a card for each piece of news, newest first, led by the story that tells it best,
// with the others that add to it in a quiet list under it. A story shows only its headline, a short
// summary, and who wrote it; the whole story is on its outlet's site, which opens apart from the
// page and is never told the page's address.

/** @typedef {import("./news-picks.js").NewsStory} NewsStory */
/** @typedef {import("./news-picks.js").NewsCard} NewsCard */
/** @typedef {import("./opened-stories.js").OpenedStories} OpenedStories */

const WEEK_DAYS = 7;
// A story can be about more teams than a card has room to name.
const MAX_CARD_TEAMS = 2;

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

/**
 * The credit, in parts that wrap apart before either wraps inside: who took the photo, then the
 * agency it came through.
 * @param {string} credit
 */
function renderCredit(credit) {
  const described = describeCredit(credit);
  const viaAt = described.indexOf(" via ");
  if (viaAt < 0) return described;
  return html`<span class="credit-part">${described.slice(0, viaAt)}</span>
    <span class="credit-part">${described.slice(viaAt + 1)}</span>`;
}

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
function renderPhoto(photo) {
  const url = findPhotoUrl(photo);
  return (
    url &&
    html`<img class="news-photo" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
  );
}

/**
 * The story's teams, with its photo's credit across from them, under the photo.
 * @param {string[]} teams
 * @param {NewsStory["photo"]} photo
 */
function renderCardTop(teams, photo) {
  const credit = findPhotoUrl(photo) && photo?.credit;
  const teamLine = renderTeams(teams);
  if (!credit) return teamLine;
  return html`<div class="news-top">
    ${teamLine}
    <p class="news-photo-credit">${renderCredit(credit)}</p>
  </div>`;
}

/**
 * A story under the lead, in a line or two: its headline, then its outlet and day.
 * @param {NewsStory} story
 * @param {number} now
 */
const renderMoreStory = (story, now) =>
  html`<li>
    <p class="news-more-title" data-quoted>${renderStoryLink(story, story.title)}</p>
    <p class="news-meta">${joinWithSeparator([story.outlet, nameStoryDay(story.publishedAt, now)])}</p>
  </li>`;

/**
 * @param {NewsStory[]} more
 * @param {number} now
 */
const renderMore = (more, now) =>
  more.length > 0 &&
  html`<div class="news-more">
    <p class="news-more-label">More on this</p>
    <ul class="news-more-list">
      ${more.map((story) => renderMoreStory(story, now))}
    </ul>
  </div>`;

/**
 * @param {NewsCard} card
 * @param {number} now
 * @param {OpenedStories} opened
 */
function renderCard({ lead, more }, now, opened) {
  return html`<article class="news-card">
    ${renderPhoto(lead.photo)}
    <div class="news-body">
      ${renderCardTop(lead.teams.slice(0, MAX_CARD_TEAMS), lead.photo)}
      <h3 class="news-title" data-quoted>${renderStoryLink(lead, lead.title)}</h3>
      ${renderMeta(lead, now)} ${renderSummary(lead)} ${renderReadButton(lead, opened)}
      ${renderMore(more, now)}
    </div>
  </article>`;
}

// How tall each part of a card draws, roughly, in the same unit, so the columns a wide screen shows
// come out about as long as each other.
const CARD_TEXT_HEIGHT = 3.4;
const PHOTO_HEIGHT = 5.1;
const MORE_LABEL_HEIGHT = 0.8;
const MORE_STORY_HEIGHT = 1.3;

/** @param {NewsCard} card */
const estimateCardHeight = ({ lead, more }) =>
  CARD_TEXT_HEIGHT +
  (findPhotoUrl(lead.photo) ? PHOTO_HEIGHT : 0) +
  (more.length > 0 ? MORE_LABEL_HEIGHT + more.length * MORE_STORY_HEIGHT : 0);

/**
 * The cards in `columnCount` columns, each card in turn going to the shortest, so each column
 * stacks its cards without gaps and the newest still come first.
 * @param {NewsCard[]} cards
 * @param {number} columnCount
 */
function placeInColumns(cards, columnCount) {
  /** @type {{ height: number, cards: NewsCard[] }[]} */
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
 * The cards the Worker saved, with only the outlets `choices` reads, in `columnCount` columns, each
 * lead this device has opened marked with a check.
 * @param {NewsCard[]} cards
 * @param {import("./news-picks.js").NewsChoices} choices
 * @param {number} now
 * @param {{ columnCount?: number, opened?: OpenedStories }} [options]
 */
export function renderNews(cards, choices, now, { columnCount = 1, opened = {} } = {}) {
  const read = pickReadCards(cards, choices);
  if (!read.length) return html`<p class="empty-note">No news yet</p>`;
  return html`<div class="news-cards">
      ${placeInColumns(read, columnCount).map(
        (column) =>
          html`<ul class="news-column">
            ${column.map(
              (card) => html`<li data-key="${card.lead.id}">${renderCard(card, now, opened)}</li>`,
            )}
          </ul>`,
      )}
    </div>`;
}
