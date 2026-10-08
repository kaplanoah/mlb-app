import { renderCatchUpLines, startCatchUpNote } from "#shared/catch-up-note.js";
import { startCaughtUpSweep } from "#shared/caught-up-sweep.js";
import { startPullToRefresh } from "#shared/pull-to-refresh.js";
import { startHomeScreen } from "#shared/home-screen.js";
import { setHtml } from "#shared/html.js";
import { showJobStatuses, startDiagnostics } from "#shared/diagnostics.js";
import { redrawEased } from "#shared/eased-redraw.js";
import { trackKeyboardFocus } from "#shared/keyboard-focus.js";
import {
  chooseStartList,
  fillGameLists,
  startGamePager,
  startGamesOn,
} from "#shared/game-pager.js";
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
import { chooseTitleYear, showTitleYear } from "#shared/title-year.js";
import { createWorkerStore } from "#shared/worker-store.js";
import { startAppearance } from "./appearance.js";
import { placeBracket, readBracketScroll, startBracket } from "./bracket-tree.js";
import { renderBracket } from "./bracket-view.js";
import { refreshGameSheet, startGameSheet } from "./game-sheet.js";
import { findListsWithGames, renderGames } from "./games-view.js";
import { readNewsChoices, startNewsChoices } from "./news-choices.js";
import { watchNews } from "./news-data.js";
import { renderNews } from "./news-view.js";
import { readOpenedStories, startOpenedStories } from "./opened-stories.js";
import { refreshPlayerSheet, startPlayerSheet } from "./player-sheet.js";
import { fillRoster, readShownRoster, reopenRoster, startRosterSection } from "./roster-section.js";
import { loadSeason, loadSeasonYears, showYear, startSeasonData } from "./season-data.js";
import { isPastSeason, session } from "./session.js";
import { SNAPSHOT_VERSION } from "./snapshot.js";
import { isPlayoffsOver } from "./series.js";
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
  const cards = session.news?.cards ?? [];
  const columnCount = wideScreen.matches ? 2 : 1;
  const opened = readOpenedStories();
  setHtml(
    findElement("newsList"),
    renderNews(cards, readNewsChoices(), Date.now(), { columnCount, opened }),
  );
}

function renderTitleYear() {
  const { year: shownYear, currentYear } = session;
  const isSeasonOver = isPlayoffsOver(session.season?.series ?? []);
  showTitleYear(chooseTitleYear({ shownYear, currentYear, isSeasonOver }));
}

function renderAll() {
  const now = Date.now();
  const keptLeft = readBracketScroll();
  setHtml(findElement("bracketWrap"), renderBracket(session.season, now));
  placeBracket(keptLeft);
  const gameLists = renderGames(session.season, now);
  fillGameLists((list) => gameLists[list], chooseGamesStart(now));
  drawStandings(session.season);
  drawNews();
  drawUpdates();
  renderTitleYear();
  renderStamp();
  refreshGameSheet();
  refreshTeamSheet();
  refreshPlayerSheet();
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

// News the page can't read from its last showing leaves the view as it was until the store answers.
const readLastSeenNews = (news) => (news === null || Array.isArray(news?.cards) ? news : undefined);

// The season the page last showed is only a stand-in until the store answers, so one that can't
// be drawn is skipped.
function drawLastSeen() {
  const lastSeen = readLastSeen();
  if (!lastSeen?.season || !isReadableSeason(lastSeen.season, SNAPSHOT_VERSION)) return;
  const { year, season, news } = session;
  try {
    Object.assign(session, {
      year: lastSeen.year,
      season: lastSeen.season,
      news: readLastSeenNews(lastSeen.news),
    });
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

// A past season has no games today or ahead, so its Games view starts on its results.
const chooseGamesStart = (now) =>
  chooseStartList({ isSeasonOver: isPastSeason(), ...findListsWithGames(session.season, now) });

const startGamesForSeason = () => startGamesOn(chooseGamesStart(Date.now()));

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
  startTeamSheet({
    isTeam: (team) => team in TEAMS,
    renderSheet: renderShownTeam,
    fillSections: fillRoster,
    sectionsKeeper: { read: readShownRoster, reopen: reopenRoster },
  });
  startRosterSection();
  startPlayerSheet();
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
  showJobStatuses(session.db, ["news", "players"]);
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
