import { describeError, respondJson } from "../../../../shared/worker/responses.js";
import { readStoryLead } from "../../../../shared/worker/story-lead.js";
import { fetchMlbJson } from "./mlb.js";

// One finished game's highlights for its sheet's Highlights section: MLB's recap video, MLB.com's
// written recap, and the clip of each play MLB cut, in the order they came, each with its inning
// and, for a play that scored, the score after it. MLB ties each play's clip to the play in its
// live feed, so the clips that are plays are the ones the feed names. The store keeps each
// game's (highlights-updater.js), so the route reads MLB only for a game the store hasn't kept.

/** @typedef {(key: string) => Promise<any>} ReadDoc */

const GAME_ID = /^\d{1,9}$/;
const CONTENT_CACHE_SECONDS = 60;
const PLAY_FIELDS = [
  "liveData",
  "plays",
  "allPlays",
  "about",
  "inning",
  "halfInning",
  "isScoringPlay",
  "result",
  "awayScore",
  "homeScore",
  "playEvents",
  "playId",
].join(",");
// The recap fills the section's width and a play's still a column beside its title, so each
// takes the smallest of MLB's cuts that stays sharp on a phone.
const RECAP_STILL_WIDTH = 960;
const PLAY_STILL_WIDTH = 480;
const RECAP_TAG = "game-recap";
const VIDEO_PLAYBACK = "mp4Avc";

const HIGHLIGHTS_COLLECTION = "highlights";

/** @param {string} id */
export const nameHighlightsKey = (id) => `${HIGHLIGHTS_COLLECTION}/${id}`;

/** @param {string} id */
export const nameContentRequest = (id) => `/api/v1/game/${id}/content`;

/** @param {string} id */
export const namePlaysRequest = (id) => `/api/v1.1/game/${id}/feed/live?fields=${PLAY_FIELDS}`;

/**
 * Seconds from MLB's "00:03:01".
 * @param {string | undefined} duration
 */
function readSeconds(duration) {
  const parts = String(duration ?? "")
    .split(":")
    .map(Number);
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * @param {any} item
 * @param {number} width
 */
function findStill(item, width) {
  const cuts = (item.image?.cuts ?? [])
    .filter((/** @type {any} */ cut) => cut.src && cut.width)
    .sort((/** @type {any} */ first, /** @type {any} */ second) => first.width - second.width);
  return (cuts.find((/** @type {any} */ cut) => cut.width >= width) ?? cuts.at(-1))?.src ?? null;
}

/** @param {any} item */
const findVideo = (item) =>
  item.playbacks?.find((/** @type {any} */ playback) => playback.name === VIDEO_PLAYBACK)?.url ??
  null;

/**
 * A clip as the sheet shows it, or null for one without a video the phone can play.
 * @param {any} item
 * @param {number} stillWidth
 */
function describeClip(item, stillWidth) {
  const video = findVideo(item);
  const title = String(item.headline ?? "").trim();
  if (!video || !title) return null;
  return { title, length: readSeconds(item.duration), still: findStill(item, stillWidth), video };
}

/** @param {any} item */
const isRecap = (item) =>
  (item.keywordsAll ?? []).some(
    (/** @type {any} */ keyword) => keyword.type === "taxonomy" && keyword.value === RECAP_TAG,
  );

/**
 * Each play's place in the game by the ids of its pitches and actions, which a clip names.
 * @param {any} feed
 */
function listPlaysById(feed) {
  /** @type {Map<string, any>} */
  const plays = new Map();
  (feed?.liveData?.plays?.allPlays ?? []).forEach((/** @type {any} */ play, order) => {
    const isTop = play.about?.halfInning === "top";
    const scored = play.about?.isScoringPlay === true;
    const facts = {
      order,
      half: isTop ? "top" : "bottom",
      inning: play.about?.inning ?? null,
      score: scored ? [play.result?.awayScore ?? 0, play.result?.homeScore ?? 0] : null,
      scorer: scored ? (isTop ? "away" : "home") : null,
    };
    for (const event of play.playEvents ?? []) if (event.playId) plays.set(event.playId, facts);
  });
  return plays;
}

/**
 * The clips of the game's plays, once each, in the order the plays came.
 * @param {any[]} items
 * @param {Map<string, any>} plays
 */
function listPlayClips(items, plays) {
  const clips = new Map();
  for (const item of items) {
    const play = plays.get(item.guid);
    const clip = play && !clips.has(item.guid) && describeClip(item, PLAY_STILL_WIDTH);
    if (clip) clips.set(item.guid, { ...clip, ...play });
  }
  return [...clips.values()]
    .sort((first, second) => first.order - second.order)
    .map(({ order, ...clip }) => clip);
}

/** @param {any} recap MLB.com's recap story */
function describeStory(recap) {
  const title = String(recap?.headline ?? "").trim();
  const lead = readStoryLead(recap?.body);
  if (!title || !recap?.slug || !lead) return null;
  return { title, lead, url: `https://www.mlb.com/news/${recap.slug}`, outlet: "MLB.com" };
}

/** @param {any} items */
function describeRecap(items) {
  const item = items.find(isRecap);
  const clip = item && describeClip(item, RECAP_STILL_WIDTH);
  return clip ? { ...clip, blurb: String(item.description ?? "").trim() } : null;
}

/**
 * @param {string} id
 * @param {any} content MLB's content for the game
 * @param {any} feed the game's plays from its live feed, trimmed to PLAY_FIELDS
 */
export function describeHighlights(id, content, feed) {
  const items = content?.highlights?.highlights?.items ?? [];
  return {
    id,
    recap: describeRecap(items),
    story: describeStory(content?.editorial?.recap?.mlb),
    plays: listPlayClips(items, listPlaysById(feed)),
  };
}

/**
 * MLB's highlights for one game, read afresh.
 * @param {(input: string, init: object) => Promise<Response>} fetchImpl
 * @param {string} id
 */
export async function fetchHighlights(fetchImpl, id) {
  const [content, feed] = await Promise.all([
    fetchMlbJson(fetchImpl, nameContentRequest(id), CONTENT_CACHE_SECONDS),
    fetchMlbJson(fetchImpl, namePlaysRequest(id), CONTENT_CACHE_SECONDS),
  ]);
  return describeHighlights(id, content, feed);
}

export function createHighlightsServer({ fetchImpl = (input, init) => fetch(input, init) } = {}) {
  /**
   * @param {string} id
   * @param {ReadDoc | undefined} readDoc
   */
  async function readKept(id, readDoc) {
    if (!readDoc) return null;
    try {
      return await readDoc(nameHighlightsKey(id));
    } catch (error) {
      console.error(
        `Reading game ${id}'s highlights from the store failed: ${describeError(error)}`,
      );
      return null;
    }
  }

  /**
   * @param {URL} url
   * @param {ReadDoc} [readDoc] the store's documents, when the Worker has a store
   */
  async function serveHighlights(url, readDoc) {
    const id = url.searchParams.get("id") ?? "";
    if (!GAME_ID.test(id)) return respondJson({ error: "id must be an MLB game id" }, 400);
    try {
      return respondJson((await readKept(id, readDoc)) ?? (await fetchHighlights(fetchImpl, id)));
    } catch (error) {
      return respondJson({ error: `Couldn't read MLB: ${describeError(error)}` }, 502);
    }
  }

  return { serveHighlights };
}
