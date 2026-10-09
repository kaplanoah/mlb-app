import test from "node:test";
import assert from "node:assert/strict";
import {
  ISSUE_TITLE,
  listFailedTests,
  postReport,
  renderReport,
} from "../worker/report-flaky-tests.mjs";

const REPOSITORY = "owner/sports-apps";
const RUN_URL = "https://github.com/owner/sports-apps/actions/runs/1";
const COLOR_RED = `${String.fromCharCode(27)}[31m`;
const COLOR_END = `${String.fromCharCode(27)}[39m`;

/**
 * A test's results in a Playwright JSON report, one for each run.
 * @param {string} projectName
 * @param {{ status: string, message?: string }[]} results
 */
const reportTest = (projectName, results) => ({
  projectName,
  results: results.map(({ status, message }) => ({
    status,
    ...(message ? { error: { message } } : {}),
  })),
});

// Shaped as Playwright's JSON reporter writes a run of a test file three times over: each run is a
// test of its own under the spec.
const nightReport = {
  suites: [
    {
      title: "at-rest.spec.mjs",
      specs: [
        {
          title: "a tab tap leaves the page at rest",
          file: "at-rest.spec.mjs",
          line: 16,
          tests: [
            reportTest("wnba-webkit", [{ status: "passed" }]),
            reportTest("wnba-webkit", [
              {
                status: "failed",
                message: `${COLOR_RED}Error: The page kept animating: opacity on span.stamp${COLOR_END}\nmore`,
              },
            ]),
            reportTest("wnba-webkit", [{ status: "passed" }]),
          ],
        },
      ],
      suites: [
        {
          title: "on a phone",
          specs: [
            {
              title: "a reload shows today after two minutes away",
              file: "last-drawn.spec.mjs",
              line: 58,
              tests: [
                reportTest("wnba", [{ status: "timedOut", message: "Test timeout exceeded." }]),
                reportTest("wnba", [{ status: "failed", message: "toBeInViewport() failed" }]),
                reportTest("wnba", [{ status: "passed" }]),
              ],
            },
            {
              title: "a passing test",
              file: "last-drawn.spec.mjs",
              line: 99,
              tests: [reportTest("wnba", [{ status: "passed" }])],
            },
          ],
        },
      ],
    },
  ],
};

test("each test that failed in any run is named once, by its project, file, and describe blocks, the most failed first", () => {
  assert.deepEqual(listFailedTests([nightReport]), [
    {
      name: "[wnba] last-drawn.spec.mjs:58 > on a phone > a reload shows today after two minutes away",
      runs: 3,
      failures: 2,
      message: "Test timeout exceeded.",
    },
    {
      name: "[wnba-webkit] at-rest.spec.mjs:16 > a tab tap leaves the page at rest",
      runs: 3,
      failures: 1,
      message: "Error: The page kept animating: opacity on span.stamp",
    },
  ]);
});

test("a test's runs add up across the reports of each shard", () => {
  const [failed] = listFailedTests([nightReport, nightReport]);

  assert.equal(failed.runs, 6);
  assert.equal(failed.failures, 4);
});

test("a night where every test passed names none", () => {
  const passed = structuredClone(nightReport);
  passed.suites[0].specs[0].tests.splice(1, 1);
  passed.suites[0].suites[0].specs[0].tests.splice(0, 2);

  assert.deepEqual(listFailedTests([passed]), []);
});

test("the report lists each failed test with its failures, its first error line, and the run", () => {
  const report = renderReport(listFailedTests([nightReport]), RUN_URL);

  assert.match(report, /failed these 2 tests \(\[the run\]\(https:\/\/github\.com\/owner\//);
  assert.match(
    report,
    /- `\[wnba\] last-drawn\.spec\.mjs:58 > on a phone > a reload shows today after two minutes away`, failed 2 of 3 runs: Test timeout exceeded\./,
  );
});

/**
 * GitHub's API with these open issues, keeping what's posted.
 * @param {{ number: number, title: string, pull_request?: object }[]} issues
 */
function createFakeGitHub(issues) {
  /** @type {{ path: string, body: any }[]} */
  const posted = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(String(url));
    if (init?.method !== "POST") return Response.json(issues);
    posted.push({ path: pathname, body: JSON.parse(String(init.body)) });
    return Response.json({ number: 7 });
  };
  return { fetchImpl, posted };
}

const post = (github) =>
  postReport({
    repository: REPOSITORY,
    body: "report",
    fetchImpl: github.fetchImpl,
    env: { GH_TOKEN: "token" },
  });

test("a night with failures opens the issue when none is open", async () => {
  const github = createFakeGitHub([{ number: 3, title: "Something else" }]);

  assert.equal(await post(github), 7);

  assert.deepEqual(github.posted, [
    { path: `/repos/${REPOSITORY}/issues`, body: { title: ISSUE_TITLE, body: "report" } },
  ]);
});

test("a night with failures comments on the issue still open, rather than opening another", async () => {
  const github = createFakeGitHub([
    { number: 4, title: ISSUE_TITLE, pull_request: {} },
    { number: 5, title: ISSUE_TITLE },
  ]);

  assert.equal(await post(github), 5);

  assert.deepEqual(github.posted, [
    { path: `/repos/${REPOSITORY}/issues/5/comments`, body: { body: "report" } },
  ]);
});
