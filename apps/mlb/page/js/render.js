import { chooseTitleYear, showTitleYear } from "#shared/title-year.js";
import { buildBracket } from "./bracket.js";
import { renderBracket } from "./bracket-view.js";
import { renderGames } from "./games-view.js";
import { renderRanking } from "./ranking.js";
import { session } from "./session.js";
import { renderStamp } from "./stamp-view.js";
import { renderStandings } from "./standings.js";
import { refreshTeamSheet } from "#shared/team-sheet.js";
import { renderUpdates } from "./updates.js";

const isSeasonOver = () => !!session.state && !!buildBracket(session.state).ws?.winner;

function renderTitleYear() {
  const shownYear = session.activeYear;
  showTitleYear(
    chooseTitleYear({ shownYear, currentYear: session.currentSeason, isSeasonOver: isSeasonOver() }),
  );
}

export function renderAll() {
  renderStamp();
  renderUpdates();
  renderBracket();
  renderGames();
  renderStandings();
  renderRanking();
  renderTitleYear();
  refreshTeamSheet();
}
