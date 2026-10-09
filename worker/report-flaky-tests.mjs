// Names each browser test that failed in a night's runs of main (.github/workflows/flaky.yml) in
// one open issue, so a test that fails only now and then is found and fixed rather than retried
// past on pull requests. A night with a failure opens the issue, or comments on the one still open.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createGitHub, readAllPages } from "./github-api.mjs";

export const ISSUE_TITLE = "Flaky browser tests";

const FAILED_STATUSES = new Set(["failed", "timedOut"]);

/** @typedef {{ name: string, runs: number, failures: number, message: string }} TestRuns */

// Playwright colors its messages for a terminal.
const ESCAPE = String.fromCharCode(27);
const COLOR_CODE = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");

/** @param {string | undefined} message */
const readFirstLine = (message) => (message ?? "").replace(COLOR_CODE, "").trim().split("\n")[0];

/**
 * Each test in a Playwright JSON report, with the titles of the describe blocks around it.
 * @param {any} suite
 * @param {string[]} titles
 * @returns {Generator<{ spec: any, test: any, titles: string[] }>}
 */
function* listReportTests(suite, titles) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) yield { spec, test, titles };
  }
  for (const inner of suite.suites ?? []) yield* listReportTests(inner, [...titles, inner.title]);
}

/**
 * @param {{ spec: any, test: any, titles: string[] }} entry
 */
const nameTest = ({ spec, test, titles }) =>
  `[${test.projectName}] ${spec.file}:${spec.line} > ${[...titles, spec.title].join(" > ")}`;

/**
 * Each test that failed in any of its runs across the reports, the most failed first. A test run
 * many times over appears once for each run.
 * @param {any[]} reports Playwright JSON reports
 * @returns {TestRuns[]}
 */
export function listFailedTests(reports) {
  /** @type {Map<string, TestRuns>} */
  const byName = new Map();
  for (const report of reports) {
    for (const top of report.suites ?? []) {
      for (const entry of listReportTests(top, [])) {
        const name = nameTest(entry);
        const counted = byName.get(name) ?? { name, runs: 0, failures: 0, message: "" };
        for (const result of entry.test.results ?? []) {
          counted.runs += 1;
          if (!FAILED_STATUSES.has(result.status)) continue;
          counted.failures += 1;
          counted.message ||= readFirstLine(result.error?.message);
        }
        byName.set(name, counted);
      }
    }
  }
  return [...byName.values()]
    .filter((counted) => counted.failures > 0)
    .sort((a, b) => b.failures - a.failures || a.name.localeCompare(b.name));
}

/**
 * @param {TestRuns[]} failed
 * @param {string} runUrl
 */
export const renderReport = (failed, runUrl) =>
  [
    `Last night's runs of main's browser tests, each test three times over with no retry, failed ${failed.length === 1 ? "this test" : `these ${failed.length} tests`} ([the run](${runUrl})):`,
    "",
    ...failed.map(
      ({ name, runs, failures, message }) =>
        `- \`${name}\`, failed ${failures} of ${runs} runs: ${message || "no message"}`,
    ),
  ].join("\n");

/**
 * Opens the issue, or comments on the one still open.
 * @param {object} options
 * @param {string} options.repository as owner/name
 * @param {string} options.body
 * @param {typeof fetch} [options.fetchImpl]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<number>} the issue's number
 */
export async function postReport({ repository, body, fetchImpl = fetch, env = process.env }) {
  const github = createGitHub({ repository, fetchImpl, env });
  const issues = await readAllPages(github, "/issues?state=open");
  const open = issues.find((issue) => issue.title === ISSUE_TITLE && !issue.pull_request);
  if (open) {
    await github(`/issues/${open.number}/comments`, { method: "POST", body: { body } });
    return open.number;
  }
  const created = await github("/issues", { method: "POST", body: { title: ISSUE_TITLE, body } });
  return created.number;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reports = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8")));
  const failed = listFailedTests(reports);
  if (!failed.length) {
    console.log("No browser test failed.");
  } else {
    const number = await postReport({
      repository: String(process.env.GITHUB_REPOSITORY),
      body: renderReport(failed, String(process.env.RUN_URL)),
    });
    console.log(`Named ${failed.length} failed tests in #${number}.`);
  }
}
