import { test } from "node:test";
import assert from "node:assert/strict";
import { html } from "../shared/page/html.js";
import { renderSheetPart } from "../shared/page/sheet-part.js";
import { listOpenSheets, reopenSheets } from "../shared/page/sheet.js";
import {
  refreshTeamSheet,
  renderTeamDetail,
  renderTeamSheetButton,
  renderTeamStats,
  renderTitles,
  startTeamSheet,
} from "../shared/page/team-sheet.js";
import { stripTags } from "./text.js";

// Stand-ins for the page's team dialog and its parts, on a wide screen without motion.
function createPage() {
  globalThis.matchMedia = /** @type {any} */ (
    (query) => ({ matches: query.includes("reduced-motion") })
  );
  globalThis.getComputedStyle = /** @type {any} */ (() => ({ height: "400px" }));
  const dialog = Object.assign(new EventTarget(), {
    id: "teamDialog",
    dataset: {},
    open: false,
    scrollTop: 0,
    showModal() {
      dialog.open = true;
    },
    close() {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    },
    removeAttribute() {},
    querySelector: () => ({ classList: { toggle: () => {} } }),
  });
  const elements = {
    teamDialog: dialog,
    teamTitle: { innerHTML: "" },
    teamNote: { innerHTML: "" },
    teamPages: Object.assign(new EventTarget(), { innerHTML: "" }),
    teamBody: Object.assign(new EventTarget(), { innerHTML: "" }),
    teamDoneBtn: new EventTarget(),
  };
  const document = Object.assign(new EventTarget(), { getElementById: (id) => elements[id] });
  globalThis.document = /** @type {any} */ (document);
  return { dialog, elements, document };
}

// A tap on something inside a button whose data-team names the team, or inside none for null.
function tapTeam(document, team) {
  const event = new Event("click");
  Object.defineProperty(event, "target", {
    value: { closest: () => (team ? { dataset: { team } } : null) },
  });
  document.dispatchEvent(event);
}

const BOS_TITLES = [2018, 2013, 2007, 2004, 1918, 1916, 1915];

const page = createPage();
let season = "the season so far";
const PAGES = [
  { id: "stats", label: "Stats" },
  { id: "roster", label: "Roster" },
];

/**
 * A sheet for each team: the Mets' with a Stats and a Roster page, each showing which it was asked for, or first.
 * @param {string} team
 * @param {string | null} shownPage
 */
function renderSheet(team, shownPage) {
  const sheet = { heading: html`<b>${team}</b>`, note: `${team} note` };
  if (team === "NYM") return { ...sheet, body: html`<p>${shownPage ?? "first"}</p>`, pages: PAGES };
  return { ...sheet, body: team === "BOS" ? renderTitles(BOS_TITLES) : html`<p>${season}</p>` };
}

startTeamSheet({ isTeam: (team) => ["NYY", "BOS", "NYM"].includes(team), renderSheet });

// A tap on the pill's tab for a page.
function tapPage(pill, id) {
  const event = new Event("click");
  Object.defineProperty(event, "target", { value: { closest: () => ({ dataset: { page: id } }) } });
  pill.dispatchEvent(event);
}

/** The pages' names in the pill, and which shows. */
const readPill = () =>
  [...page.elements.teamPages.innerHTML.matchAll(/aria-selected="(\w+)">(\w+)</g)].map(
    ([, selected, label]) => `${label}${selected === "true" ? " (shown)" : ""}`,
  );

// A tap on the titles' button for the rest, or on something else in the sheet's body.
function tapInBody(body, isOnMore) {
  const event = new Event("click");
  Object.defineProperty(event, "target", {
    value: { closest: (selector) => (isOnMore && selector === ".team-titles-more" ? {} : null) },
  });
  body.dispatchEvent(event);
}

test("a tap on a team's button opens its sheet, and a tap on another's shows that one in its place", () => {
  tapTeam(page.document, "NYY");
  assert.equal(page.dialog.open, true);
  assert.equal(page.elements.teamTitle.innerHTML, "<b>NYY</b>");
  assert.equal(page.elements.teamNote.innerHTML, "NYY note");
  tapTeam(page.document, "BOS");
  assert.equal(page.elements.teamTitle.innerHTML, "<b>BOS</b>");
  page.dialog.close();
});

test("a tap on a team the league doesn't know, or on nothing that names a team, opens nothing", () => {
  tapTeam(page.document, "XYZ");
  tapTeam(page.document, null);
  assert.equal(page.dialog.open, false);
});

test("an open sheet redraws from the season as it is now, and a closed one is left as it was", () => {
  tapTeam(page.document, "NYY");
  season = "a new win";
  refreshTeamSheet();
  assert.equal(page.elements.teamBody.innerHTML, "<p>a new win</p>");
  page.dialog.close();
  season = "another win";
  refreshTeamSheet();
  assert.equal(page.elements.teamBody.innerHTML, "<p>a new win</p>");
});

test("Done closes the sheet", () => {
  tapTeam(page.document, "NYY");
  page.elements.teamDoneBtn.dispatchEvent(new Event("click"));
  assert.equal(page.dialog.open, false);
});

test("a team's button names the team for a screen reader and keeps any class of what it holds", () => {
  assert.equal(
    renderTeamSheetButton({ team: "NYY", name: "New York Yankees", content: "Yankees" }).text,
    '<button type="button" class="team-open" data-team="NYY" aria-label="Team details: New York Yankees">Yankees</button>',
  );
  assert.match(
    renderTeamSheetButton({ team: "NYY", name: "Yankees", content: "Yankees", className: "club" })
      .text,
    /^<button type="button" class="club team-open" data-team="NYY"/,
  );
});

