import { formatShortDate, formatShortWeekday, nameDay } from "#shared/days.js";
import { html, joinWithSeparator } from "#shared/html.js";
import { renderClub } from "./clubs.js";
import { buildNewsCards, isWebAddress } from "./news-picks.js";
import { TEAMS } from "./teams.js";

// The News view: each topic's card, newest first, with its lead story and the one that adds the
// most to it. A story shows only its headline, a short summary, and who wrote it; the whole story
// is on its outlet's site, which opens apart from the page and is never told the page's address.

/** @typedef {import("./news-picks.js").NewsStory} NewsStory */

const WEEK_DAYS = 7;

// Phosphor's arrow-up-right, at its Regular weight.
const READ_ARROW = html`<svg class="read-arrow" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/></svg>`;

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

/** @param {NewsStory} story */
const renderReadButton = (story) =>
  html`<div class="news-foot">
    <a
      class="read-button"
      href="${story.url}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Read on ${story.outlet}: ${story.title}"
      >Read on ${story.outlet}${READ_ARROW}</a
    >
  </div>`;

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
  story.summary && html`<p class="news-summary">${story.summary}</p>`;

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
  if (!url) return "";
  return html`<figure class="news-photo">
    <img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
    ${photo?.credit && html`<figcaption>${describeCredit(photo.credit)}</figcaption>`}
  </figure>`;
}

/**
 * The second story, under the lead, with its photo small beside it.
 * @param {NewsStory} story
 * @param {number} now
 */
function renderSecondStory(story, now) {
  const photoUrl = findPhotoUrl(story.photo);
  return html`<div class="news-more">
    <p class="news-more-label">More on this</p>
    <div class="news-more-main">
      <div class="news-more-text">
        <h4 class="news-title">${renderStoryLink(story, story.title)}</h4>
        ${renderMeta(story, now)}
        ${photoUrl && story.photo?.credit && html`<p class="news-credit">${describeCredit(story.photo.credit)}</p>`}
        ${renderSummary(story)}
      </div>
      ${photoUrl && html`<img class="news-thumb" src="${photoUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" />`}
    </div>
    ${renderReadButton(story)}
  </div>`;
}

/**
 * @param {ReturnType<typeof buildNewsCards>[number]} card
 * @param {number} now
 */
function renderCard({ teams, stories: [lead, second] }, now) {
  return html`<article class="news-card">
    ${renderLeadPhoto(lead.photo)}
    <div class="news-body">
      ${renderTeams(teams)}
      <h3 class="news-title">${renderStoryLink(lead, lead.title)}</h3>
      ${renderMeta(lead, now)} ${renderSummary(lead)} ${renderReadButton(lead)}
      ${second && renderSecondStory(second, now)}
    </div>
  </article>`;
}

/**
 * The cards for the topics the Worker saved, with only the outlets `choices` reads.
 * @param {import("./news-picks.js").NewsTopic[]} topics
 * @param {import("./news-picks.js").NewsChoices} choices
 * @param {number} now
 */
export function renderNews(topics, choices, now) {
  const cards = buildNewsCards(topics, choices);
  if (!cards.length) return html`<p class="empty-note">No news yet</p>`;
  return html`<h2 class="section-label">This week</h2>
    <ul class="news-cards">
      ${cards.map((card) => html`<li>${renderCard(card, now)}</li>`)}
    </ul>`;
}
