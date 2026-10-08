import { isSameJson } from "#shared/compare.js";
import { listSlateGames } from "../../page/js/slate.js";
import { fetchBoxScore, nameGameDetailsKey } from "./box-score.js";

// Keeps each finished game's box score, so a sheet opened on a final reads only the store. The
// games are the ones the page lists, from the current season's slate. A game is read as the store
// finds it final, and again once a read comes long enough after its end for MLB to have caught up
// on its last plays, and then never again, since a finished game doesn't change. Each run reads a
// few games, the latest to end first. A game still to start or being played is left to the pages
// watching it (watched-games.js).

const MINUTE_MS = 60 * 1000;
const RUN_DELAY_MS = 2 * MINUTE_MS;
const GAMES_PER_RUN = 4;
const SETTLE_MS = 10 * MINUTE_MS;
const RETRY_MS = 10 * MINUTE_MS;
// A game whose box score hasn't settled this long after its first read is let go.
const GIVE_UP_MS = 2 * 60 * MINUTE_MS;

/** @typedef {import("../../../../shared/worker/season-store.js").JobContext} JobContext */
/** @typedef {{ firstReadAt: number, readAt: number, isDone: boolean }} GameRead */

/** @param {number} season */
const nameReadsKey = (season) => `box-score-reads:${season}`;

/** @param {any} slate */
const listFinalsLatestFirst = (slate) =>
  listSlateGames(slate)
    .filter((game) => game.state === "final")
    .sort((first, second) => Date.parse(second.end) - Date.parse(first.end));

/**
 * @param {GameRead | undefined} read
 * @param {number} now
 */
const isDue = (read, now) => !read || (!read.isDone && now - read.readAt >= RETRY_MS);

/**
 * When a read can no longer miss the game's last plays.
 * @param {any} game
 */
const findSettledTime = (game) => (game.end ? Date.parse(game.end) + SETTLE_MS : -Infinity);

/**
 * Reads a game's box score and saves it when it changed, keeping what was saved when the read fails.
 * @param {JobContext} context
 * @param {any} game
 * @param {GameRead | undefined} read the game's last read
 * @returns {Promise<GameRead>}
 */
async function keepGame(context, game, read) {
  const key = nameGameDetailsKey(game.id);
  const boxScore = await fetchBoxScore(context.fetchImpl, game.id).catch(() => null);
  if (boxScore && !isSameJson(await context.docs.read(key), boxScore))
    await context.docs.write(key, boxScore);
  const now = context.now();
  const firstReadAt = read?.firstReadAt ?? now;
  const isSettled = boxScore?.state === "final" && now >= findSettledTime(game);
  return { firstReadAt, readAt: now, isDone: isSettled || now - firstReadAt >= GIVE_UP_MS };
}

/**
 * The reads of the games still on the slate, so the list never outgrows it.
 * @param {Record<string, GameRead>} reads
 * @param {any[]} finals
 */
const keepSlateReads = (reads, finals) =>
  Object.fromEntries(
    finals.filter((game) => reads[game.id]).map((game) => [game.id, reads[game.id]]),
  );

/** @param {JobContext} context */
async function keepFinishedGames(context) {
  const season = (await context.docs.read("live/current"))?.season;
  const slate = season && (await context.docs.read(`seasons/${season}`))?.slate;
  if (!slate) return;
  const readsKey = nameReadsKey(season);
  /** @type {Record<string, GameRead>} */
  const stored = (await context.storage.get(readsKey)) ?? {};
  const finals = listFinalsLatestFirst(slate);
  const reads = keepSlateReads(stored, finals);
  const now = context.now();
  const due = finals.filter((game) => isDue(reads[game.id], now)).slice(0, GAMES_PER_RUN);
  for (const game of due) reads[game.id] = await keepGame(context, game, reads[game.id]);
  if (!isSameJson(stored, reads)) await context.storage.put(readsKey, reads);
}

export function createGameDetailsJob() {
  return { chooseDelay: () => RUN_DELAY_MS, run: keepFinishedGames };
}
