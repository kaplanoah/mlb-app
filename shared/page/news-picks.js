// Picking the stories this device reads from each card: every story the Worker keeps, but the
// paywalled outlets' and a team's own beat writers' when the device leaves them out. When it leaves
// out a card's lead, the first story under it that it reads leads in its place.

const MAX_MORE = 3;

/**
 * A story as `news/cards` keeps it.
 * @typedef {object} NewsStory
 * @property {string} id
 * @property {string} url
 * @property {string} title
 * @property {string} summary
 * @property {string} author
 * @property {string} outlet
 * @property {string} source
 * @property {string} [teamFeed] the team whose own outlets alone carry it
 * @property {string} publishedAt
 * @property {{ url: string, credit: string } | null} photo
 * @property {string[]} teams
 */

/**
 * The story that tells a piece of news best, and the others that add to it.
 * @typedef {{ lead: NewsStory, more: NewsStory[] }} NewsCard
 */

/**
 * Which of the optional outlets a device reads: a team's own beat writers, and the paywalled ones.
 * @typedef {{ teamOutlets: boolean, paywalled: boolean }} NewsChoices
 */

// Stored text is never trusted as a link, so only a web address is.
/** @param {string} url */
export const isWebAddress = (url) => /^https?:\/\//i.test(url ?? "");

/**
 * @param {NewsStory} story
 * @param {NewsChoices} choices
 * @param {string[]} paywalledSources
 */
const isReadStory = (story, choices, paywalledSources) =>
  isWebAddress(story.url) &&
  (choices.paywalled || !paywalledSources.includes(story.source)) &&
  (choices.teamOutlets || !story.teamFeed);

/**
 * @param {NewsCard} card
 * @param {NewsChoices} choices
 * @param {string[]} paywalledSources
 * @returns {NewsCard | null}
 */
function pickReadCard(card, choices, paywalledSources) {
  const [lead, ...more] = [card.lead, ...card.more].filter((story) =>
    isReadStory(story, choices, paywalledSources),
  );
  return lead ? { lead, more: more.slice(0, MAX_MORE) } : null;
}

/**
 * The cards with a story this device reads, newest lead first.
 * @param {NewsCard[]} cards
 * @param {NewsChoices} choices
 * @param {string[]} paywalledSources the outlets whose stories mostly need a subscription
 */
export const pickReadCards = (cards, choices, paywalledSources) =>
  cards
    .map((card) => pickReadCard(card, choices, paywalledSources))
    .filter((card) => card !== null)
    .sort(
      (first, second) => Date.parse(second.lead.publishedAt) - Date.parse(first.lead.publishedAt),
    );
