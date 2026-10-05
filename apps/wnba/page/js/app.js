import { renderCatchUpLines, startCatchUpNote } from "#shared/catch-up-note.js";
import { startCaughtUpSweep } from "#shared/caught-up-sweep.js";
import { startPullToRefresh } from "#shared/pull-to-refresh.js";
import { startHomeScreen } from "#shared/home-screen.js";
import { setHtml } from "#shared/html.js";
import { startDiagnostics } from "#shared/diagnostics.js";
import { redrawEased } from "#shared/eased-redraw.js";
import { trackKeyboardFocus } from "#shared/keyboard-focus.js";
import { fillGameLists, startGamePager, startGamesOn } from "#shared/game-pager.js";
import { keepLastSeen, readLastSeen, reopenLastSheets } from "#shared/last-seen.js";
import { endLoadNote } from "#shared/load-note.js";
import { startNotifications } from "#shared/notifications.js";
import { startPageTabs } from "#shared/page-tabs.js";
import { reloadIfReplaced, watchReturns } from "#shared/resume.js";
import { fillSeasonPicker } from "#shared/season-picker.js";
import { isReadableSeason } from "#shared/season-reader.js";
import { startServiceWorker } from "#shared/service-worker.js";
import { startSettingsSheet } from "#shared/settings-sheet.js";
import { refreshTeamSheet, startTeamSheet } from "#shared/team-sheet.js";
import { fillStamp } from "#shared/stamp.js";
import { createWorkerStore } from "#shared/worker-store.js";
import { startAppearance } from "./appearance.js";
import { placeBracket, readBracketScroll, startBracket } from "./bracket-tree.js";
import { renderBracket } from "./bracket-view.js";
import { refreshGameSheet, startGameSheet } from "./game-sheet.js";
import { renderGames } from "./games-view.js";
import { readNewsChoices, startNewsChoices } from "./news-choices.js";
import { watchNews } from "./news-data.js";
import { renderNews } from "./news-view.js";
import { readOpenedStories, startOpenedStories } from "./opened-stories.js";
import { loadSeason, loadSeasonYears, showYear, startSeasonData } from "./season-data.js";
import { isPastSeason, session } from "./session.js";
import { SNAPSHOT_VERSION } from "./snapshot.js";
import { describeStampProblem, renderStampLines } from "./stamp.js";
import { drawStandings, startStandings } from "./standings-view.js";
import { renderTeamSheet } from "./team-view.js";
import { TEAMS } from "./teams.js";
import { drawUpdates, watchDismissals } from "./updates.js";

const CLOCK_REFRESH_MS = 60 * 1000;
// A wide screen shows the news in two columns.
const wideScreen = matchMedia("(min-width: 900px)");

const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// The store's status is about the current season's updates, so a past season's page leaves it out.
function renderStamp() {
  const problem = describeStampProblem({
    status: isPastSeason() ? null : session.status,
    problem: session.problem,
  });
  const lines = renderStampLines(session.season, Date.now());
  fillStamp(findElement("stamp"), [...renderCatchUpLines(), ...lines], problem ? [problem] : []);
}

// Until the store or the page's last showing says what the news is, the view keeps what it was.
function drawNews() {
  if (session.news === undefined) return;
  const topics = session.news?.topics ?? [];
  const columnCount = wideScreen.matches ? 2 : 1;
  const opened = readOpenedStories();
  setHtml(
    findElement("newsList"),
    renderNews(topics, readNewsChoices(), Date.now(), { columnCount, opened }),
  );
}

function renderAll() {
  const now = Date.now();
  const keptLeft = readBracketScroll();
  setHtml(findElement("bracketWrap"), renderBracket(session.season, now));
  placeBracket(keptLeft);
  const gameLists = renderGames(session.season, now);
  fillGameLists((list) => gameLists[list]);
  drawStandings(session.season);
  drawNews();
  drawUpdates();
  renderStamp();
  refreshGameSheet();
  refreshTeamSheet();
}

