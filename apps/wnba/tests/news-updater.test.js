import test from "node:test";
import assert from "node:assert/strict";
import { NEWS_MODEL, readJsonArray } from "../worker/src/news-claude.js";
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
    remove: async (key) => {
      stored.delete(key);
    },
  };
}

const readStories = (content) => JSON.parse(content.slice(content.lastIndexOf("[")));

/** @param {string} content */
const readStoriesSoFar = (content) =>
  JSON.parse(content.slice(content.indexOf("["), content.indexOf("\n\nNew stories:")));

// Keeps every story but the ones `skip` names.
const answerLabels = (stories, skip) =>
  stories
    .filter((story) => !skip(story))
    .map((story) => ({ id: story.id, keep: true, teams: ["NYL", "XYZ"], reason: "News." }));

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
    const answers = answerLabels(readStories(body.messages[0].content), skip);
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
  const loadSnapshot = async () => ({});
  const runJob = (fetchImpl) =>
    job.run({ docs, storage, loadSnapshot, env, fetchImpl, now: () => now });
  return { storage, docs, runJob };
}

const listStoryStates = (storage) =>
  [...storage.stored].filter(([key]) => key.startsWith("story:")).map(([, story]) => story.state);

test("a run has Claude judge the new stories in batches, and saves the ones it keeps, newest first", async () => {
  const requests = [];
  const { docs, runJob } = createRun();

  await runJob(createFetch({ requests }));

  assert.deepEqual(
    requests.map((request) => readStories(request.body.messages[0].content).length),
    [12, 12],
  );
  assert.equal(requests[0].headers["x-api-key"], "test-key");
  assert.equal(requests[0].body.model, NEWS_MODEL);
  assert.deepEqual(requests[0].body.system[0].cache_control, { type: "ephemeral", ttl: "1h" });

  const { stories } = docs.stored.get("news/stories");
  assert.equal(stories.length, 24);
  const published = stories.map((story) => Date.parse(story.publishedAt));
  assert.deepEqual(
    published,
    published.toSorted((first, second) => second - first),
  );
  const fields = Object.keys(stories[0]).filter((field) => field !== "teamFeed");
  assert.deepEqual(fields.sort(), [
    "author",
    "id",
    "outlet",
    "photo",
    "publishedAt",
    "source",
    "summary",
    "teams",
    "title",
    "url",
  ]);
  assert.deepEqual(stories[0].teams, ["NYL"]);
});

test("Claude reads the stories the feed has so far, then the new ones in the order they came out", async () => {
  const requests = [];
  const { storage, runJob } = createRun();

  await runJob(createFetch({ requests }));

  const [first, second] = requests.map((request) => request.body.messages[0].content);
  assert.deepEqual(readStoriesSoFar(first), []);
  assert.deepEqual(
    readStoriesSoFar(second).map((story) => story.title),
    readStories(first).map((story) => story.title),
  );
  const publishedAt = new Map(
    [...storage.stored.values()].map((story) => [story.title, Date.parse(story.publishedAt)]),
  );
  const asked = [first, second].flatMap((content) =>
    readStories(content).map((story) => publishedAt.get(story.title)),
  );
  assert.deepEqual(
    asked,
    asked.toSorted((earlier, later) => earlier - later),
  );
});

test("a story Claude drops as told already is left out of what the page reads", async () => {
  const { docs, runJob } = createRun();
  const skip = (story) => story.title.startsWith("Film review");

  await runJob(async (url, init) => {
    if (String(url) !== CLAUDE_URL) return createFeedFetch()(url);
    const stories = readStories(JSON.parse(init.body).messages[0].content);
    const answers = stories.map((story) =>
      skip(story)
        ? { id: story.id, keep: false, why: "retold", teams: [], reason: "Told already." }
        : { id: story.id, keep: true, teams: ["NYL"], reason: "News." },
    );
    return Response.json({ content: [{ type: "text", text: JSON.stringify(answers) }] });
  });

  const titles = docs.stored.get("news/stories").stories.map((story) => story.title);
  assert.ok(titles.length > 0);
  assert.ok(!titles.some((title) => title.startsWith("Film review")));
});

test("the topics a store kept before are removed", async () => {
  const { docs, runJob } = createRun();
  await docs.write("news/topics", { topics: [] });

  await runJob(createFetch());

  assert.equal(docs.stored.has("news/topics"), false);
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
    calls: 2,
    input: 200,
    output: 100,
    cacheRead: 1800,
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

  const asked = requests.flatMap((request) =>
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
  assert.deepEqual(docs.stored.get("news/stories"), { stories: [] });
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

test("the news is read every fifteen minutes by day and hourly overnight, Eastern", () => {
  const job = createNewsJob();
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T14:00:00Z")), 15 * 60 * 1000);
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T07:00:00Z")), 60 * 60 * 1000);
});

test("an overnight wait ends at 7 a.m. Eastern, in and out of daylight time", () => {
  const job = createNewsJob();
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T10:30:00Z")), 30 * 60 * 1000);
  assert.equal(job.chooseDelay(Date.parse("2026-10-05T10:45:00Z")), 15 * 60 * 1000);
  assert.equal(job.chooseDelay(Date.parse("2027-01-10T11:40:00Z")), 20 * 60 * 1000);
});

test("Claude's answer is read from its JSON array, whatever text is around it", () => {
  assert.deepEqual(readJsonArray('Sure:\n[{"id": 1}]\nDone.'), [{ id: 1 }]);
  assert.throws(() => readJsonArray("No stories."), /no JSON array/);
});
