/**
 * Keeps the page's requests that match `pattern` from being answered until the returned function
 * is called.
 * @param {import("@playwright/test").Page} page
 * @param {RegExp} pattern
 * @returns {Promise<() => void>}
 */
export async function holdRequests(page, pattern) {
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route(pattern, async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}
