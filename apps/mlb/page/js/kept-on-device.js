// What this device keeps for each season: its ranking, and when it last dismissed the Updates box.

import { keepOnDevice, readFromDevice } from "#shared/device-storage.js";

const RANKINGS_KEY = "rankings";
const SEEN_AT_KEY = "updatesSeenAt";

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
function readSeasons(key) {
  const kept = readFromDevice(key);
  return isPlainObject(kept) ? /** @type {Record<string, unknown>} */ (kept) : {};
}

/**
 * @param {string} key
 * @param {number} year
 * @param {unknown} value
 */
const keepForSeason = (key, year, value) =>
  keepOnDevice(key, { ...readSeasons(key), [year]: value });

/**
 * The clubs this device dragged into order for a season, or none before its first drag.
 * @param {number} year
 * @returns {string[]}
 */
export function readRanking(year) {
  const ranking = readSeasons(RANKINGS_KEY)[year];
  return Array.isArray(ranking) ? ranking.filter((id) => typeof id === "string") : [];
}

/**
 * @param {number} year
 * @param {string[]} order
 */
export const keepRanking = (year, order) => keepForSeason(RANKINGS_KEY, year, order);

/**
 * When this device last dismissed a season's Updates box, or 0 before its first dismissal.
 * @param {number} year
 */
export function readSeenAt(year) {
  const seenAt = readSeasons(SEEN_AT_KEY)[year];
  return typeof seenAt === "number" && seenAt > 0 ? seenAt : 0;
}

/**
 * @param {number} year
 * @param {number} at
 */
export const keepSeenAt = (year, at) => keepForSeason(SEEN_AT_KEY, year, at);
