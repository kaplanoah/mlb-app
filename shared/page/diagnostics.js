// While Diagnostics is on in settings, each open of the page, each return to it, and each tap on
// Record records what the page draws in its first seconds: what the store sends, and how much
// each part it draws whole (each `data-last-drawn` element) shows, frame by frame. The last few
// records stay on this device. Once a record on request ends, its button shares them as a report
// on a phone or tablet, or copies it on a computer, after a header that names the release, the
// device, the page's state, and how each of the store's background jobs last ran, and before the logs of the viewport's changes (viewport-log.js)
// and of what each dialog's row of sheets does (sheet-log.js). It records nothing while it's off,
// which it starts as.

import {
  formatClockTime,
  formatClockTimeWithSeconds,
  formatWeekdayAndDate,
  nameDay,
} from "./days.js";
import { isOnHomeScreen, isTouchDevice } from "./device.js";
import { html, joinWithSeparator, setHtml } from "./html.js";
import { describeAnimations, describeShownDayLists, describeShownPagers } from "./pager-log.js";
import { loadRelease } from "./release.js";
import { watchTimeAway } from "./resume.js";
import { listSheetsInOpenDialogs } from "./sheet-reopen.js";
import {
  forgetSheetLines,
  readSheetLines,
  watchSheets,
  writeSheetLinesAsText,
} from "./sheet-log.js";
import {
  forgetViewportLines,
  readViewportLines,
  watchViewport,
  writeViewportAsText,
} from "./viewport-log.js";

const SWITCH_KEY = "diagnostics";
const RECORDS_KEY = "diagnosticsRecords";
const RECORD_MS = 5000;
const SECOND_MS = 1000;
const KEPT_RECORDS = 5;
// A part whose text shrinks by more than this share dipped, which is what a flicker looks like.
const DIP_SHARE = 0.25;
const MINUTE_MS = 60 * 1000;
// The report button says it copied or shared the report for this long, then offers to record again.
const SENT_MS = 2000;
const ON_REQUEST = "On request";

/** @typedef {{ ms: number, text: string, isDip?: boolean }} RecordLine */
/** @typedef {"ready" | "copied" | "shared"} ReportStep */
/** @typedef {{ at: number, how: string, tab: string, lines: RecordLine[] }} OpenRecord */
/** @typedef {{ text: number, height: number }} PartSize */
/**
 * @typedef {{
 *   appName: string,
 *   release: import("./release.js").Release | null,
 *   userAgent: string,
 *   isOnHomeScreen: boolean,
 *   width: number,
 *   height: number,
 *   pixelRatio: number,
 *   prefersReducedMotion: boolean,
 *   theme: string | undefined,
 *   timeZone: string,
 *   openedAt: number,
 *   returns: number,
 *   jobs: JobStatus[],
 *   now: Date,
 * }} PageFacts
 */
/**
 * A background job's status document, as the store last answered for it, or null when it
 * couldn't be read, with how often a sheet read the league for what the job should have kept, for
 * a job that counts it.
 * @typedef {{
 *   name: string,
 *   status:
 *     | Partial<import("../worker/job-status.js").JobRunStatus & { leagueReads: number }>
 *     | null
 *     | undefined,
 * }} JobStatus
 */

/** @type {OpenRecord | null} */
let record = null;
let recordStartedAt = 0;
/** @type {Map<string, PartSize>} */
let shownSizes = new Map();
/** @type {ReportStep | null} */
let reportStep = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let reportTimer;
let shownSecondsLeft = 0;
const openedAt = Date.now();
let returns = 0;
/** @type {import("./release.js").Release | null} */
let release = null;
/** @type {(() => Promise<JobStatus[]>) | null} */
let readJobStatuses = null;
/** @type {JobStatus[]} */
let jobStatuses = [];

const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// Storage can be empty or refuse access, as in a private window, so the page never depends on it.

function isRecording() {
  try {
    return localStorage.getItem(SWITCH_KEY) === "on";
  } catch {
    return false;
  }
}

/** @returns {OpenRecord[]} */
function readRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

/** @param {OpenRecord[]} records */
function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(-KEPT_RECORDS)));
  } catch {
    /* the record is lost, and the next one tries again */
  }
}

