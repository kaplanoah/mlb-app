// What a viewer chooses on a page, like a ranking or a dismissal, kept on their own device as JSON
// under a key. Nobody signs in, and people share a page's address, so the page saves nothing of a
// viewer's to the store. Storage can refuse access, as in a private window, and then what's kept
// lasts until the page reloads.

/** @type {Map<string, unknown>} */
const keptInMemory = new Map();

/** @param {string} text */
function parseKept(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * What this device keeps under `key`, or null when it keeps nothing there.
 * @param {string} key
 * @returns {unknown}
 */
export function readFromDevice(key) {
  let text;
  try {
    text = localStorage.getItem(key);
  } catch {
    return keptInMemory.get(key) ?? null;
  }
  return text === null ? null : parseKept(text);
}

/**
 * @param {string} key
 * @param {unknown} value any value JSON can hold
 */
export function keepOnDevice(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    keptInMemory.delete(key);
  } catch {
    keptInMemory.set(key, value);
  }
}
