// While Diagnostics is on in settings, each open of the page, and each return to it, records what
// the page draws in its first seconds: what the store sends, and how much each part it draws whole
// (each `data-last-drawn` element) shows, frame by frame. The last few records stay on this device,
// for the viewer to copy from settings, under the logs of the viewport's changes (viewport-log.js)
// and of what each dialog's row of sheets does (sheet-log.js).
// It records nothing while it's off, which it starts as.

import { formatClockTime, formatClockTimeWithSeconds, nameDay } from "./days.js";
import {
  applyDrawingTests,
  describeDrawingTests,
  forgetDrawingTests,
  readDrawingTests,
  renderDrawingTests,
  toggleDrawingTest,
} from "./drawing-test.js";
import { html, joinWithSeparator, setHtml } from "./html.js";
import { describeAnimations, describeShownPagers } from "./pager-log.js";
import { watchTimeAway } from "./resume.js";
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
const KEPT_RECORDS = 5;
// A part whose text shrinks by more than this share dipped, which is what a flicker looks like.
const DIP_SHARE = 0.25;
const MINUTE_MS = 60 * 1000;
// Copy says it copied for this long, then offers to copy again.
const COPIED_MS = 2000;

/** @typedef {{ ms: number, text: string, isDip?: boolean }} RecordLine */
/** @typedef {{ at: number, how: string, tab: string, lines: RecordLine[] }} OpenRecord */
/** @typedef {{ text: number, height: number }} PartSize */

/** @type {OpenRecord | null} */
let record = null;
let recordStartedAt = 0;
/** @type {Map<string, PartSize>} */
let shownSizes = new Map();
let isCopied = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let copiedTimer;

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
      forgetDrawingTests();
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
function finishRecord() {
  if (!record) return;
  record.lines.sort((first, second) => first.ms - second.ms);
  saveRecords([...readRecords(), record]);
  record = null;
  drawRecords();
}

function sampleParts() {
  if (!record) return;
  noteChangedParts();
  if (performance.now() - recordStartedAt < RECORD_MS) requestAnimationFrame(sampleParts);
  else {
    for (const line of describeShownPagers()) noteStep(line);
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

/** @param {string} how */
function startRecord(how) {
  finishRecord();
  if (!isRecording()) return;
  record = { at: Date.now(), how, tab: readShownTab(), lines: [] };
  recordStartedAt = performance.now();
  shownSizes = readPartSizes();
  const drawingTests = describeDrawingTests(readDrawingTests());
  if (drawingTests) noteStep(drawingTests);
  noteStep(`Shows ${describeSizes(shownSizes)}`);
  requestAnimationFrame(sampleParts);
}

/**
 * @param {number} awayMs
 * @returns {string}
 */
export function describeTimeAway(awayMs) {
  const minutes = Math.round(awayMs / MINUTE_MS);
  if (minutes < 1) return "Back after less than a minute";
  if (minutes < 60) return `Back after ${minutes} min`;
  return `Back after ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
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

function renderRecords() {
  const records = readRecords().toReversed();
  const viewportLines = readViewportLines().toReversed();
  const sheetLines = readSheetLines().toReversed();
  return html`<div class="diagnostics-head">
      <h3>Recent opens</h3>
      ${
        (records.length > 0 || viewportLines.length > 0 || sheetLines.length > 0) &&
        html`<button type="button" class="diagnostics-copy" id="diagnosticsCopy">
        ${isCopied ? "Copied" : "Copy"}
      </button>`
      }
    </div>
    ${
      records.length
        ? records.map(renderRecord)
        : html`<p class="diagnostics-empty">Nothing yet. Each open from now on shows here.</p>`
    }
    ${viewportLines.length > 0 && renderViewport(viewportLines)}
    ${sheetLines.length > 0 && renderSheets(sheetLines)}
    ${renderDrawingTests(readDrawingTests())}`;
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
  if (!isOn) record = null;
  isCopied = false;
  drawRecords();
}

/** @param {boolean} hasCopied */
function showCopied(hasCopied) {
  clearTimeout(copiedTimer);
  isCopied = hasCopied;
  drawRecords();
  if (hasCopied) copiedTimer = setTimeout(() => showCopied(false), COPIED_MS);
}

async function copyRecords() {
  try {
    const records = writeRecordsAsText(readRecords().toReversed(), new Date());
    const viewport = writeViewportAsText(readViewportLines().toReversed());
    const sheets = writeSheetLinesAsText(readSheetLines().toReversed());
    await navigator.clipboard.writeText([records, viewport, sheets].filter(Boolean).join("\n\n"));
    showCopied(true);
  } catch {
    showCopied(false);
  }
}

/** @param {Event} event */
function followSectionClick(event) {
  const target = /** @type {Element} */ (event.target);
  if (target.closest("#diagnosticsCopy")) copyRecords();
  const drawingTest = /** @type {HTMLElement | null} */ (target.closest("[data-drawing-test]"));
  if (drawingTest?.dataset.drawingTest) {
    toggleDrawingTest(drawingTest.dataset.drawingTest);
    drawRecords();
  }
}

/**
 * Wires the settings switch (#diagnosticsSwitch) and the records under it (#diagnostics), with the
 * drawing tests after them (drawing-test.js), and, while the switch is on, leaves out the kinds of
 * drawing this device chose to, and records this load, each return to the page, each change to
 * the viewport, and each step of a dialog's row of sheets. A page that leaves the screen keeps
 * what it recorded so far, as when it reloads for a new release or the phone drops it. The page
 * starts it before drawing anything, so a load's first reading is what show-last-drawn.js put
 * back.
 */
export function startDiagnostics() {
  if (isRecording()) applyDrawingTests();
  findElement("diagnosticsSwitch").addEventListener("click", toggleRecording);
  findElement("diagnostics").addEventListener("click", followSectionClick);
  drawRecords();
  startRecord(describeLoad(readNavigationType()));
  watchTimings();
  watchTimeAway((awayMs) => startRecord(describeTimeAway(awayMs)));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishRecord();
  });
  addEventListener("pagehide", finishRecord);
  watchViewport(isRecording, drawRecords);
  watchSheets(isRecording, drawRecords);
}