/** @param {boolean} isOn */
function saveSwitch(isOn) {
  try {
    if (isOn) localStorage.setItem(SWITCH_KEY, "on");
    else {
      localStorage.removeItem(SWITCH_KEY);
      localStorage.removeItem(RECORDS_KEY);
      forgetViewportLines();
      forgetSheetLines();
    }
  } catch {
    /* the switch stays as it was */
  }
}

/**
 * Adds a step that happened at `at`, on the page's performance clock, to the record under way, if
 * there is one.
 * @param {number} at
 * @param {string} text
 * @param {boolean} [isDip]
 */
function noteStepAt(at, text, isDip = false) {
  if (!record) return;
  record.lines.push({ ms: Math.round(at - recordStartedAt), text, isDip });
}

/**
 * Adds a step to the record under way, if there is one.
 * @param {string} text
 * @param {boolean} [isDip]
 */
export function noteStep(text, isDip = false) {
  noteStepAt(performance.now(), text, isDip);
}

function readPartSizes() {
  const parts = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-last-drawn]")]);
  return new Map(
    parts.map((part) => [
      part.id,
      {
        text: (part.textContent ?? "").replace(/\s+/g, "").length,
        height: Math.round(part.getBoundingClientRect().height),
      },
    ]),
  );
}

/**
 * @param {string} id
 * @param {PartSize} before
 * @param {PartSize} after
 */
function describeChange(id, before, after) {
  const changes = [
    before.text !== after.text && `text ${before.text} to ${after.text}`,
    before.height !== after.height && `height ${before.height} to ${after.height}px`,
  ].filter(Boolean);
  return `${id}: ${changes.join(", ")}`;
}

/** @param {Map<string, PartSize>} sizes */
const describeSizes = (sizes) =>
  [...sizes].map(([id, size]) => `${id} ${size.text}/${size.height}px`).join(", ");

/**
 * @param {PartSize} before
 * @param {PartSize} after
 */
const isDip = (before, after) => after.text < before.text * (1 - DIP_SHARE);

function noteChangedParts() {
  const sizes = readPartSizes();
  for (const [id, after] of sizes) {
    const before = shownSizes.get(id);
    if (!before || (before.text === after.text && before.height === after.height)) continue;
    noteStep(describeChange(id, before, after), isDip(before, after));
  }
  shownSizes = sizes;
}

// Steps the browser reports late, like the first paint, go back among the others by when they happened.
/** @param {OpenRecord} openRecord */
const sortLines = (openRecord) => ({
  ...openRecord,
  lines: openRecord.lines.toSorted((first, second) => first.ms - second.ms),
});

function finishRecord() {
  if (!record) return;
  if (record.how === ON_REQUEST) reportStep = "ready";
  saveRecords([...readRecords(), sortLines(record)]);
  record = null;
  drawRecords();
}

/**
 * The records kept, and the one under way, newest first.
 * @returns {OpenRecord[]}
 */
const listRecords = () => [...readRecords(), ...(record ? [sortLines(record)] : [])].toReversed();

/**
 * The whole seconds a record still has to run, counting the one under way.
 * @param {number} elapsedMs
 */
export const countSecondsLeft = (elapsedMs) =>
  Math.max(0, Math.ceil((RECORD_MS - elapsedMs) / SECOND_MS));

function drawCountdown() {
  if (record?.how !== ON_REQUEST) return;
  const secondsLeft = countSecondsLeft(performance.now() - recordStartedAt);
  if (secondsLeft === shownSecondsLeft) return;
  shownSecondsLeft = secondsLeft;
  drawRecords();
}

function sampleParts() {
  if (!record) return;
  noteChangedParts();
  drawCountdown();
  if (performance.now() - recordStartedAt < RECORD_MS) requestAnimationFrame(sampleParts);
  else {
    for (const line of [...describeShownPagers(), ...describeShownDayLists()]) noteStep(line);
    noteStep(describeAnimations());
    finishRecord();
  }
}

const PAINT_NAMES = {
  "first-paint": "First paint",
  "first-contentful-paint": "First contentful paint",
};

