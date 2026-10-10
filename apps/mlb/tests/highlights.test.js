import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createHighlightsServer,
  describeHighlights,
  nameContentRequest,
  nameHighlightsKey,
  namePlaysRequest,
} from "../worker/src/highlights.js";
import { createHighlightsUpdater } from "../worker/src/highlights-updater.js";
import { buildSnapshot } from "../page/js/snapshot.js";

// MLB's content and plays for two Division Series games of Oct 7, as it had them the next day.
const RECORDED = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-highlights.json`, "utf8"),
);
const EVENING = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-07-evening.json`, "utf8"),
);
const MLB_API = "https://statsapi.mlb.com";
const BREWERS_AT_PADRES = "849826";
const RAYS_AT_YANKEES = "849838";

/** @param {string} id */
const describeRecorded = (id) => describeHighlights(id, RECORDED.content[id], RECORDED.plays[id]);

function createMlbFetch() {
  /** @type {string[]} */
  const requests = [];
  /** @param {string} url */
  const fetchImpl = async (url) => {
    const path = url.slice(MLB_API.length);
    requests.push(path);
    const id = /\/game\/(\d+)\//.exec(path)?.[1] ?? "";
    const answer =
      path === nameContentRequest(id)
        ? RECORDED.content[id]
        : path === namePlaysRequest(id)
          ? RECORDED.plays[id]
          : null;
    return answer ? new Response(JSON.stringify(answer)) : new Response("", { status: 404 });
  };
  return { requests, fetchImpl };
}

test("a game's plays come in the order they happened, each with its inning, and a play that scored with the score after it", () => {
  const { plays } = describeRecorded(BREWERS_AT_PADRES);

  assert.deepEqual(
    plays.map((play) => [play.half, play.inning, play.title, play.length]).slice(0, 5),
    [
      ["top", 1, "Jackson Merrill's sliding catch", 30],
      ["top", 1, "Nick Pivetta strikes out Jake Bauers", 7],
      ["bottom", 1, "Dustin May strikes out Jackson Merrill", 12],
      ["top", 3, "Jackson Merrill's diving catch", 11],
      ["bottom", 3, "Fernando Tatis Jr.'s RBI groundout", 19],
    ],
  );
  assert.deepEqual(
    plays.filter((play) => play.score).map((play) => [play.title, play.score, play.scorer]),
    [
      ["Fernando Tatis Jr.'s RBI groundout", [0, 1], "home"],
      ["Manny Machado's RBI single", [0, 2], "home"],
      ["William Contreras' solo home run", [1, 2], "away"],
      ["Jackson Chourio's sacrifice fly", [2, 2], "away"],
      ["Jake Cronenworth's solo home run", [2, 3], "home"],
      ["Xander Bogaerts scores on throwing error", [2, 4], "home"],
      ["Christian Yelich's RBI single", [3, 4], "away"],
    ],
  );
  assert.equal(plays.length, 15);
});

test("a game's clips that aren't its plays, like interviews and the condensed game, stay out", () => {
  const titles = describeRecorded(BREWERS_AT_PADRES).plays.map((play) => play.title);

  assert.ok(!titles.some((title) => /Condensed Game|talk|ABS challenge|first pitch/i.test(title)));
});

test("each clip has a still sized for its place and MLB's video the phone plays", () => {
  const { recap, plays } = describeRecorded(BREWERS_AT_PADRES);

  assert.match(recap?.still ?? "", /\/w_960,h_540,/);
  assert.match(plays[0].still ?? "", /\/w_480,h_270,/);
  assert.match(plays[0].video, /^https:\/\/mlb-cuts-diamond\.mlb\.com\/.+_1280x720_59_4000K\.mp4$/);
});