// What new data changes eases in, as does the season the store answers with after the one the page
// last showed.
const showNewData = () => redrawEased(renderAll);

function drawLoadedSeason() {
  renderAll();
  endLoadNote();
}

// Times read as today or tomorrow, so they're redrawn as the clock moves on.
function refreshClockEveryMinute() {
  setInterval(renderAll, CLOCK_REFRESH_MS);
}

// The season the page last showed is only a stand-in until the store answers, so one that can't
// be drawn is skipped.
function drawLastSeen() {
  const lastSeen = readLastSeen();
  if (!lastSeen?.season || !isReadableSeason(lastSeen.season, SNAPSHOT_VERSION)) return;
  const { year, season, news } = session;
  try {
    Object.assign(session, { year: lastSeen.year, season: lastSeen.season, news: lastSeen.news });
    renderAll();
    endLoadNote();
  } catch {
    Object.assign(session, { year, season, news });
  }
}

/** @param {string} team */
const renderShownTeam = (team) =>
  renderTeamSheet(session.season, team, { year: session.year, now: Date.now() });

const readShown = () =>
  session.season && { year: session.year, season: session.season, news: session.news };

const findSeasonPicker = () => /** @type {HTMLSelectElement} */ (findElement("seasonPicker"));

async function listSeasonYears() {
  try {
    return await loadSeasonYears();
  } catch {
    return [];
  }
}

/** @param {string[]} years */
const fillSeasonList = (years) => fillSeasonPicker(findSeasonPicker(), years, session.year);

// A season that's over has no games today or ahead, so its Games view starts on its results.
const startGamesForSeason = () => startGamesOn(isPastSeason() ? "previous" : "today");

/** @param {number} year */
async function switchSeason(year) {
  await showYear(year);
  startGamesForSeason();
  renderAll();
}

// A new current season changes what the header says, and the picker lists it.
async function showNewCurrentYear() {
  startGamesForSeason();
  renderAll();
  fillSeasonList(await listSeasonYears());
}

async function reloadSeason() {
  await loadSeason();
  showNewData();
}

/** @param {number} awayMs */
function catchUp(awayMs) {
  session.db.catchUp(awayMs);
  if (session.problem) reloadSeason();
  else showNewData();
}

async function boot() {
  startDiagnostics();
  startAppearance();
  watchReturns({ catchUp, pause: () => session.db.pause() });
  trackKeyboardFocus();
  startPageTabs();
  startGamePager();
  startGameSheet();
  startTeamSheet({ isTeam: (team) => team in TEAMS, renderSheet: renderShownTeam });
  startSettingsSheet();
  startNewsChoices(drawNews);
  startOpenedStories(findElement("newsList"), drawNews);
  wideScreen.addEventListener("change", drawNews);
  startHomeScreen();
  findSeasonPicker().addEventListener("change", () =>
    switchSeason(Number(findSeasonPicker().value)),
  );
  startBracket();
  startStandings();
  session.db = createWorkerStore();
  drawLastSeen();
  reopenLastSheets();
  startCatchUpNote(session.db, renderStamp);
  startCaughtUpSweep(session.db, findElement("stamp"));
  startPullToRefresh({ store: session.db, catchUp });
  keepLastSeen(readShown);
  startSeasonData({
    showChange: showNewData,
    showStamp: renderStamp,
    showCurrentYear: showNewCurrentYear,
    showUnreadable: reloadIfReplaced,
  });
  const [years] = await Promise.all([listSeasonYears(), loadSeason()]);
  fillSeasonList(years);
  redrawEased(drawLoadedSeason);
  watchNews(() => redrawEased(drawNews));
  watchDismissals(() => redrawEased(drawUpdates));
  refreshClockEveryMinute();
  startServiceWorker();
  startNotifications({ about: "Post-season game final scores" });
}

boot();
