import { readNewsFeeds } from "../../../../shared/worker/news-feeds.js";
import {
  parseAtom,
  parseEspnNews,
  parseNewsSitemap,
  parseRss,
} from "../../../../shared/worker/news-parse.js";

// The outlets MLB's news reads, the Mets' own beat writers among them.

// Some outlets turn away a caller that doesn't read as a browser.
const NEWS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** @type {import("../../../../shared/worker/news-feeds.js").NewsFeed[]} */
export const NEWS_FEEDS = [
  {
    id: "espn",
    source: "espn",
    outlet: "ESPN",
    url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?limit=50",
    parse: (text) => parseEspnNews(JSON.parse(text)),
  },
  {
    id: "athletic",
    source: "athletic",
    outlet: "The Athletic",
    url: "https://www.nytimes.com/athletic/rss/mlb/",
    parse: parseRss,
  },
  {
    id: "mlbtr",
    source: "mlbtr",
    outlet: "MLB Trade Rumors",
    url: "https://www.mlbtraderumors.com/feed",
    parse: parseRss,
  },
  {
    id: "bbprospectus",
    source: "bbprospectus",
    outlet: "Baseball Prospectus",
    url: "https://www.baseballprospectus.com/feed/",
    parse: parseRss,
  },
  {
    id: "posnanski",
    source: "posnanski",
    outlet: "Joe Posnanski",
    url: "https://www.joeposnanski.com/feed",
    parse: parseRss,
  },
  {
    id: "nypost-mets",
    source: "nypost",
    outlet: "NY Post",
    url: "https://nypost.com/tag/new-york-mets/feed/",
    parse: parseRss,
    team: "NYM",
  },
  {
    id: "athletic-mets",
    source: "athletic",
    outlet: "The Athletic",
    url: "https://www.nytimes.com/athletic/rss/mlb/mets/",
    parse: parseRss,
    team: "NYM",
  },
  {
    id: "mlbcom-mets",
    source: "mlbcom",
    outlet: "MLB.com",
    url: "https://www.mlb.com/mets/feeds/news/rss.xml",
    parse: parseRss,
    team: "NYM",
  },
  {
    id: "sny-mets",
    source: "sny",
    outlet: "SNY",
    url: "https://sny.tv/feed?team=mets",
    parse: parseNewsSitemap,
    team: "NYM",
  },
  {
    id: "dailynews-mets",
    source: "dailynews",
    outlet: "NY Daily News",
    url: "https://www.nydailynews.com/sports/baseball/mets/feed/",
    parse: parseRss,
    team: "NYM",
  },
  {
    id: "amazin-mets",
    source: "amazin",
    outlet: "Amazin' Avenue",
    url: "https://www.amazinavenue.com/rss/index.xml",
    parse: parseAtom,
    team: "NYM",
  },
  {
    id: "mlbtr-mets",
    source: "mlbtr",
    outlet: "MLB Trade Rumors",
    url: "https://www.mlbtraderumors.com/new-york-mets/feed",
    parse: parseRss,
    team: "NYM",
  },
];

/** @param {typeof fetch} fetchImpl */
export const readMlbNews = (fetchImpl) =>
  readNewsFeeds(fetchImpl, NEWS_FEEDS, { userAgent: NEWS_USER_AGENT });
