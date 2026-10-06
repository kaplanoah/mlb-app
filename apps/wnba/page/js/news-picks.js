// Picking the stories this device reads: every story the Worker keeps, but the paywalled outlet's
// and a team's own beat writers' when the device leaves them out.

const PAYWALLED_SOURCE = "athletic";

/**
 * A story as `news/stories` keeps it.
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

/**
 * The stories this device reads, newest first.
 * @param {NewsStory[]} stories
 * @param {NewsChoices} choices
 */
export const pickReadStories = (stories, choices) =>
  stories
    .filter((story) => isReadStory(story, choices))
    .toSorted((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt));