/** @param {string} url */
const readFileName = (url) => new URL(url, location.href).pathname.split("/").pop() ?? "";

/** @param {PerformanceEntry} entry */
const isFontFile = (entry) => readFileName(entry.name).endsWith(".woff2");

// A font file that arrives after the first paint swaps out the stand-in font its text was drawn in.
/** @param {PerformanceEntry} entry */
function noteTiming(entry) {
  if (entry.entryType === "paint")
    noteStepAt(entry.startTime, PAINT_NAMES[entry.name] ?? entry.name);
  else if (isFontFile(entry))
    noteStepAt(
      /** @type {PerformanceResourceTiming} */ (entry).responseEnd,
      `Font ${readFileName(entry.name)} arrived`,
    );
}

// The page's first paints and font files can come before its modules run, so the record takes
// those the browser already has too.
function watchTimings() {
  if (typeof PerformanceObserver === "undefined") return;
  const observer = new PerformanceObserver((list) => list.getEntries().forEach(noteTiming));
  for (const type of ["paint", "resource"]) observer.observe({ type, buffered: true });
}

const readShownTab = () =>
  document.querySelector("nav.tabs [role=tab][aria-selected=true]")?.textContent?.trim() ?? "";

/**
 * A line for each sheet in an open dialog's row, saying which one its dialog shows.
 * @param {{ id: string, isShown: boolean }[]} sheets
 * @returns {string[]}
 */
export const describeOpenSheets = (sheets) =>
  sheets.length
    ? sheets.map(({ id, isShown }) => `Sheet ${id}${isShown ? ", shown" : ""}`)
    : ["No sheets open"];

