// The Game section's box score, below the game's row and its starters: before first pitch, each
// club's lineup once it's posted, with each batter's season so far; once the game starts, its runs
// by inning, then each club's batters and pitchers.

import { html } from "#shared/html.js";
import { renderPlainClub, renderTeamDot } from "./clubs.js";
import { renderSheetPart } from "#shared/sheet-part.js";

const SIDES = /** @type {const} */ (["away", "home"]);
const INNINGS = 9;
const BATTING_COLUMNS = /** @type {const} */ ([
  ["AB", "atBats"],
  ["R", "runs"],
  ["H", "hits"],
  ["RBI", "rbi"],
  ["BB", "walks"],
  ["K", "strikeOuts"],
]);
const PITCHING_COLUMNS = /** @type {const} */ ([
  ["IP", "inningsPitched"],
  ["H", "hits"],
  ["R", "runs"],
  ["ER", "earnedRuns"],
  ["BB", "walks"],
  ["K", "strikeOuts"],
]);
const LINEUP_COLUMNS = /** @type {const} */ ([
  ["AVG", "average"],
  ["HR", "homeRuns"],
  ["RBI", "rbi"],
]);

/** @typedef {{ away: string, home: string }} BoxScoreGame */

/** @param {readonly (readonly [string, string])[]} columns */
const renderHeads = (columns) => columns.map(([label]) => html`<th>${label}</th>`);

/**
 * @param {any} row
 * @param {readonly (readonly [string, string])[]} columns
 */
const renderCells = (row, columns) =>
  columns.map(([, field]) => html`<td class="tabular">${row[field] ?? "-"}</td>`);

/**
 * @param {string} label
 * @param {readonly (readonly [string, string])[]} columns
 * @param {import("#shared/html.js").Markup[]} rows
 */
const renderTable = (label, columns, rows) =>
  html`<div class="box-wrap">
    <table class="st box-table">
      <thead>
        <tr>
          <th class="left">${label}</th>
          ${renderHeads(columns)}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;

/**
 * @param {string} name
 * @param {import("#shared/html.js").Markup | string} note
 */
const renderName = (name, note) =>
  html`<td class="team"><span class="box-name">${name}</span>${note}</td>`;

/** @param {any} batter */
const renderPosition = (batter) => html`<span class="box-pos">${batter.position}</span>`;

/** @param {any[]} batters */
const sumBatting = (batters) =>
  Object.fromEntries(
    BATTING_COLUMNS.map(([, field]) => [
      field,
      batters.reduce((total, batter) => total + batter[field], 0),
    ]),
  );

/** @param {any[]} batters */
const renderBatting = (batters) =>
  renderTable("Batters", BATTING_COLUMNS, [
    ...batters.map(
      (batter) =>
        html`<tr class="${batter.isSub ? "box-sub" : ""}">
          ${renderName(batter.name, renderPosition(batter))}${renderCells(batter, BATTING_COLUMNS)}
        </tr>`,
    ),
    html`<tr class="box-total">
      <td class="team">Team</td>
      ${renderCells(sumBatting(batters), BATTING_COLUMNS)}
    </tr>`,
  ]);

/** @param {any} pitcher */
const renderDecision = (pitcher) =>
  pitcher.decision ? html`<span class="box-decision">${pitcher.decision}</span>` : "";

/** @param {any[]} pitchers */
const renderPitching = (pitchers) =>
  renderTable(
    "Pitchers",
    PITCHING_COLUMNS,
    pitchers.map(
      (pitcher) =>
        html`<tr>
          ${renderName(pitcher.name, renderDecision(pitcher))}${renderCells(pitcher, PITCHING_COLUMNS)}
        </tr>`,
    ),
  );

/** @param {any[]} batters */
const renderLineup = (batters) =>
  renderTable(
    "Batters",
    LINEUP_COLUMNS,
    batters.map(
      (batter) =>
        html`<tr>
          ${renderName(batter.name, renderPosition(batter))}${renderCells(batter, LINEUP_COLUMNS)}
        </tr>`,
    ),
  );

/**
 * A half inning's runs. A home club that leads after the top of the ninth or later never bats in
 * the bottom.
 * @param {any} boxScore
 * @param {"away" | "home"} side
 * @param {number} index
 */
function describeInningRuns(boxScore, side, index) {
  const runs = boxScore.innings[index]?.[side];
  if (runs !== null && runs !== undefined) return String(runs);
  const isUnplayedBottom =
    boxScore.state === "final" && side === "home" && index === boxScore.innings.length - 1;
  return isUnplayedBottom ? "x" : "";
}

/**
 * @param {BoxScoreGame} game
 * @param {any} boxScore
 */
function renderInnings(game, boxScore) {
  const count = Math.max(INNINGS, boxScore.innings.length);
  const numbers = Array.from({ length: count }, (_, index) => index + 1);
  const rows = SIDES.map((side) => {
    const totals = boxScore.totals[side];
    return html`<tr>
      <td class="team"><span class="club">${renderTeamDot(game[side])}<span class="team-name">${game[side]}</span></span></td>
      ${numbers.map((number) => html`<td class="mid tabular">${describeInningRuns(boxScore, side, number - 1)}</td>`)}
      <td class="mid tabular total">${totals.runs}</td>
      <td class="mid tabular">${totals.hits}</td>
      <td class="mid tabular">${totals.errors}</td>
    </tr>`;
  });
  return renderSheetPart(
    "Innings",
    html`<div class="box-wrap">
      <table class="st line-score">
        <thead>
          <tr>
            <th class="left"></th>
            ${numbers.map((number) => html`<th class="mid">${number}</th>`)}
            <th class="mid total">R</th>
            <th class="mid">H</th>
            <th class="mid">E</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`,
  );
}

/**
 * @param {BoxScoreGame} game
 * @param {any} boxScore
 */
const renderClubs = (game, boxScore) =>
  SIDES.map((side) =>
    renderSheetPart(
      renderPlainClub(game[side]),
      html`${renderBatting(boxScore[side].batters)}${renderPitching(boxScore[side].pitchers)}`,
    ),
  );

/**
 * @param {BoxScoreGame} game
 * @param {any} boxScore
 */
const renderLineups = (game, boxScore) =>
  SIDES.filter((side) => boxScore[side].batters.length).map((side) =>
    renderSheetPart(renderPlainClub(game[side]), renderLineup(boxScore[side].batters), "Lineup"),
  );

/**
 * @param {BoxScoreGame} game
 * @param {any} boxScore the Worker's, or null while it hasn't answered
 */
export function renderBoxScore(game, boxScore) {
  if (!boxScore) return html``;
  if (boxScore.state === "pre") return html`${renderLineups(game, boxScore)}`;
  return html`${renderInnings(game, boxScore)}${renderClubs(game, boxScore)}`;
}
