import { isSameJson } from "#shared/compare.js";
import { readEasternDay } from "#shared/days.js";
import { describeError } from "../../../../shared/worker/responses.js";
import { TEAMS } from "../../page/js/teams.js";
import { askClaude } from "./news-claude.js";
import { readNewsFeeds } from "./news-feeds.js";
import { LABEL_PROMPT } from "./news-prompts.js";
import { readRuleDrop } from "./news-rules.js";

// Keeps the news the page shows: each run reads the outlets' feeds, drops what the rules can tell
// isn't news, and has Claude judge the rest, each story on its own, against what the feed already
// tells. A story Claude hasn't answered for stays waiting and is asked about again on the next run,
// so a run that fails loses nothing. The kept stories go in `news/stories`, newest first, where each
// page picks the ones from the outlets its device reads, and how the runs are going, with Claude's
// daily token counts, in `news/status`.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SHOWN_MS = 7 * DAY_MS;
// Stories are kept a little past when they're shown, so one that a feed still lists isn't asked
// about again.
const KEPT_MS = 10 * DAY_MS;
const USAGE_DAYS = 30;
const MORNING_HOUR = 7;
const DAY_DELAY_MS = 15 * MINUTE_MS;
const NIGHT_DELAY_MS = 60 * MINUTE_MS;
const LABEL_BATCH = 12;
const LABELS_PER_RUN = 24;
const MAX_SHOWN = 80;
const STORIES_KEY = "news/stories";
// A document no page reads, removed from any store that still keeps it.
const OLD_TOPICS_KEY = "news/topics";
const STATUS_KEY = "news/status";

/**
 * A story the news has seen, as it's kept.
 * @typedef {object} NewsStory
 * @property {string} id
 * @property {string} url
 * @property {string} title
 * @property {string} summary
 * @property {string} author
 * @property {string} outlet
 * @property {string} source
 * @property {string} [teamFeed]
 * @property {string} publishedAt
 * @property {string} firstSeenAt
 * @property {{ url: string, credit: string } | null} photo
 * @property {string} [espnType]
 * @property {"pending" | "kept" | "dropped"} state
 * @property {string} [why]
 * @property {string[]} [teams]
 * @property {string} [reason]
 */

/**
 * The wait between runs: every fifteen minutes from 7 a.m. Eastern to midnight, and hourly overnight,
 * but never past 7 a.m., when a morning reader comes for what was written overnight.
 */
function chooseNewsDelay(now) {
  const { hour } = readEasternDay(now);
  if (hour >= MORNING_HOUR) return DAY_DELAY_MS;
  // Eastern time is a whole number of hours off UTC, so its minutes are UTC's.
  const untilMorningMs = ((MORNING_HOUR - hour) * 60 - new Date(now).getUTCMinutes()) * MINUTE_MS;
  return Math.min(NIGHT_DELAY_MS, untilMorningMs);
}

