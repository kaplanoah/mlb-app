import test from "node:test";
import assert from "node:assert/strict";
import { NEWS_MODEL, readJsonArray } from "../worker/src/news-claude.js";
import { buildTopicCards } from "../worker/src/news-picks.js";
import { createNewsJob } from "../worker/src/news-updater.js";
import { createFeedFetch } from "./news-fixtures.js";

const NOW = Date.parse("2026-10-05T16:00:00Z");
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const ENV = { ANTHROPIC_API_KEY: "test-key" };

function createJobStorage() {
  const stored = new Map();
  return {
    stored,
    get: async (key) => structuredClone(stored.get(key)),
    put: async (key, value) => {
      stored.set(key, structuredClone(value));
    },
    delete: async (key) => stored.delete(key),
    list: async (prefix) => new Map([...stored].filter(([key]) => key.startsWith(prefix))),
  };
}

function createDocs() {
  const stored = new Map();
  return {
    stored,
    read: async (key) => structuredClone(stored.get(key)) ?? null,
    write: async (key, doc) => {
      stored.set(key, structuredClone(doc));
    },
  };
}

const readStories = (content) => JSON.parse(content.slice(content.lastIndexOf("[")));

// Keeps every story but the ones `skip` names, calls a film review analysis, and puts every story
// about the Liberty or the Dream in one topic.
const answerLabels = (stories, skip) =>
  stories
    .filter((story) => !skip(story))
    .map((story) => ({
      id: story.id,
      keep: true,
      kind: story.title.startsWith("Film review") ? "analysis" : "report",
      teams: ["NYL", "XYZ"],
      reason: "News.",
    }));

const answerGroups = (stories) =>
  stories.map((story) => ({
    id: story.id,
    topic: /Liberty|Dream/.test(story.title) ? "Liberty vs. Dream!" : `story ${story.title}`,
    reason: "Same news.",
  }));

/**
 * The feeds as recorded, and a Claude that answers as `answer` says, or with `status` when it's
 * not 200.
 */
function createFetch({ skip = () => false, status = 200, requests = [] } = {}) {
  const readFeed = createFeedFetch();
  return async (url, init) => {
    if (String(url) !== CLAUDE_URL) return readFeed(url);
    const body = JSON.parse(init.body);
    requests.push({ headers: init.headers, body });
    if (status !== 200) return Response.json({ error: { message: "Overloaded" } }, { status });
    const content = body.messages[0].content;
    const stories = readStories(content);
    const answers = body.system[0].text.startsWith("You pick")
      ? answerLabels(stories, skip)
      : answerGroups(stories);
    return Response.json({
      content: [{ type: "text", text: `Here you go:\n${JSON.stringify(answers)}` }],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900 },
    });
  };
}

/** @param {{ env?: Record<string, string>, now?: number }} [options] */
function createRun({ env = ENV, now = NOW } = {}) {
  const storage = createJobStorage();
  const docs = createDocs();
  const job = createNewsJob();
  const runJob = (fetchImpl) => job.run({ docs, storage, env, fetchImpl, now: () => now });
  return { storage, docs, runJob };
}

const listStoryStates = (storage) =>
  [...storage.stored].filter(([key]) => key.startsWith("story:")).map(([, story]) => story.state);

test("a run has Claude label the new stories in batches, groups the ones it keeps, and saves each topic's card", async () => {
  const requests = [];
  const { docs, runJob } = createRun();

  await runJob(createFetch({ requests }));

  const labelRequests = requests.filter((request) =>
    request.body.system[0].text.startsWith("You pick"),
  );
  assert.equal(labelRequests.length, 2);
  assert.deepEqual(
    labelRequests.map((request) => readStories(request.body.messages[0].content).length),
    [12, 12],
  );
  assert.equal(requests[0].headers["x-api-key"], "test-key");
  assert.equal(requests[0].body.model, NEWS_MODEL);
  assert.deepEqual(requests[0].body.system[0].cache_control, { type: "ephemeral", ttl: "1h" });

  const { cards } = docs.stored.get("news/feed");
  const libertyDream = cards.find((card) => card.id === "liberty-vs-dream");
  assert.equal(libertyDream.stories.length, 2);
  assert.ok(libertyDream.more > 0);
  assert.deepEqual(libertyDream.teams, ["NYL"]);
  assert.ok(cards.every((card) => card.stories.length <= 2));
  assert.deepEqual(Object.keys(libertyDream.stories[0]).sort(), [
    "author",
    "id",
    "kind",
    "outlet",
    "photo",
    "publishedAt",
    "source",
    "summary",
    "title",
    "url",
  ]);
});