test("a game's recap video and MLB.com's story lead its highlights", () => {
  const { recap, story } = describeRecorded(BREWERS_AT_PADRES);

  assert.equal(recap?.title, "Brewers vs. Padres Game 3 Highlights");
  assert.equal(recap?.length, 181);
  assert.match(recap?.blurb ?? "", /^Jake Cronenworth hits a solo home run/);
  assert.deepEqual(story, {
    title: "Led by King's all-in relief effort, Padres fight and force Game 4",
    lead: "SAN DIEGO -- Didn\u2019t matter how. The Padres only needed to find a way. They trailed two games to none and faced elimination on Tuesday night in this instant classic of a National League Division Series against Milwaukee.",
    url: "https://www.mlb.com/news/padres-win-nlds-game-3-2026",
    outlet: "MLB.com",
  });
});

test("before MLB posts the recap video or story, a game's highlights have its plays alone", () => {
  const content = structuredClone(RECORDED.content[RAYS_AT_YANKEES]);
  content.editorial.recap.mlb = {};
  content.highlights.highlights.items = content.highlights.highlights.items.filter(
    (/** @type {any} */ item) => !/Game 3 Highlights/.test(item.headline),
  );

  const highlights = describeHighlights(RAYS_AT_YANKEES, content, RECORDED.plays[RAYS_AT_YANKEES]);

  assert.equal(highlights.recap, null);
  assert.equal(highlights.story, null);
  assert.equal(highlights.plays.length, 14);
});

test("the route serves the highlights the store keeps without reading MLB", async () => {
  const mlb = createMlbFetch();
  const server = createHighlightsServer({ fetchImpl: mlb.fetchImpl });
  const kept = describeRecorded(BREWERS_AT_PADRES);

  const response = await server.serveHighlights(
    new URL(`https://app.test/highlights?id=${BREWERS_AT_PADRES}`),
    async (key) => (key === nameHighlightsKey(BREWERS_AT_PADRES) ? kept : null),
  );

  assert.deepEqual(await response.json(), kept);
  assert.deepEqual(mlb.requests, []);
});

test("the route reads MLB for a game the store doesn't keep, in two requests", async () => {
  const mlb = createMlbFetch();
  const server = createHighlightsServer({ fetchImpl: mlb.fetchImpl });

  const response = await server.serveHighlights(
    new URL(`https://app.test/highlights?id=${BREWERS_AT_PADRES}`),
    async () => null,
  );

  assert.deepEqual(await response.json(), describeRecorded(BREWERS_AT_PADRES));
  assert.equal(mlb.requests.length, 2);
});

test("the route turns away an id that isn't MLB's", async () => {
  const server = createHighlightsServer({ fetchImpl: createMlbFetch().fetchImpl });

  const response = await server.serveHighlights(new URL("https://app.test/highlights?id=x"));

  assert.equal(response.status, 400);
});

test("the store's job reads each of the slate's finals in two requests, and saves its highlights", async () => {
  const now = Date.parse(EVENING.now);
  const slate = buildSnapshot(EVENING.responses, { season: EVENING.season, now }).slate;
  const stored = new Map(
    Object.entries({
      "live/current": { season: EVENING.season },
      [`seasons/${EVENING.season}`]: { year: EVENING.season, slate },
    }),
  );
  const docs = {
    read: async (/** @type {string} */ key) => stored.get(key) ?? null,
    list: async () => [],
    write: async (/** @type {string} */ key, /** @type {any} */ doc) => {
      stored.set(key, doc);
    },
  };
  const storage = new Map();
  const mlb = createMlbFetch();
  const job = createHighlightsUpdater();

  await job.run(
    /** @type {any} */ ({
      docs,
      storage: {
        get: async (/** @type {string} */ key) => storage.get(key),
        put: async (/** @type {string} */ key, /** @type {any} */ value) => {
          storage.set(key, value);
        },
      },
      env: {},
      fetchImpl: mlb.fetchImpl,
      now: () => now,
    }),
  );

  const games = new Set(mlb.requests.map((path) => /\/game\/(\d+)\//.exec(path)?.[1]));
  assert.equal(mlb.requests.length, 2 * games.size);
  assert.ok(games.has(BREWERS_AT_PADRES));
  assert.deepEqual(
    stored.get(nameHighlightsKey(BREWERS_AT_PADRES)),
    describeRecorded(BREWERS_AT_PADRES),
  );
});
