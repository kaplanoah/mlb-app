// A player's sheet, which a tap on her name opens wherever it shows: her name and team, her facts,
// then her last game beside her season's averages, her playoff games with her points in each, and
// where her regular season's averages rank in the WNBA, each on a small curve of how every ranked
// player's numbers spread.

import { readCalendarDate } from "#shared/days.js";
import { html, joinWithSeparator } from "#shared/html.js";
import { formatOrdinal } from "#shared/ordinal.js";
import { renderPlaceholder } from "#shared/placeholder.js";
import { renderSheetPart } from "#shared/sheet-part.js";
import { renderTeamDetail } from "#shared/team-sheet.js";
import { renderDot, renderTeamName } from "./clubs.js";
import { describeDay } from "./days.js";
import { formatTeamColors } from "./sheet-colors.js";
import { renderSheetMessage } from "./sheet-parts.js";
import { readTeamPlayoffs, renderChip, renderFinishedGame, renderNextGame } from "./team-view.js";

/** @typedef {import("#shared/html.js").Markup} Markup */
/** @typedef {import("./roster-view.js").RosterPlayer} RosterPlayer */
/** @typedef {import("./team-view.js").Season} Season */
/**
 * @typedef {object} PlayerGame
 * @property {string} gameId
 * @property {string} day the league's day, as 2026-10-04
 * @property {boolean} isPlayoffs
 * @property {boolean} isWin
 * @property {number | null} teamScore
 * @property {number | null} opponentScore
 * @property {number} points
 * @property {number} rebounds
 * @property {number} assists
 * @property {number} minutes
 * @property {number} steals
 * @property {number} blocks
 * @property {number} fieldGoalsMade
 * @property {number} fieldGoalsAttempted
 * @property {number} threesMade
 * @property {number} threesAttempted
 * @property {number} freeThrowsMade
 * @property {number} freeThrowsAttempted
 */
/** @typedef {{ key: string, value: number | null, rank: number | null, count: number, values: number[] }} RankedStat */
/**
 * @typedef {object} RegularSeason
 * @property {number} games
 * @property {number} gamesNeeded how many games the WNBA's rule for its leaders asks for so far
 * @property {{ points: number, rebounds: number, assists: number, minutes: number }} averages
 * @property {RankedStat[]} stats
 */
/**
 * @typedef {object} Player
 * @property {string} id
 * @property {string} team
 * @property {number} season
 * @property {string} firstName
 * @property {string} lastName
 * @property {RosterPlayer | null} facts
 * @property {PlayerGame | null} lastGame
 * @property {Record<string, number>} playoffPoints her points in each playoff game she played
 * @property {RegularSeason | null} regularSeason
 */
/** @typedef {{ id: string, team: string, name: string }} PlayerSubject */

const POSITION_WORDS = { G: "Guard", F: "Forward", C: "Center" };

/** @type {{ key: string, label: string, isShare?: boolean }[]} */
const RANKED_STATS = [
  { key: "points", label: "Pts" },
  { key: "rebounds", label: "Reb" },
  { key: "assists", label: "Ast" },
  { key: "steals", label: "Stl" },
  { key: "blocks", label: "Blk" },
  { key: "fieldGoalShare", label: "FG%", isShare: true },
  { key: "threeShare", label: "3P%", isShare: true },
  { key: "freeThrowShare", label: "FT%", isShare: true },
];

// The curve's drawing is 100 wide and 20 tall, its peak kept CURVE_HEADROOM below the top.
const CURVE_WIDTH = 100;
const CURVE_HEIGHT = 20;
const CURVE_HEADROOM = 2;
const CURVE_POINTS = 48;

const OUT_CHIP = html`<span class="foul-chip"><span class="foul-chip-words">Out</span></span>`;

/**
 * A position as the league writes it, like G-F, in words.
 * @param {string | null} position
 */
