// How a pill's names look: each one's fill, its outline, and its letters' color, and the fades
// that hand the fill from one name to another.

/**
 * Each name in the pill, with its fill, outline, and letters' color.
 * @param {import("@playwright/test").Locator} tabList
 */
export const readPillNames = (tabList) =>
  tabList.evaluate((list) =>
    [...list.querySelectorAll("[role=tab]")].map((tab) => {
      const style = getComputedStyle(tab);
      return {
        name: (tab.textContent ?? "").trim(),
        fill: style.backgroundColor,
        edge: style.boxShadow,
        textColor: style.color,
      };
    }),
  );

/**
 * The names whose fill shows.
 * @param {import("@playwright/test").Locator} tabList
 */
export const readFilledNames = async (tabList) =>
  (await readPillNames(tabList))
    .filter(({ fill }) => fill !== "rgba(0, 0, 0, 0)")
    .map(({ name }) => name);

/**
 * Starts noting each fade of a name's fill or letters, and returns a way to read them: for each,
 * the name, what fades, its duration, delay, and easing, and when it started.
 * @param {import("@playwright/test").Locator} tabList
 * @returns {Promise<() => Promise<NameFade[]>>}
 */
export async function noteNameFades(tabList) {
  const key = `nameFades${Math.random().toString(36).slice(2)}`;
  await tabList.evaluate((list, key) => {
    const fades = /** @type {object[]} */ ([]);
    list.addEventListener("transitionrun", (fade) => {
      const event = /** @type {TransitionEvent} */ (fade);
      const tab = /** @type {HTMLElement} */ (event.target);
      const style = getComputedStyle(tab);
      const index = style.transitionProperty.split(", ").indexOf(event.propertyName);
      const readAt = (/** @type {string} */ values) => values.split(", ")[index];
      fades.push({
        name: (tab.textContent ?? "").trim(),
        property: event.propertyName,
        duration: readAt(style.transitionDuration),
        delay: readAt(style.transitionDelay),
        easing: readAt(style.transitionTimingFunction),
        at: event.timeStamp,
      });
    });
    Object.assign(window, { [key]: fades });
  }, key);
  return () => tabList.page().evaluate((key) => /** @type {any} */ (window)[key], key);
}

/**
 * @typedef {object} NameFade
 * @property {string} name
 * @property {string} property
 * @property {string} duration
 * @property {string} delay
 * @property {string} easing
 * @property {number} at
 */

/**
 * The fades of each name's fill, by name, as `noteNameFades` noted them, sorted.
 * @param {NameFade[]} fades
 */
export const listFillFades = (fades) =>
  fades
    .filter(({ property }) => property === "background-color")
    .map(({ name, duration, delay, easing }) => `${name} ${duration} ${delay} ${easing}`)
    .sort();
