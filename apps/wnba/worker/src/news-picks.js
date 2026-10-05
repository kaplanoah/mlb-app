// Picking the two stories each topic's card shows. The lead is the news itself, as plain as it
// comes, and the second adds the most to it: another kind of story, a deeper one, a named writer,
// another outlet.

const LEAD_ORDER = ["report", "game", "analysis", "feature", "column", "preview"];
const DEPTH = { analysis: 2, feature: 2, game: 1, column: 1, report: 0, preview: -2 };
const SHOWN_PER_TOPIC = 2;

/**
 * @typedef {object} PickedStory
 * @property {string} id
 * @property {string} kind
 * @property {string} source
 * @property {string} author
 * @property {string} publishedAt
 * @property {{ url: string } | null} photo
 * @property {string[]} teams
 */

const readLeadRank = (story) => {
  const rank = LEAD_ORDER.indexOf(story.kind);
  return rank === -1 ? LEAD_ORDER.length : rank;
};

/**
 * @param {PickedStory} first
 * @param {PickedStory} second
 */
const compareLeads = (first, second) =>
  readLeadRank(first) - readLeadRank(second) ||
  Number(Boolean(second.photo)) - Number(Boolean(first.photo)) ||
  Date.parse(first.publishedAt) - Date.parse(second.publishedAt);

/**
 * @param {PickedStory} lead
 * @param {PickedStory} story
 */
const scoreCompanion = (lead, story) =>
  (story.kind !== lead.kind ? 4 : 0) +
  (DEPTH[story.kind] ?? 0) +
  (story.author ? 1 : 0) +
  (story.source !== lead.source ? 1 : 0);

/**
 * The lead, then the story that adds the most to it, when there's another.
 * @template {PickedStory} Story
 * @param {Story[]} stories
 * @returns {Story[]}
 */
function pickShownStories(stories) {
  const [lead, ...others] = [...stories].sort(compareLeads);
  const companion = others.reduce(
    (best, story) =>
      !best || scoreCompanion(lead, story) > scoreCompanion(lead, best) ? story : best,
    null,
  );
  return companion ? [lead, companion] : [lead];
}

// A card's dots are its lead's teams, since a second story about the same news can range wider.
const MAX_CARD_TEAMS = 2;

const findLatest = (stories) => Math.max(...stories.map((story) => Date.parse(story.publishedAt)));

/**
 * Each topic's card, newest first: its teams, the stories it shows, and how many it leaves out.
 * @template {PickedStory & { topic: string }} Story
 * @param {Story[]} stories
 */
export function buildTopicCards(stories) {
  const byTopic = new Map();
  for (const story of stories)
    byTopic.set(story.topic, [...(byTopic.get(story.topic) ?? []), story]);
  return [...byTopic]
    .map(([id, topicStories]) => {
      const shown = pickShownStories(topicStories);
      return {
        id,
        teams: shown[0].teams.slice(0, MAX_CARD_TEAMS),
        stories: shown,
        more: topicStories.length - Math.min(topicStories.length, SHOWN_PER_TOPIC),
        latestAt: new Date(findLatest(topicStories)).toISOString(),
      };
    })
    .sort((first, second) => Date.parse(second.latestAt) - Date.parse(first.latestAt));
}