test("the status counts each day's calls and tokens, and names the feeds that didn't answer", async () => {
  const { docs, runJob } = createRun();
  const readFeed = createFetch();

  await runJob(async (url, init) =>
    String(url).includes("winsidr") ? new Response("down", { status: 503 }) : readFeed(url, init),
  );

  const status = docs.stored.get("news/status");
  assert.deepEqual(status.missing, ["winsidr"]);
  assert.equal(status.problem, "");
  assert.deepEqual(status.usage["2026-10-05"], {
    calls: 3,
    input: 300,
    output: 150,
    cacheRead: 2700,
    cacheWrite: 0,
  });
});

test("a story Claude didn't answer for waits for the next run, and one it labeled isn't asked about again", async () => {
  const { storage, runJob } = createRun();
  const skip = (story) => story.title.startsWith("Film review");

  await runJob(createFetch({ skip }));
  const waiting = listStoryStates(storage).filter((state) => state === "pending").length;
  const requests = [];
  await runJob(createFetch({ requests }));

  const asked = requests
    .filter((request) => request.body.system[0].text.startsWith("You pick"))
    .flatMap((request) =>
      readStories(request.body.messages[0].content).map((story) => story.title),
    );
  assert.ok(waiting > 1);
  assert.ok(asked.some((title) => title.startsWith("Film review")));
  assert.equal(asked.length, waiting);
});

test("without an API key nothing is asked, and the status says why", async () => {
  const requests = [];
  const { docs, storage, runJob } = createRun({ env: {} });

  await runJob(createFetch({ requests }));

  assert.equal(requests.length, 0);
  assert.match(docs.stored.get("news/status").problem, /ANTHROPIC_API_KEY/);
  assert.deepEqual(docs.stored.get("news/feed"), { cards: [] });
  assert.ok(listStoryStates(storage).includes("pending"));
});

test("a run whose call to Claude fails says so, and its stories wait for the next run", async () => {
  const { docs, storage, runJob } = createRun();

  await runJob(createFetch({ status: 529 }));
  assert.equal(docs.stored.get("news/status").problem, "Claude answered 529: Overloaded");
  assert.ok(!listStoryStates(storage).includes("kept"));

  await runJob(createFetch());
  assert.equal(docs.stored.get("news/status").problem, "");
  assert.ok(listStoryStates(storage).includes("kept"));
});

test("a story older than ten days is forgotten", async () => {
  const { storage, runJob } = createRun();
  const old = { id: "old", state: "kept", publishedAt: "2026-09-20T12:00:00.000Z" };
  await storage.put("story:old", old);

  await runJob(createFetch());

  assert.equal(storage.stored.has("story:old"), false);
});

test("the news is read every half hour by day and every three hours overnight, Eastern", () => {
  const job = createNewsJob();
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T14:00:00Z")), 30 * 60 * 1000);
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T07:00:00Z")), 3 * 60 * 60 * 1000);
});

const createStory = (fields) => ({
  author: "",
  source: "espn",
  photo: null,
  teams: ["NYL"],
  publishedAt: "2026-10-04T12:00:00.000Z",
  ...fields,
});

test("a card leads with the news itself, then the story that adds the most, newest card first", () => {
  const cards = buildTopicCards([
    createStory({ id: "column", topic: "sweep", kind: "column", source: "athletic", author: "A" }),
    createStory({
      id: "analysis",
      topic: "sweep",
      kind: "analysis",
      source: "ix",
      author: "B",
      teams: ["LVA"],
    }),
    createStory({ id: "report", topic: "sweep", kind: "report", teams: ["NYL", "MIN", "IND"] }),
    createStory({
      id: "award",
      topic: "award",
      kind: "report",
      publishedAt: "2026-10-05T12:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    cards.map((card) => [card.id, card.stories.map((story) => story.id), card.more]),
    [
      ["award", ["award"], 0],
      ["sweep", ["report", "analysis"], 1],
    ],
  );
  assert.deepEqual(cards[1].teams, ["NYL", "MIN"]);
});

test("Claude's answer is read from its JSON array, whatever text is around it", () => {
  assert.deepEqual(readJsonArray('Sure:\n[{"id": 1}]\nDone.'), [{ id: 1 }]);
  assert.throws(() => readJsonArray("No stories."), /no JSON array/);
});
