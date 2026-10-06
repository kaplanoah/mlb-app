import { describeError } from "../../../../shared/worker/responses.js";

// What the Worker's routes read from the store, so a tap reads the league only for what the store
// doesn't keep.

/**
 * Reads a document from the store, as null when it has none.
 * @typedef {(key: string) => Promise<any>} ReadDoc
 */

// Where the store keeps each game's box score and lead.
export const GAME_DETAILS_COLLECTION = "games";

/** @param {string} id */
export const nameGameDetailsKey = (id) => `${GAME_DETAILS_COLLECTION}/${id}`;

/**
 * The document the store keeps at `key`, or null when it keeps none, the Worker has no store, or
 * the store can't be read, for the route to read the league instead.
 * @param {ReadDoc | undefined} readDoc
 * @param {string} key
 */
export async function readKeptDoc(readDoc, key) {
  if (!readDoc) return null;
  try {
    return await readDoc(key);
  } catch (error) {
    console.error(`Reading ${key} from the store failed: ${describeError(error)}`);
    return null;
  }
}
