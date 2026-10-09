import { fetchUpstream } from "./upstream.js";

// Reading a league's news outlets. A team's own feed marks its stories with the team, so a page can
// leave out what only that team's fans would want; a story the league's feeds carry too isn't
// marked.

/**
 * @typedef {object} NewsFeed
 * @property {string} id
 * @property {string} source the outlet's key, which a page's settings name
 * @property {string} outlet the outlet as a page names it
 * @property {string} url
 * @property {(text: string) => import("./news-parse.js").FeedEntry[]} parse
 * @property {string} [team] the team whose own feed this is
 * @property {string} [pathIncludes] what a link must have to be about the league, in a feed that
 *   covers more
 */

// The outlets' own caches answer within minutes of a new story, so a minute at the edge is plenty.
const CACHE_SECONDS = 60;

/**
 * A story as a feed gives it, with the outlet it's from.
 * @typedef {import("./news-parse.js").FeedEntry & { source: string, outlet: string, teamFeed?: string }} NewsEntry
 */

/** @param {string} userAgent */
const createHeaders = (userAgent) => ({
  accept: "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.8",
  "user-agent": userAgent,
});

/**
 * @param {typeof fetch} fetchImpl
 * @param {NewsFeed} feed
 * @param {Record<string, string>} headers
 * @returns {Promise<NewsEntry[]>}
 */
async function readFeed(fetchImpl, feed, headers) {
  const response = await fetchUpstream(fetchImpl, feed.url, {
    headers,
    cacheSeconds: CACHE_SECONDS,
  });
  if (!response.ok) throw new Error(`${feed.id} answered ${response.status}`);
  return feed
    .parse(await response.text())
    .filter((entry) => entry.url && entry.title)
    .filter((entry) => !feed.pathIncludes || entry.url.includes(feed.pathIncludes))
    .map((entry) => ({
      ...entry,
      source: feed.source,
      outlet: feed.outlet,
      ...(feed.team && { teamFeed: feed.team }),
    }));
}

/**
 * The first copy of each story, marked with a team only when every feed that carries it is that
 * team's own.
 * @param {NewsEntry[]} entries
 */
function mergeCopies(entries) {
  const byUrl = new Map();
  for (const entry of entries) {
    const first = byUrl.get(entry.url);
    if (!first) byUrl.set(entry.url, entry);
    else if (first.teamFeed !== entry.teamFeed) delete first.teamFeed;
  }
  return [...byUrl.values()];
}

/**
 * Every feed's stories, and the feeds that didn't answer, which leave the rest to stand.
 * @param {typeof fetch} fetchImpl
 * @param {NewsFeed[]} feeds
 * @param {{ userAgent: string }} options
 */
export async function readNewsFeeds(fetchImpl, feeds, { userAgent }) {
  const headers = createHeaders(userAgent);
  const answers = await Promise.allSettled(feeds.map((feed) => readFeed(fetchImpl, feed, headers)));
  const missing = feeds
    .filter((_, index) => answers[index].status === "rejected")
    .map((feed) => feed.id);
  const entries = answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : []));
  return { entries: mergeCopies(entries), missing };
}