/** @param {string} how */
function startRecord(how) {
  finishRecord();
  if (!isRecording()) return;
  record = { at: Date.now(), how, tab: readShownTab(), lines: [] };
  recordStartedAt = performance.now();
  shownSizes = readPartSizes();
  if (how === ON_REQUEST) {
    for (const line of describeOpenSheets(listSheetsInOpenDialogs())) noteStep(line);
  }
  noteStep(`Shows ${describeSizes(shownSizes)}`);
  requestAnimationFrame(sampleParts);
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * @param {number} awayMs
 * @returns {string}
 */
export const describeTimeAway = (awayMs) => `Back after ${formatDuration(awayMs)}`;

/**
 * The device and browser a user agent names: an iPhone's or iPad's model, Safari version, WebKit
 * build, and the iOS version Safari reports, or the user agent itself for any other. Safari stopped
 * moving its reported iOS version past 18, so the Safari version is what tells a newer iOS apart.
 * @param {string} userAgent
 * @returns {string}
 */
export function describeDevice(userAgent) {
  const ios = /(iPhone|iPad|iPod).*? OS (\d+(?:_\d+)*)/.exec(userAgent);
  if (!ios) return userAgent;
  const safari = /Version\/([\d.]+)/.exec(userAgent);
  const webKit = /AppleWebKit\/([\d.]+)/.exec(userAgent);
  return [
    ios[1],
    safari && `Safari ${safari[1]}`,
    webKit && `WebKit ${webKit[1]}`,
    `reports iOS ${ios[2].replaceAll("_", ".")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** @param {{ appName: string, release: import("./release.js").Release | null }} facts */
function describeRelease({ appName, release: shown }) {
  if (!shown) return `${appName}, release unknown`;
  return [appName, shown.version && `v${shown.version}`, `commit ${shown.commit}`]
    .filter(Boolean)
    .join(" ");
}

/** @param {Date} date */
const formatMoment = (date) => `${formatWeekdayAndDate(date)} ${formatClockTimeWithSeconds(date)}`;

/** @param {number} count */
const countTimes = (count) => (count === 1 ? "1 time" : `${count} times`);

/** @param {number} count */
const countRequests = (count) => (count === 1 ? "1 request" : `${count} requests`);

/** @param {string} name */
const capitalize = (name) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * One line on a background job's last run, from the status document it saves.
 * @param {JobStatus} job
 * @returns {string}
 */
export function describeJobStatus({ name, status }) {
  const job = `${capitalize(name)} job`;
  if (status === null) return `${job}: status couldn't be read`;
  if (!status?.ranAt) return `${job}: no run saved`;
  const { lastFailure } = status;
  return [
    `${job} last ran ${formatMoment(new Date(status.ranAt))}`,
    countRequests(status.requests ?? 0),
    Number.isInteger(status.leagueReads) &&
      `sheets read the league ${countTimes(Number(status.leagueReads))}`,
    lastFailure && `last failed ${formatMoment(new Date(lastFailure.at))}: ${lastFailure.message}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The lines that open the report, saying which release, on what device, in what state.
 * @param {PageFacts} facts
 * @returns {string}
 */
export const writeHeader = (facts) =>
  [
    describeRelease(facts),
    `Device: ${describeDevice(facts.userAgent)}`,
    facts.isOnHomeScreen ? "Runs from the Home Screen" : "Runs in the browser",
    `Viewport ${facts.width}x${facts.height} at ${facts.pixelRatio}x`,
    `Reduced motion ${facts.prefersReducedMotion ? "on" : "off"}`,
    facts.theme && `Theme ${facts.theme}`,
    `Opened ${formatMoment(new Date(facts.openedAt))}, ${formatDuration(facts.now.getTime() - facts.openedAt)} ago`,
    `Back from the background ${countTimes(facts.returns)} since`,
    `Now ${formatMoment(facts.now)}, ${facts.timeZone}`,
    ...facts.jobs.map(describeJobStatus),
  ]
    .filter(Boolean)
    .join("\n");

/** @returns {PageFacts} */
const readPageFacts = () => ({
  appName:
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content") ??
    document.title,
  release,
  userAgent: navigator.userAgent,
  isOnHomeScreen: isOnHomeScreen(),
  width: innerWidth,
  height: innerHeight,
  pixelRatio: devicePixelRatio,
  prefersReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  theme: document.documentElement.dataset.theme,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  openedAt,
  returns,
  jobs: jobStatuses,
  now: new Date(),
});

// A report started on request names how the jobs stand by the time its record ends.
function refreshJobStatuses() {
  readJobStatuses?.().then((read) => {
    jobStatuses = read;
  });
}

/**
 * Has the report name how each of the store's background jobs last ran, from the status document
 * each saves as `<name>/status`, read as Diagnostics starts recording and as each record on
 * request starts.
 * @param {{ doc: (path: string) => { get: () => Promise<{ data: () => any }> } }} store
 * @param {string[]} names
 */
export function showJobStatuses(store, names) {
  readJobStatuses = () =>
    Promise.all(
      names.map(async (name) => {
        try {
          return { name, status: (await store.doc(`${name}/status`).get()).data() };
        } catch {
          return { name, status: null };
        }
      }),
    );
  if (isRecording()) refreshJobStatuses();
}

/**
 * @param {string | undefined} navigationType a PerformanceNavigationTiming's type
 * @returns {string}
 */
export const describeLoad = (navigationType) =>
  navigationType === "reload" ? "Reloaded" : "Opened";

function readNavigationType() {
  const [navigation] = /** @type {PerformanceNavigationTiming[]} */ (
    performance.getEntriesByType("navigation")
  );
  return navigation?.type;
}

/** @param {OpenRecord} openRecord */
const hasDip = (openRecord) => openRecord.lines.some((line) => line.isDip);

/**
 * @param {OpenRecord} openRecord
 * @param {Date} now
 */
function describeWhen(openRecord, now) {
  const at = new Date(openRecord.at);
  return `${nameDay(at, now, { isCapitalized: true })} ${formatClockTime(at)}`;
}

/**
 * @param {OpenRecord} openRecord
 * @param {Date} now
 */
const describeRecord = (openRecord, now) =>
  [describeWhen(openRecord, now), openRecord.how, openRecord.tab].filter(Boolean);

/**
 * How long after its record started a step came, or before it, like a paint before the page's
 * modules ran.
 * @param {number} ms
 */
const formatStepTime = (ms) => (ms < 0 ? String(ms) : `+${ms}`);

/**
 * @param {OpenRecord[]} records newest first
 * @param {Date} now
 * @returns {string}
 */
export const writeRecordsAsText = (records, now) =>
  records
    .map((openRecord) =>
      [
        describeRecord(openRecord, now).join(", ") + (hasDip(openRecord) ? " (dip)" : ""),
        ...openRecord.lines.map((line) => `${formatStepTime(line.ms)} ${line.text}`),
      ].join("\n"),
    )
    .join("\n\n");

/** @param {RecordLine} line */
const renderLine = (line) =>
  html`<li class="${line.isDip ? "diagnostics-dip" : ""}">
    <span class="diagnostics-ms">${formatStepTime(line.ms)}</span><span>${line.text}</span>
  </li>`;

/**
 * @param {OpenRecord} openRecord
 * @param {number} index
 */
const renderRecord = (openRecord, index) =>
  html`<details class="diagnostics-record" ${index === 0 ? "open" : ""}>
    <summary>
      <span class="diagnostics-when"
        >${joinWithSeparator(describeRecord(openRecord, new Date()))}</span
      >
      <span class="diagnostics-flag ${hasDip(openRecord) ? "dip" : ""}"
        >${hasDip(openRecord) ? "Dip" : "Steady"}</span
      >
    </summary>
    <ol class="diagnostics-lines">
      ${openRecord.lines.map(renderLine)}
    </ol>
  </details>`;

/** @param {import("./viewport-log.js").ViewportLine} line */
const renderViewportLine = (line) =>
  html`<li class="${line.isOff ? "diagnostics-dip" : ""}">
    <span class="diagnostics-ms">${formatClockTimeWithSeconds(new Date(line.at))}</span
    ><span>${line.text}</span>
  </li>`;

/** @param {import("./sheet-log.js").SheetLine} line */
const renderSheetLine = (line) =>
  html`<li>
    <span class="diagnostics-ms">${formatClockTimeWithSeconds(new Date(line.at))}</span
    ><span>${line.text}</span>
  </li>`;

/** @param {import("./sheet-log.js").SheetLine[]} lines newest first */
const renderSheets = (lines) =>
  html`<details class="diagnostics-record">
    <summary><span class="diagnostics-when">Sheets</span></summary>
    <ol class="diagnostics-lines diagnostics-viewport">
      ${lines.map(renderSheetLine)}
    </ol>
  </details>`;

/** @param {import("./viewport-log.js").ViewportLine[]} lines newest first */
const renderViewport = (lines) => {
  const isOff = lines.some((line) => line.isOff);
  return html`<details class="diagnostics-record">
    <summary>
      <span class="diagnostics-when">Viewport</span>
      <span class="diagnostics-flag ${isOff ? "dip" : ""}">${isOff ? "Off" : "Steady"}</span>
    </summary>
    <ol class="diagnostics-lines diagnostics-viewport">
      ${lines.map(renderViewportLine)}
    </ol>
  </details>`;
};

/**
 * What the record button says: Record, the seconds left while it records, then the way to send
 * what it recorded, and then that it was sent.
 * @param {{ secondsLeft: number, reportStep: ReportStep | null, isTouch: boolean }} state
 * @returns {string}
 */
export function nameRecordButton({ secondsLeft, reportStep: step, isTouch }) {
  if (secondsLeft > 0) return `Recording ${secondsLeft}`;
  if (step === "ready") return isTouch ? "Share report" : "Copy report";
  if (step === "copied") return "Copied";
  if (step === "shared") return "Shared";
  return "Record";
}

function renderRecordButton() {
  const secondsLeft = record?.how === ON_REQUEST ? shownSecondsLeft : 0;
  const isReady = secondsLeft === 0 && reportStep === "ready";
  return html`<button
    type="button"
    class="diagnostics-button ${isReady ? "diagnostics-report" : ""}"
    id="diagnosticsRecord"
    ${secondsLeft > 0 ? "disabled" : ""}
  >
    ${nameRecordButton({ secondsLeft, reportStep, isTouch: isTouchDevice() })}
  </button>`;
}

function renderRecords() {
  const records = listRecords();
  const viewportLines = readViewportLines().toReversed();
  const sheetLines = readSheetLines().toReversed();
  return html`<p class="diagnostics-release">${describeRelease(readPageFacts())}</p>
    <div class="diagnostics-head">
      <h3>Recent opens</h3>
      <div class="diagnostics-actions">${renderRecordButton()}</div>
    </div>
    ${
      records.length
        ? records.map(renderRecord)
        : html`<p class="diagnostics-empty">Nothing yet. Each open from now on shows here.</p>`
    }
    ${viewportLines.length > 0 && renderViewport(viewportLines)}
    ${sheetLines.length > 0 && renderSheets(sheetLines)}`;
}

function drawRecords() {
  const isOn = isRecording();
  findElement("diagnosticsSwitch").setAttribute("aria-checked", String(isOn));
  const section = findElement("diagnostics");
  section.hidden = !isOn;
  setHtml(section, isOn ? renderRecords() : html``);
}

function toggleRecording() {
  const isOn = !isRecording();
  saveSwitch(isOn);
  if (isOn) refreshJobStatuses();
  else record = null;
  reportStep = null;
  drawRecords();
}

function writeReport() {
  const header = writeHeader(readPageFacts());
  const records = writeRecordsAsText(listRecords(), new Date());
  const viewport = writeViewportAsText(readViewportLines().toReversed());
  const sheets = writeSheetLinesAsText(readSheetLines().toReversed());
  return [header, records, viewport, sheets].filter(Boolean).join("\n\n");
}

/** @param {ReportStep | null} step */
function showReportStep(step) {
  clearTimeout(reportTimer);
  reportStep = step;
  drawRecords();
  if (step === "copied" || step === "shared") {
    reportTimer = setTimeout(() => showReportStep(null), SENT_MS);
  }
}

/**
 * Opens the phone's share sheet, which has to start in the tap's own gesture, so it's called
 * before anything waits. A share sheet the viewer closes was their choice, so nothing else happens.
 * @param {string} text
 * @returns {Promise<"shared" | "closed" | "failed">}
 */
async function shareReport(text) {
  if (!isTouchDevice() || typeof navigator.share !== "function") return "failed";
  try {
    await navigator.share({ title: `${readPageFacts().appName} Diagnostics`, text });
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "closed" : "failed";
  }
}

/**
 * @param {string} text
 * @returns {Promise<boolean>} whether it was copied
 */
async function copyReport(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function sendReport() {
  const text = writeReport();
  const shared = await shareReport(text);
  if (shared === "shared") showReportStep("shared");
  else if (shared === "failed" && (await copyReport(text))) showReportStep("copied");
}

/** @param {Event} event */
function followSectionClick(event) {
  const target = /** @type {Element} */ (event.target);
  if (target.closest("#diagnosticsRecord")) followRecordButton();
}

function followRecordButton() {
  if (reportStep === "ready") sendReport();
  else recordOnRequest();
}

function recordOnRequest() {
  startRecord(ON_REQUEST);
  refreshJobStatuses();
  clearTimeout(reportTimer);
  reportStep = null;
  shownSecondsLeft = countSecondsLeft(0);
  drawRecords();
}

/** @param {number} awayMs */
function noteReturn(awayMs) {
  returns += 1;
  startRecord(describeTimeAway(awayMs));
}

/**
 * Wires the settings switch (#diagnosticsSwitch) and the records under it (#diagnostics), and,
 * while the switch is on, records this load, each return to the page, each change to the
 * viewport, and each step of a dialog's row of sheets. A page that leaves the screen keeps
 * what it recorded so far, as when it reloads for a new release or the phone drops it. The page
 * starts it before drawing anything, so a load's first reading is what show-last-drawn.js put
 * back.
 */
export function startDiagnostics() {
  findElement("diagnosticsSwitch").addEventListener("click", toggleRecording);
  findElement("diagnostics").addEventListener("click", followSectionClick);
  drawRecords();
  startRecord(describeLoad(readNavigationType()));
  watchTimings();
  watchTimeAway(noteReturn);
  loadRelease().then(
    (loaded) => {
      release = loaded;
    },
    () => {},
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishRecord();
  });
  addEventListener("pagehide", finishRecord);
  watchViewport(isRecording, drawRecords);
  watchSheets(isRecording, drawRecords);
}