test("a team's numbers leave out any it has none for, and show nothing when it has none", () => {
  const stats = /** @type {import("../shared/page/html.js").Markup} */ (
    renderTeamStats([
      ["PCT", ".574"],
      ["GB", null],
      ["Magic", 3],
    ])
  );
  assert.deepEqual(
    [
      ...stats.text.matchAll(
        /<span class="team-label">(.*?)<\/span><b class="tabular">(.*?)<\/b>/g,
      ),
    ].map(([, label, value]) => `${label} ${value}`),
    ["PCT .574", "Magic 3"],
  );
  assert.equal(renderTeamStats([["GB", null]]), false);
});

test("a team's line of facts follows its label", () => {
  assert.equal(stripTags(renderTeamDetail("Titles", html`<b>2</b> 2009`)), "Titles2 2009");
});

// What markup reads as, each separator a bar, and runs of space one.
const readText = (markup) =>
  stripTags(String(markup).replace(/&bull;/g, " | "))
    .replace(/\s+/g, " ")
    .trim();

test("a team's titles list every season up to six, beyond that the latest three and how many more, and none yet for a team without", () => {
  const titles = renderTitles([2024, 2018, 2013, 2007, 2004, 2001, 1998], "20 yrs");
  assert.equal(readText(titles), "Titles 20 yrs 7 | 2024, 2018, 2013 and 4 more");
  assert.match(titles.text, /<button type="button" class="team-titles-more">and 4 more<\/button>/);
  const six = renderTitles([2024, 2018, 2013, 2007, 2004, 2001]);
  assert.equal(readText(six), "Titles 6 | 2024, 2018, 2013, 2007, 2004, 2001");
  assert.doesNotMatch(six.text, /team-titles-more/);
  assert.match(renderTitles([]).text, /<span class="team-titles-none">None yet<\/span>/);
});

test("a tap on the titles' button lists them all until the sheet shows another team", () => {
  const readBody = () => readText(page.elements.teamBody.innerHTML);
  tapTeam(page.document, "BOS");
  tapInBody(page.elements.teamBody, false);
  assert.equal(readBody(), "Titles 7 | 2018, 2013, 2007 and 4 more");
  tapInBody(page.elements.teamBody, true);
  assert.equal(readBody(), "Titles 7 | 2018, 2013, 2007, 2004, 1918, 1916, 1915");
  refreshTeamSheet();
  assert.equal(readBody(), "Titles 7 | 2018, 2013, 2007, 2004, 1918, 1916, 1915");
  tapTeam(page.document, "NYY");
  tapTeam(page.document, "BOS");
  assert.equal(readBody(), "Titles 7 | 2018, 2013, 2007 and 4 more");
  page.dialog.close();
});

test("a sheet a reload put back open shows its team again, with every title if they were listed, and one the league doesn't know closes", () => {
  const readBody = () => readText(page.elements.teamBody.innerHTML);
  tapTeam(page.document, "BOS");
  tapInBody(page.elements.teamBody, true);
  const saved = listOpenSheets();
  tapTeam(page.document, "NYY");
  page.dialog.close();

  page.dialog.open = true;
  reopenSheets(saved);
  assert.equal(page.dialog.open, true);
  assert.equal(readBody(), "Titles 7 | 2018, 2013, 2007, 2004, 1918, 1916, 1915");
  page.dialog.close();

  page.dialog.open = true;
  reopenSheets([{ id: "teamDialog", scrollTop: 0, subject: { team: "XYZ" } }]);
  assert.equal(page.dialog.open, false);
});

test("a sheet's part has its title, and a note across from it only when it has one", () => {
  const part = renderSheetPart("Playoffs", html`<p>Games</p>`, "Alive");
  assert.match(part.text, /<h3>Playoffs<\/h3>\s*<span>Alive<\/span>/);
  assert.match(part.text, /<p>Games<\/p>/);
  assert.doesNotMatch(renderSheetPart("Season", html`<p>Stats</p>`).text, /<span>/);
});

test("a sheet with pages opens on its first, under a pill that shows the one a tap picks, and a sheet without has no pill", () => {
  tapTeam(page.document, "NYM");
  assert.deepEqual(readPill(), ["Stats (shown)", "Roster"]);
  assert.equal(page.elements.teamBody.innerHTML, "<p>first</p>");
  assert.equal(page.dialog.dataset.page, "stats");

  tapPage(page.elements.teamPages, "roster");
  assert.deepEqual(readPill(), ["Stats", "Roster (shown)"]);
  assert.match(page.elements.teamPages.innerHTML, /--swipe: 1/);
  assert.equal(page.elements.teamBody.innerHTML, "<p>roster</p>");
  assert.equal(page.dialog.dataset.page, "roster");

  tapTeam(page.document, "NYY");
  assert.equal(page.elements.teamPages.innerHTML, "");
  assert.equal(page.dialog.dataset.page, "");
  tapTeam(page.document, "NYM");
  assert.deepEqual(readPill(), ["Stats (shown)", "Roster"]);
  page.dialog.close();
});

test("a sheet a reload put back open shows the page it was on", () => {
  tapTeam(page.document, "NYM");
  tapPage(page.elements.teamPages, "roster");
  const saved = listOpenSheets();
  page.dialog.close();

  page.dialog.open = true;
  reopenSheets(saved);
  assert.deepEqual(readPill(), ["Stats", "Roster (shown)"]);
  assert.equal(page.elements.teamBody.innerHTML, "<p>roster</p>");
  page.dialog.close();
});
