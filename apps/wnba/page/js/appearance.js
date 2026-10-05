// The settings panel's appearance choice: Maple, Walnut, or System to follow the phone. Each
// device keeps its own, since the page saves nothing to the store. js/pick-theme.js sets the theme
// before the first paint; this keeps it, and the icons and bar color that go with it, current.

import { createViewerChoice } from "#shared/device-storage.js";

const CHOICES = ["auto", "light", "dark"];
const THEMES = {
  light: { barColor: "#ead5b2", tabIcon: "icon-light.svg", homeScreenIcon: "icon-light-180.png" },
  dark: { barColor: "#1d1511", tabIcon: "icon.svg", homeScreenIcon: "icon-180.png" },
};

// A home-screen page keeps its settings apart from the browser's, so matching the icon takes
// choosing again in the browser.
const HOME_SCREEN_NOTE =
  "Apple sets a home-screen icon only when the page is added. To match this look, choose it in your browser and add the page again.";

const darkScheme = matchMedia("(prefers-color-scheme: dark)");
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const appearance = createViewerChoice("appearance", (stored) =>
  typeof stored === "string" && CHOICES.includes(stored) ? stored : "auto",
);

/** @param {string} choice */
const resolveTheme = (choice) => {
  if (choice !== "auto") return choice;
  return darkScheme.matches ? "dark" : "light";
};

// A phone keeps the icon a page offers at the moment it's added to the home screen, so the page
// offers the one that matches the theme showing.
/** @param {"light" | "dark"} theme */
function showTheme(theme) {
  const { barColor, tabIcon, homeScreenIcon } = THEMES[theme];
  document.documentElement.dataset.theme = theme;
  findElement("themeColor").setAttribute("content", barColor);
  findElement("tabIcon").setAttribute("href", tabIcon);
  findElement("homeScreenIcon").setAttribute("href", homeScreenIcon);
}

/**
 * Shows the theme the viewer picked, or the phone's for System, now and whenever the phone's
 * changes.
 * @param {() => string} readPicked
 */
function followTheme(readPicked) {
  const showChosenTheme = () =>
    showTheme(/** @type {"light" | "dark"} */ (resolveTheme(readPicked())));
  showChosenTheme();
  darkScheme.addEventListener("change", showChosenTheme);
  return showChosenTheme;
}

// Another tab's choice shows here too.
export function followSavedTheme() {
  appearance.watch(followTheme(appearance.read));
}

/** @param {NodeListOf<HTMLInputElement>} choices */
function checkSavedChoice(choices) {
  const saved = appearance.read();
  for (const choice of choices) choice.checked = choice.value === saved;
}

export function startAppearance() {
  const choices = /** @type {NodeListOf<HTMLInputElement>} */ (
    document.querySelectorAll('input[name="appearance"]')
  );
  const readPicked = () => [...choices].find((choice) => choice.checked)?.value ?? "auto";
  checkSavedChoice(choices);
  const showChosenTheme = followTheme(readPicked);
  for (const choice of choices) {
    choice.addEventListener("change", () => {
      appearance.keep(readPicked());
      showChosenTheme();
      findElement("appearanceNote").textContent = HOME_SCREEN_NOTE;
    });
  }
  appearance.watch(() => {
    checkSavedChoice(choices);
    showChosenTheme();
  });
}