export const describePosition = (position) =>
  position &&
  position
    .split("-")
    .map((letter) => POSITION_WORDS[/** @type {"G" | "F" | "C"} */ (letter)] ?? letter)
    .join("-");

/** @param {number} value */
const formatAverage = (value) => value.toFixed(1);

/** @param {number | null} value */
function formatStat(value, isShare = false) {
  if (value == null) return "-";
  return isShare ? (value * 100).toFixed(1) : value.toFixed(1);
}

/**
 * Her dot and name, and Out beside it while she is out and her team still plays.
 * @param {PlayerSubject} subject
 * @param {Player | null} player
 * @param {boolean} showsOut
 */
export const renderPlayerHeading = (subject, player, showsOut) =>
  html`${renderDot(subject.team)}<span>${player ? `${player.firstName} ${player.lastName}` : subject.name}</span>${showsOut && player?.facts?.isOut && OUT_CHIP}`;

/**
 * Her team, her number, and her college, or her country for a player who skipped college, or just
 * her team until her facts load.
 * @param {PlayerSubject} subject
 * @param {Player | null} player
 */
export function describePlayerNote(subject, player) {
  const facts = player?.facts;
  return joinWithSeparator(
    [
      renderTeamName(subject.team),
      facts?.number && `#${facts.number}`,
      facts && (facts.college ?? facts.country),
    ].filter(Boolean),
  );
}

/**
 * Her position, age, height, and first season, each under its label, leaving out any the league
 * doesn't have.
 * @param {Player | null} player
 * @param {boolean} isLoading
 */
export function renderPlayerFacts(player, isLoading) {
  if (!player)
    return (
      isLoading &&
      html`<div class="player-facts">${renderPlaceholder("Position 00 0'0\" 0000")}</div>`
    );
  const facts = player.facts;
  /** @type {[string, string | number | null | undefined][]} */
  const cells = [
    ["Position", describePosition(facts?.position ?? null)],
    ["Age", facts?.age],
    ["Height", facts?.height],
    ["Debut", facts?.debut],
  ];
  const shown = cells.filter(([, value]) => value != null);
  return (
    shown.length > 0 &&
    html`<dl class="player-facts">
      ${shown.map(
        ([label, value]) =>
          html`<div class="player-fact"><dt>${label}</dt><dd class="tabular">${value}</dd></div>`,
      )}
    </dl>`
  );
}

/**
 * How her last game ended: its day and the score, or just whether her team won while the league's
 * log of the score is behind.
 * @param {PlayerGame} game
 * @param {number} now
 */
function describeLastGame(game, now) {
  const result = game.isWin ? "W" : "L";
  const score =
    game.teamScore == null || game.opponentScore == null
      ? result
      : `${result} ${game.teamScore}-${game.opponentScore}`;
  return joinWithSeparator([
    describeDay(readCalendarDate(game.day), now),
    html`<span class="tabular">${score}</span>`,
  ]);
}

/**
 * A count over its unit, as 12-23 FG.
 * @param {string | number} count
 * @param {string} unit
 */
const renderCount = (count, unit) =>
  html`<span class="player-count tabular">${count}</span> ${unit}`;

/**
 * Her points, rebounds, assists, and minutes in her last game, and her season's averages under
 * them, then how she shot and what she took away.
 * @param {Player} player
 * @param {number} now
 */
