import { fetchUpstream } from "../../../../shared/worker/upstream.js";
import { parseAtom, parseEspnNews, parseRss } from "./news-parse.js";
import { ESPN_HEADERS } from "./wnba.js";

// The outlets the news reads. A team's own feed marks its stories with the team, so a page can
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
 * @property {string} [pathIncludes] what a link must have to be about the WNBA, in a feed that
 *   covers more
 */

/** @type {NewsFeed[]} */
export const NEWS_FEEDS = [
  {
    id: "espn",
    source: "espn",
    outlet: "ESPN",
    url: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/news?limit=50",
    parse: (text) => parseEspnNews(JSON.parse(text)),
  },
  {
    id: "athletic",
    source: "athletic",
    outlet: "The Athletic",
    url: "https://www.nytimes.com/athletic/rss/wnba/",
    parse: parseRss,
  },
  {
    id: "ix",
    source: "ix",
    outlet: "The IX",
    url: "https://www.theixsports.com/category/wnba/feed/",
    parse: parseRss,
  },
  {
    id: "ix-liberty",
    source: "ix",
    outlet: "The IX",
    url: "https://www.theixsports.com/category/new-york-liberty/feed/",
    parse: parseRss,
    team: "NYL",
  },
  {
    id: "winsidr",
    source: "winsidr",
    outlet: "Winsidr",
    url: "https://winsidr.com/feed/",
    parse: parseRss,
  },
  {
    id: "nypost",
    source: "nypost",
    outlet: "NY Post",
    url: "https://nypost.com/tag/new-york-liberty/feed/",
    parse: parseRss,
    team: "NYL",
  },
  {
    id: "netsdaily",
    source: "netsdaily",
    outlet: "NetsDaily",
    url: "https://www.netsdaily.com/rss/index.xml",
    parse: parseAtom,
    team: "NYL",
    pathIncludes: "/nyliberty/",
  },
];

const NEWS_HEADERS = {
  accept: "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.8",
  "user-agent": ESPN_HEADERS["user-agent"],
};

// The outlets' own caches answer within minutes of a new story, so a minute at the edge is plenty.
const CACHE_SECONDS = 60;

/**
 * A story as a feed gives it, with the outlet it's from.
 * @typedef {import("./news-parse.js").FeedEntry & { source: string, outlet: string, teamFeed?: string }} NewsEntry
 */

/**
 * @param {typeof fetch} fetchImpl
 * @param {NewsFeed} feed
 * @returns {Promise<NewsEntry[]>}
 */
async function readFeed(fetchImpl, feed) {
  const response = await fetchUpstream(fetchImpl, feed.url, {
    headers: NEWS_HEADERS,
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
 * @param {NewsFeed[]} [feeds]
 */
export async function readNewsFeeds(fetchImpl, feeds = NEWS_FEEDS) {
  const answers = await Promise.allSettled(feeds.map((feed) => readFeed(fetchImpl, feed)));
  const missing = feeds
    .filter((_, index) => answers[index].status === "rejected")
    .map((feed) => feed.id);
  const entries = answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : []));
  return { entries: mergeCopies(entries), missing };
}
