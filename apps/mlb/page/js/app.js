import { renderBracket, watchBracketSpace } from "./bracket-view.js";
import { listRankedOrder } from "./clubs.js";
import { startCatchUpNote } from "#shared/catch-up-note.js";
import { startCaughtUpSweep } from "#shared/caught-up-sweep.js";
import { startPullToRefresh } from "#shared/pull-to-refresh.js";
import { startHomeScreen } from "#shared/home-screen.js";
import { startDiagnostics } from "#shared/diagnostics.js";
import { redrawEased } from "#shared/eased-redraw.js";
import { trackKeyboardFocus } from "#shared/keyboard-focus.js";
import { startGamePager } from "#shared/game-pager.js";
import { keepLastSeen, readLastSeen, reopenLastSheets } from "#shared/last-seen.js";
import { endLoadNote } from "#shared/load-note.js";
import { startNotifications } from "#shared/notifications.js";
import { startPageTabs } from "#shared/page-tabs.js";
import { startGameSheet } from "./game-sheet.js";
import { REORDER_EVENT } from "./ranking.js";
import { renderAll } from "./render.js";
import { reloadIfReplaced, watchReturns } from "#shared/resume.js";
import { startServiceWorker } from "#shared/service-worker.js";
import { keepRanking, watchKeptChoices } from "./kept-on-device.js";
import {
  applyDeferredSeason,
  loadSeason,
  loadSeasonList,
  showYear,
  startSeasonData,
} from "./season-data.js";
import { composeState, session, readSeasonYear } from "./session.js";
import { startSettings } from "./settings.js";
import { renderTeamSheet } from "./team-view.js";
import { TEAMS } from "./teams.js";
import { renderStamp } from "./stamp-view.js";
import { startTeamSheet } from "#shared/team-sheet.js";
import { createWorkerStore } from "#shared/worker-store.js";
import { isReadableSeason } from "#shared/season-reader.js";
import { fillSeasonPicker } from "#shared/season-picker.js";
import { SNAPSHOT_VERSION } from "./snapshot.js";

const CLOCK_REFRESH_MS = 60 * 1000;

const findYearPicker = () => /** @type {HTMLSelectElement} */ (document.getElementById("yearSel"));

async function switchYear(year) {
  await showYear(year);
  if (session.activeYear !== year) return;
  renderAll();
}

async function listYears() {
  const recent = [readSeasonYear(), readSeasonYear() - 1, readSeasonYear() - 2].map(String);
  try {
    return await loadSeasonList();
  } catch {
    return recent;
  }
}

/** @param {string[]} years */
const fillYearPicker = (years) => fillSeasonPicker(findYearPicker(), years, session.activeYear);

// A new current season changes what the stamp says, and the picker lists it.
async function showNewCurrentYear() {
  renderStamp();
  fillYearPicker(await listYears());
}

// Sortable has already moved the dragged card, so redrawing the list keeps it where it was dropped.
function finishReordering(order) {
  session.isReordering = false;
  if (order.join() !== listRankedOrder().join()) keepRanking(session.activeYear, order);
  applyDeferredSeason();
  renderAll();
}

// Another tab's drag or dismissal redraws this one, unless a drag here is still under way.
function showChoicesFromOtherTabs() {
  if (!session.isReordering) redrawEased(renderAll);
}

function wireControls() {
  startPageTabs();
  startGamePager();
  startGameSheet();
  startTeamSheet({
    isTeam: (id) => id in TEAMS,
    renderSheet: (id) => renderTeamSheet(id),
  });
  startSettings();
  startHomeScreen();
  const picker = findYearPicker();
  picker.addEventListener("change", () => switchYear(Number(picker.value)));
  document
    .getElementById("rankList")
    .addEventListener(REORDER_EVENT, (event) =>
      finishReordering(/** @type {CustomEvent} */ (event).detail.order),
    );
}

// The stamp's times, which final is fresh, and the bracket's countdowns to first pitch read the
// clock.
function refreshClockEveryMinute() {
  setInterval(() => {
    try {
      if (session.season) composeState();
      renderStamp();
      renderBracket();
    } catch {
      /* try again next minute */
    }
  }, CLOCK_REFRESH_MS);
}

/** @param {any} shown */
const pickShown = ({ season, trackedTitles }) => ({ season, trackedTitles });

const readShown = () => session.season && { year: session.activeYear, ...pickShown(session) };

// What the page last showed is only a stand-in until the store answers, so what can't be drawn is
// skipped.
function drawLastSeen() {
  const lastSeen = readLastSeen();
  const isShowable =
    !!lastSeen?.season &&
    lastSeen.year === session.activeYear &&
    isReadableSeason(lastSeen.season, SNAPSHOT_VERSION);
  if (!isShowable) return;
  const before = pickShown(session);
  try {
    Object.assign(session, pickShown(lastSeen));
    composeState();
    renderAll();
    endLoadNote();
  } catch {
    Object.assign(session, before);
  }
}

const showNewData = () => redrawEased(renderAll);

async function reloadSeason() {
  await loadSeason();
  showNewData();
}

// A page whose load failed loads its season again.
/** @param {number} awayMs */
function catchUp(awayMs) {
  session.db.catchUp(awayMs);
  if (session.problem) reloadSeason();
  else if (!session.isReordering) showNewData();
}

// The season the store and MLB answer with eases in over the one the page last showed.
function drawLoadedSeason() {
  renderAll();
  endLoadNote();
}

async function boot() {
  startDiagnostics();
  watchReturns({ isBusy: () => session.isReordering, catchUp, pause: () => session.db.pause() });
  trackKeyboardFocus();
  wireControls();
  session.db = createWorkerStore();
  drawLastSeen();
  reopenLastSheets();
  startCatchUpNote(session.db, renderStamp);
  startCaughtUpSweep(session.db, document.getElementById("stamp"));
  startPullToRefresh({ store: session.db, catchUp });
  keepLastSeen(readShown);
  startSeasonData({
    showChange: showNewData,
    showStamp: () => redrawEased(renderStamp),
    showCurrentYear: showNewCurrentYear,
    showUnreadable: reloadIfReplaced,
  });
  const [years] = await Promise.all([listYears(), loadSeason()]);
  fillYearPicker(years);
  redrawEased(drawLoadedSeason);
  watchKeptChoices(showChoicesFromOtherTabs);
  watchBracketSpace();
  refreshClockEveryMinute();
  startServiceWorker();
  startNotifications();
}

boot();