function renderLastGame({ lastGame: game, regularSeason }, now) {
  if (!game) return false;
  const averages = regularSeason?.averages;
  const cells = [
    { label: "Pts", title: "Points", game: game.points, average: averages?.points },
    { label: "Reb", title: "Rebounds", game: game.rebounds, average: averages?.rebounds },
    { label: "Ast", title: "Assists", game: game.assists, average: averages?.assists },
    {
      label: "Min",
      title: "Minutes",
      game: formatAverage(game.minutes),
      average: averages?.minutes,
    },
  ];
  const table = html`<table class="player-game tabular">
    <thead>
      <tr>
        ${cells.map((cell) => html`<th scope="col" title="${cell.title}">${cell.label}</th>`)}
      </tr>
    </thead>
    <tbody>
      <tr class="player-game-line">
        ${cells.map((cell) => html`<td>${cell.game}</td>`)}
      </tr>
      ${
        averages &&
        html`<tr class="player-average">
        ${cells.map(
          (cell, index) =>
            html`<td>${index === 0 && html`<span class="player-average-label">Avg</span>`}${formatAverage(cell.average ?? 0)}</td>`,
        )}
      </tr>`
      }
    </tbody>
  </table>`;
  const shooting = joinWithSeparator([
    renderCount(`${game.fieldGoalsMade}-${game.fieldGoalsAttempted}`, "FG"),
    renderCount(`${game.threesMade}-${game.threesAttempted}`, "3PT"),
    renderCount(`${game.freeThrowsMade}-${game.freeThrowsAttempted}`, "FT"),
  ]);
  const defense = joinWithSeparator([
    renderCount(game.steals, "STL"),
    renderCount(game.blocks, "BLK"),
  ]);
  return renderSheetPart(
    "Last game",
    html`<div class="player-last-game">
      ${table}
      <div class="player-lines">
        ${renderTeamDetail("Shooting", shooting)}${renderTeamDetail("Defense", defense)}
      </div>
    </div>`,
    describeLastGame(game, now),
  );
}

/**
 * Her points in a playoff game, or DNP for one she didn't play.
 * @param {number | undefined} points
 */
const renderPoints = (points) =>
  points == null
    ? html`<span class="player-points player-dnp">DNP</span>`
    : html`<span class="player-points tabular">${points}<small>Pts</small></span>`;

/**
 * Her team's playoff games with her points in each, and its next while it still plays, under the
 * chip that says how far it has got.
 * @param {Player} player
 * @param {Season | null} season
 * @param {number} now
 */
function renderPlayoffs(player, season, now) {
  const { games, isPlaying, chip, run } = readTeamPlayoffs(season, player.team);
  const next = isPlaying && games.next;
  if (!run || (!games.finished.length && !next)) return false;
  return renderSheetPart(
    "Playoffs",
    html`<div class="team-playoffs">
      ${games.finished.map((game) =>
        renderFinishedGame(game, player.team, () => renderPoints(player.playoffPoints[game.id])),
      )}
      ${next && renderNextGame(next, player.team, now)}
    </div>`,
    renderChip(chip),
  );
}

/**
 * How wide each player's number spreads on the curve, by Silverman's rule of thumb.
 * @param {number[]} values
 */
function measureBandwidth(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return 1.06 * (Math.sqrt(variance) || 1) * values.length ** -0.2;
}

/**
 * The shape of every ranked player's numbers in a stat, smoothed, across the drawing from the
 * lowest to the highest, and where hers sits on it, each as a share of the drawing from 0 to 100.
 * @param {number[]} values from the lowest
 * @param {number} value hers
 */
export function drawSpread(values, value) {
  const low = values[0];
  const high = values.at(-1) ?? low;
  const width = measureBandwidth(values);
  /** @param {number} at */
  const measureDensity = (at) =>
    values.reduce((sum, each) => sum + Math.exp(-0.5 * ((at - each) / width) ** 2), 0);
  const steps = Array.from(
    { length: CURVE_POINTS },
    (_, index) => low + ((high - low) * index) / (CURVE_POINTS - 1),
  );
  const densities = steps.map(measureDensity);
  const tallest = Math.max(...densities);
  /** @param {number} density */
  const placeHeight = (density) =>
    CURVE_HEIGHT - (density / tallest) * (CURVE_HEIGHT - CURVE_HEADROOM);
  const line = densities
    .map(
      (density, index) =>
        `${((index / (CURVE_POINTS - 1)) * CURVE_WIDTH).toFixed(1)},${placeHeight(density).toFixed(1)}`,
    )
    .join(" L");
  return {
    area: `M0,${CURVE_HEIGHT} L${line} L${CURVE_WIDTH},${CURVE_HEIGHT} Z`,
    edge: `M${line}`,
    left: high > low ? ((value - low) / (high - low)) * 100 : 50,
    top: (placeHeight(measureDensity(value)) / CURVE_HEIGHT) * 100,
  };
}

