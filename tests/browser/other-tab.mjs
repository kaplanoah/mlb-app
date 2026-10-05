/**
 * Keeps `value` under `key` from another tab of the page's site, as a viewer with the page open
 * twice would.
 * @param {import("@playwright/test").Page} page
 * @param {string} key
 * @param {unknown} value
 */
export async function keepInOtherTab(page, key, value) {
  const otherTab = await page.context().newPage();
  await otherTab.goto(new URL("/other-tab", page.url()).href);
  await otherTab.evaluate(
    ([storedKey, text]) => localStorage.setItem(storedKey, text),
    [key, JSON.stringify(value)],
  );
  await otherTab.close();
}