/** @param {string} url */
async function nameStoryId(url) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)),
  );
  return [...digest.subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {import("../../../../shared/worker/season-store.js").JobContext["storage"]} storage
 * @returns {Promise<Map<string, NewsStory>>}
 */
async function readStories(storage) {
  const stored = await storage.list("story:");
  return new Map([...stored.values()].map((story) => [story.id, story]));
}

const saveStory = (storage, story) => storage.put(`story:${story.id}`, story);

// A feed edits a story's time when it edits the story, so a story keeps the first time it's seen
// with, and is never dated ahead of when it's seen.
function readPublishedAt(entry, now) {
  const published = Date.parse(entry.publishedAt);
  return new Date(Number.isNaN(published) ? now : Math.min(published, now)).toISOString();
}

/**
 * @param {import("./news-feeds.js").NewsEntry} entry
 * @param {string} id
 * @param {number} now
 * @returns {NewsStory}
 */
function createStory(entry, id, now) {
  const why = readRuleDrop(entry);
  return {
    id,
    url: entry.url,
    title: entry.title,
    summary: entry.summary,
    author: entry.author,
    outlet: entry.outlet,
    source: entry.source,
    ...(entry.teamFeed && { teamFeed: entry.teamFeed }),
    publishedAt: readPublishedAt(entry, now),
    firstSeenAt: new Date(now).toISOString(),
    photo: entry.photo,
    ...(entry.espnType && { espnType: entry.espnType }),
    state: why ? "dropped" : "pending",
    ...(why && { why }),
  };
}

async function addNewStories(storage, stories, entries, now) {
  for (const entry of entries) {
    const id = await nameStoryId(entry.url);
    if (stories.has(id)) continue;
    const story = createStory(entry, id, now);
    if (now - Date.parse(story.publishedAt) > SHOWN_MS) continue;
    stories.set(id, story);
    await saveStory(storage, story);
  }
}

async function forgetOldStories(storage, stories, now) {
  for (const story of [...stories.values()]) {
    if (now - Date.parse(story.publishedAt) <= KEPT_MS) continue;
    stories.delete(story.id);
    await storage.delete(`story:${story.id}`);
  }
}

const isShownAge = (story, now) => now - Date.parse(story.publishedAt) <= SHOWN_MS;

const byNewest = (first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt);

const byOldest = (first, second) => byNewest(second, first);

const describeForClaude = (story, index) => ({
  id: index + 1,
  title: story.title,
  outlet: story.outlet,
  author: story.author,
  summary: story.summary,
});

const isTeamCode = (code) => Object.hasOwn(TEAMS, code);

/**
 * A story with Claude's label, or null when the answer doesn't say whether to keep it.
 * @param {NewsStory} story
 * @param {any} answer
 * @returns {NewsStory | null}
 */
function applyLabel(story, answer) {
  if (typeof answer?.keep !== "boolean") return null;
  return {
    ...story,
    state: answer.keep ? "kept" : "dropped",
    ...(!answer.keep && { why: String(answer.why || "other") }),
    teams: Array.isArray(answer.teams) ? answer.teams.filter(isTeamCode) : [],
    reason: String(answer.reason ?? ""),
  };
}

/** Each story in `batch` with the answer Claude gave for it by its place in the batch. */
function matchAnswers(batch, answers) {
  const byId = new Map(answers.map((answer) => [Number(answer?.id), answer]));
  return batch.map((story, index) => [story, byId.get(index + 1)]);
}

function splitIntoBatches(stories, size) {
  const batches = [];
  for (let start = 0; start < stories.length; start += size)
    batches.push(stories.slice(start, start + size));
  return batches;
}

const listShownStories = (stories, now) =>
  [...stories.values()].filter((story) => story.state === "kept" && isShownAge(story, now));

const describeToldStory = (story) => ({ title: story.title, outlet: story.outlet });

/** What Claude reads for a batch: the stories the feed has so far, then the new ones. */
const describeBatch = (stories, batch, now) =>
  `Stories so far:\n${JSON.stringify(listShownStories(stories, now).sort(byOldest).map(describeToldStory))}\n\nNew stories:\n${JSON.stringify(batch.map(describeForClaude))}`;

// The newest stories are asked about first, and in the order they came out, so the first to tell
// the news is the one that doesn't have to clear the bar for retelling it.
async function labelWaitingStories({ storage, stories, ask, now }) {
  const waiting = [...stories.values()]
    .filter((story) => story.state === "pending" && isShownAge(story, now))
    .sort(byNewest)
    .slice(0, LABELS_PER_RUN)
    .sort(byOldest);
  for (const batch of splitIntoBatches(waiting, LABEL_BATCH)) {
    const content = describeBatch(stories, batch, now);
    const answers = await ask(LABEL_PROMPT, content);
    for (const [story, answer] of matchAnswers(batch, answers)) {
      const labeled = applyLabel(story, answer);
      if (!labeled) continue;
      stories.set(story.id, labeled);
      await saveStory(storage, labeled);
    }
  }
}

const addUsage = (total, usage) => ({
  calls: (total?.calls ?? 0) + 1,
  input: (total?.input ?? 0) + (usage.input_tokens ?? 0),
  output: (total?.output ?? 0) + (usage.output_tokens ?? 0),
  cacheRead: (total?.cacheRead ?? 0) + (usage.cache_read_input_tokens ?? 0),
  cacheWrite: (total?.cacheWrite ?? 0) + (usage.cache_creation_input_tokens ?? 0),
});

/** Asks Claude, counting each day's tokens under the league's Eastern day. */
function createClaudeAsker({ env, fetchImpl, storage, now }) {
  return async (prompt, content) => {
    const { answers, usage } = await askClaude({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      prompt,
      content,
    });
    const key = `usage:${readEasternDay(now).date}`;
    await storage.put(key, addUsage(await storage.get(key), usage));
    return answers;
  };
}

/** What went wrong asking Claude, or "" when nothing did. */
async function curateStories(context) {
  if (!context.env.ANTHROPIC_API_KEY)
    return "No ANTHROPIC_API_KEY secret, so no story was labeled.";
  const ask = createClaudeAsker(context);
  try {
    await labelWaitingStories({ ...context, ask });
    return "";
  } catch (error) {
    return describeError(error);
  }
}

const describeShownStory = (story) => ({
  id: story.id,
  url: story.url,
  title: story.title,
  summary: story.summary,
  author: story.author,
  outlet: story.outlet,
  source: story.source,
  ...(story.teamFeed && { teamFeed: story.teamFeed }),
  publishedAt: story.publishedAt,
  photo: story.photo,
  teams: story.teams ?? [],
});

async function saveShownStories(docs, stories, now) {
  const shown = listShownStories(stories, now)
    .sort(byNewest)
    .slice(0, MAX_SHOWN)
    .map(describeShownStory);
  const stored = await docs.read(STORIES_KEY);
  if (!isSameJson(stored?.stories, shown)) await docs.write(STORIES_KEY, { stories: shown });
  if (await docs.read(OLD_TOPICS_KEY)) await docs.remove(OLD_TOPICS_KEY);
}

async function readRecentUsage(storage, now) {
  const usage = {};
  for (const [key, counts] of await storage.list("usage:")) {
    const date = key.slice("usage:".length);
    if (now - Date.parse(`${date}T12:00:00Z`) > USAGE_DAYS * DAY_MS) await storage.delete(key);
    else usage[date] = counts;
  }
  return usage;
}

async function saveStatus({ docs, storage, now, missing, problem }) {
  const status = { missing, problem, usage: await readRecentUsage(storage, now) };
  const stored = await docs.read(STATUS_KEY);
  const storedStatus = { missing: stored?.missing, problem: stored?.problem, usage: stored?.usage };
  if (!isSameJson(storedStatus, status))
    await docs.write(STATUS_KEY, { ...status, at: new Date(now).toISOString() });
}

/**
 * One run of the news.
 * @param {import("../../../../shared/worker/season-store.js").JobContext} context
 * @param {typeof readNewsFeeds} readFeeds
 */
async function updateNews({ docs, storage, env, fetchImpl, now: readNow }, readFeeds) {
  const now = readNow();
  const { entries, missing } = await readFeeds(fetchImpl);
  const stories = await readStories(storage);
  await addNewStories(storage, stories, entries, now);
  await forgetOldStories(storage, stories, now);
  const problem = await curateStories({ storage, stories, env, fetchImpl, now });
  await saveShownStories(docs, stories, now);
  await saveStatus({ docs, storage, now, missing, problem });
}

/** @returns {import("../../../../shared/worker/season-store.js").BackgroundJob} */
export const createNewsJob = ({ readFeeds = readNewsFeeds } = {}) => ({
  chooseDelay: chooseNewsDelay,
  run: (context) => updateNews(context, readFeeds),
});