/** @param {RankedStat} stat */
function renderCurve(stat) {
  if (stat.rank == null || stat.value == null || !stat.values.length)
    return html`<span class="player-curve"></span>`;
  const { area, edge, left, top } = drawSpread(stat.values, stat.value);
  const place = `left: ${left.toFixed(1)}%; top: ${top.toFixed(1)}%`;
  return html`<span class="player-curve" aria-hidden="true">
    <svg viewBox="0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}" preserveAspectRatio="none">
      <path class="player-curve-area" d="${area}"></path>
      <path class="player-curve-edge" d="${edge}"></path>
    </svg>
    <i style="${place}"></i><b style="${place}"></b>
  </span>`;
}

/** @param {RankedStat} stat */
const renderRank = (stat) =>
  html`<span class="player-rank">${stat.rank != null && html`<span class="player-rank-place">${formatOrdinal(stat.rank)}</span> of ${stat.count}`}</span>`;

/**
 * Why a stat may have no rank, or why the number ranked varies by stat.
 * @param {RegularSeason} season
 */
export function describeRankNote(season) {
  if (season.stats.every((stat) => stat.rank != null))
    return `The number of ranked players varies by stat because the WNBA only ranks players who've played ${season.gamesNeeded} games or, for shooting percentages, made a certain number of shots`;
  if (season.games < season.gamesNeeded)
    return `Not ranked until she's played ${season.gamesNeeded} games, or for a percentage, made enough shots. She's played ${season.games}.`;
  return "Not ranked in a shooting percentage until she's made enough shots";
}

/**
 * @param {string} team
 * @param {RegularSeason} season
 */
function renderRegularSeason(team, season) {
  const rows = RANKED_STATS.map(({ key, label, isShare }) => {
    const stat = season.stats.find((each) => each.key === key);
    if (!stat) return false;
    return html`<div class="player-rank-row">
      <span class="player-rank-label">${label}</span>
      <span class="player-rank-value tabular">${formatStat(stat.value, isShare)}</span>
      ${renderCurve(stat)}${renderRank(stat)}
    </div>`;
  });
  return renderSheetPart(
    "Regular season",
    html`<div class="player-ranks" style="${formatTeamColors(team)}">
      ${rows}
      <p class="player-rank-note">${describeRankNote(season)}</p>
    </div>`,
    `${season.games} ${season.games === 1 ? "game" : "games"}`,
  );
}

const renderPending = () =>
  renderSheetPart(
    "Last game",
    html`<div class="player-last-game">${renderPlaceholder("Pts Reb Ast Min")}${renderPlaceholder("00 0 0 00.0")}${renderPlaceholder("Avg 00.0 0.0 0.0 00.0")}</div>`,
  );

/**
 * The sheet's parts under her name, or stand-ins while they load, or why they didn't.
 * @param {{ player: Player | null, isLoading: boolean, season: Season | null, isPastSeason: boolean, now: number }} shown
 */
export function renderPlayerBody({ player, isLoading, season, isPastSeason, now }) {
  if (!player && isLoading) return renderPending();
  if (!player)
    return renderSheetMessage("Couldn't load her numbers. Close and try again in a minute.");
  const hasPlayed = !!(player.lastGame || player.regularSeason);
  const noGames = isPastSeason ? "No games this season" : "No games yet this season";
  return html`${hasPlayed ? renderLastGame(player, now) : renderSheetMessage(noGames)}
  ${renderPlayoffs(player, season, now)}
  ${player.regularSeason && renderRegularSeason(player.team, player.regularSeason)}`;
}
