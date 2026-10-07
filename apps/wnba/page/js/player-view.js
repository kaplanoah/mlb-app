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
import { formatMarkColors } from "./sheet-colors.js";
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
 * @property {number} [turnovers] missing from a game the store saved before it kept them
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

// A shooting percentage is a share, of the shots `shots` names. Turnovers rank from the fewest,
// so their curve runs from the most to the fewest, and her mark sits further right the better she
// ranks, as on every other row.
/** @type {{ key: string, label: string, isShare?: boolean, shots?: string, isFewestFirst?: boolean }[]} */
const RANKED_STATS = [
  { key: "points", label: "Pts" },
  { key: "rebounds", label: "Reb" },
  { key: "assists", label: "Ast" },
  { key: "steals", label: "Stl" },
  { key: "blocks", label: "Blk" },
  { key: "turnovers", label: "TO", isFewestFirst: true },
  { key: "fieldGoalShare", label: "FG%", isShare: true, shots: "field goals" },
  { key: "threeShare", label: "3P%", isShare: true, shots: "3-pointers" },
  { key: "freeThrowShare", label: "FT%", isShare: true, shots: "free throws" },
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
 * Her position, height, age, and first season, each under its label, leaving out any the league
 * doesn't have.
 * @param {Player | null} player
 * @param {boolean} isLoading
 */
export function renderPlayerFacts(player, isLoading) {
  if (!player)
    return (
      isLoading &&
      html`<div class="player-facts">${renderPlaceholder("Position 0'0\" 00 0000")}</div>`
    );
  const facts = player.facts;
  /** @type {[string, string | number | null | undefined][]} */
  const cells = [
    ["Position", describePosition(facts?.position ?? null)],
    ["Height", facts?.height],
    ["Age", facts?.age],
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
 * them, then how she shot, what she took away, and what she gave away.
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
  const turnovers =
    game.turnovers != null &&
    renderTeamDetail(
      "Turnovers",
      html`<span class="player-count tabular">${game.turnovers}</span>`,
    );
  return renderSheetPart(
    "Last game",
    html`<div class="player-last-game">
      ${table}
      <div class="player-lines">
        ${renderTeamDetail("Shooting", shooting)}${renderTeamDetail("Defense", defense)}${turnovers}
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
 * lowest to the highest, or the other way round when the fewest ranks first, and where hers sits
 * on it, each as a share of the drawing from 0 to 100.
 * @param {number[]} values from the lowest
 * @param {number} value hers
 * @param {boolean} [isFewestFirst]
 */
export function drawSpread(values, value, isFewestFirst = false) {
  const low = values[0];
  const high = values.at(-1) ?? low;
  const width = measureBandwidth(values);
  /** @param {number} at */
  const measureDensity = (at) =>
    values.reduce((sum, each) => sum + Math.exp(-0.5 * ((at - each) / width) ** 2), 0);
  /** @param {number} share of the drawing's width, from 0 to 1 */
  const placeShare = (share) => (isFewestFirst ? 1 - share : share);
  const steps = Array.from({ length: CURVE_POINTS }, (_, index) => {
    const share = placeShare(index / (CURVE_POINTS - 1));
    return low + (high - low) * share;
  });
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
    left: high > low ? placeShare((value - low) / (high - low)) * 100 : 50,
    top: (placeHeight(measureDensity(value)) / CURVE_HEIGHT) * 100,
  };
}

/**
 * @param {RankedStat} stat
 * @param {boolean} [isFewestFirst]
 */
function renderCurve(stat, isFewestFirst) {
  if (stat.rank == null || stat.value == null || !stat.values.length)
    return html`<span class="player-curve"></span>`;
  const { area, edge, left, top } = drawSpread(stat.values, stat.value, isFewestFirst);
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
 * The shooting percentages she has no rank in, in the sheet's order.
 * @param {RegularSeason} season
 */
const listUnrankedShares = (season) =>
  RANKED_STATS.filter(
    ({ key, isShare }) =>
      isShare && season.stats.some((stat) => stat.key === key && stat.rank == null),
  );

/**
 * Words joined as either one, as "3-pointers or free throws".
 * @param {string[]} words
 */
const listEither = (words) => new Intl.ListFormat("en", { type: "disjunction" }).format(words);

/**
 * Why a stat may have no rank, or why the number ranked varies by stat.
 * @param {RegularSeason} season
 * @param {boolean} isPastSeason
 */
export function describeRankNote(season, isPastSeason) {
  if (season.stats.every((stat) => stat.rank != null))
    return `The number of ranked players varies by stat because the WNBA only ranks players who've played ${season.gamesNeeded} games or, for shooting percentages, made a certain number of shots`;
  if (season.games < season.gamesNeeded)
    return `The WNBA only ranks players who've played ${season.gamesNeeded} games or, for shooting percentages, made a certain number of shots. She's played ${season.games} ${season.games === 1 ? "game" : "games"}.`;
  const unranked = listUnrankedShares(season);
  const shots = listEither(unranked.map((stat) => stat.shots ?? ""));
  const shares = listEither(unranked.map((stat) => stat.label));
  const shortfall = isPastSeason
    ? `She didn't make enough ${shots} to be ranked in ${shares}.`
    : `She hasn't made enough ${shots} to be ranked in ${shares}.`;
  return `${shortfall} The WNBA only ranks shooting percentages for players who've made a certain number of shots.`;
}

/**
 * @param {string} team
 * @param {RegularSeason} season
 * @param {boolean} isPastSeason
 */
function renderRegularSeason(team, season, isPastSeason) {
  const shown = RANKED_STATS.filter(({ key }) => season.stats.some((each) => each.key === key));
  const rows = shown.map(({ key, label, isShare, isFewestFirst }) => {
    const stat = /** @type {RankedStat} */ (season.stats.find((each) => each.key === key));
    return html`<div class="player-rank-row">
      <span class="player-rank-label">${label}</span>
      <span class="player-rank-value tabular">${formatStat(stat.value, isShare)}</span>
      ${renderCurve(stat, isFewestFirst)}${renderRank(stat)}
    </div>`;
  });
  const isRankedInTurnovers = season.stats.some(
    (stat) => stat.key === "turnovers" && stat.rank != null,
  );
  return renderSheetPart(
    "Regular season",
    html`<div class="player-ranks" style="${formatMarkColors(team)}">
      ${rows}
      <div class="player-rank-notes">
        ${isRankedInTurnovers && html`<p class="player-rank-note">Turnovers ranked by fewest</p>`}
        <p class="player-rank-note">${describeRankNote(season, isPastSeason)}</p>
      </div>
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
  ${player.regularSeason && renderRegularSeason(player.team, player.regularSeason, isPastSeason)}`;
}
