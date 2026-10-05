// Picking the stories each topic's card shows, from the ones this device reads. The lead is the
// news itself, as plain as it comes, and the second adds the most to it: another kind of story, a
// deeper one, a named writer, another outlet.

const LEAD_ORDER = ["report", "game", "analysis", "feature", "column", "preview"];
const DEPTH = { analysis: 2, feature: 2, game: 1, column: 1, report: 0, preview: -2 };
// A card's teams are its lead's, since a second story about the same news can range wider.
const MAX_CARD_TEAMS = 2;
const PAYWALLED_SOURCE = "athletic";

/**
 * A story as `news/topics` keeps it.
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
 * @property {string} kind
 * @property {string[]} teams
 */

/**
 * @typedef {object} NewsTopic
 * @property {string} id
 * @property {NewsStory[]} stories
 */

/**
 * Which of the optional outlets a device reads: a team's own beat writers, and the paywalled one.
 * @typedef {{ teamOutlets: boolean, paywalled: boolean }} NewsChoices
 */

// Stored text is never trusted as a link, so only a web address is.
/** @param {string} url */
export const isWebAddress = (url) => /^https?:\/\//i.test(url ?? "");

/**
 * @param {NewsStory} story
 * @param {NewsChoices} choices
 */
const isReadStory = (story, choices) =>
  isWebAddress(story.url) &&
  (choices.paywalled || story.source !== PAYWALLED_SOURCE) &&
  (choices.teamOutlets || !story.teamFeed);

/** @param {NewsStory} story */
const readLeadRank = (story) => {
  const rank = LEAD_ORDER.indexOf(story.kind);
  return rank === -1 ? LEAD_ORDER.length : rank;
};

/**
 * @param {NewsStory} first
 * @param {NewsStory} second
 */
const compareLeads = (first, second) =>
  readLeadRank(first) - readLeadRank(second) ||
  Number(Boolean(second.photo)) - Number(Boolean(first.photo)) ||
  Date.parse(first.publishedAt) - Date.parse(second.publishedAt);

/**
 * @param {NewsStory} lead
 * @param {NewsStory} story
 */
const scoreCompanion = (lead, story) =>
  (story.kind !== lead.kind ? 4 : 0) +
  (DEPTH[story.kind] ?? 0) +
  (story.author ? 1 : 0) +
  (story.source !== lead.source ? 1 : 0);

/**
 * The lead, then the story that adds the most to it, when there's another.
 * @param {NewsStory[]} stories
 */
function pickShownStories(stories) {
  const [lead, ...others] = stories.toSorted(compareLeads);
  const companion = others.reduce(
    (best, story) =>
      !best || scoreCompanion(lead, story) > scoreCompanion(lead, best) ? story : best,
    /** @type {NewsStory | null} */ (null),
  );
  return companion ? [lead, companion] : [lead];
}

/** @param {NewsStory[]} stories */
const findLatest = (stories) => Math.max(...stories.map((story) => Date.parse(story.publishedAt)));

/**
 * @param {NewsTopic} topic
 * @param {NewsChoices} choices
 */
function buildNewsCard(topic, choices) {
  const read = topic.stories.filter((story) => isReadStory(story, choices));
  if (!read.length) return null;
  const stories = pickShownStories(read);
  return {
    id: topic.id,
    teams: stories[0].teams.slice(0, MAX_CARD_TEAMS),
    stories,
    latestAt: findLatest(read),
  };
}

/**
 * Each topic's card with a story this device reads, newest first: its teams and the stories it
 * shows.
 * @param {NewsTopic[]} topics
 * @param {NewsChoices} choices
 */
export const buildNewsCards = (topics, choices) =>
  topics
    .map((topic) => buildNewsCard(topic, choices))
    .filter((card) => card !== null)
    .sort((first, second) => second.latestAt - first.latestAt);
