import { readFileSync } from "node:fs";
import { NEWS_FEEDS } from "../worker/src/news-feeds.js";

// The outlets' feeds as they read on the afternoon of Oct. 5, 2026, cut to a few stories each.
const FIXTURES = `${import.meta.dirname}/fixtures/news-2026-10-05`;
export const readFixture = (id) =>
  readFileSync(`${FIXTURES}/${id}.${id === "espn" ? "json" : "xml"}`, "utf8");

/** Each feed's recorded answer, and a 503 for any feed in `down`. */
export function createFeedFetch(down = []) {
  const byUrl = new Map(NEWS_FEEDS.map((feed) => [feed.url, feed.id]));
  return async (url) => {
    const id = byUrl.get(String(url));
    if (!id) throw new Error(`No fixture for ${url}`);
    if (down.includes(id)) return new Response("down", { status: 503 });
    return new Response(readFixture(id));
  };
}
