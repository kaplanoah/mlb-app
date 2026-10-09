import { existsSync, readFileSync } from "node:fs";
import { NEWS_FEEDS } from "../worker/src/news-feeds.js";

// The outlets' feeds as they read on the afternoon of Oct. 9, 2026, cut to a few stories each. A
// feed with no recording, like the Daily News's, which turns away the machine that recorded them,
// answers 403.
const FIXTURES = `${import.meta.dirname}/fixtures/news-2026-10-09`;

/** @param {string} id */
const findFixture = (id) => `${FIXTURES}/${id}.${id === "espn" ? "json" : "xml"}`;

/** @param {string} id */
export const readFixture = (id) => readFileSync(findFixture(id), "utf8");

/** Each feed's recorded answer, and a 503 for any feed in `down`. */
export function createFeedFetch(down = []) {
  const byUrl = new Map(NEWS_FEEDS.map((feed) => [feed.url, feed.id]));
  return async (url) => {
    const id = byUrl.get(String(url));
    if (!id) throw new Error(`No feed at ${url}`);
    if (down.includes(id)) return new Response("down", { status: 503 });
    if (!existsSync(findFixture(id))) return new Response("Forbidden", { status: 403 });
    return new Response(readFixture(id));
  };
}
