import test from "node:test";
import assert from "node:assert/strict";
import { rollBack } from "../worker/rollback.mjs";

const ENV = { CLOUDFLARE_ACCOUNT_ID: "acct123" };
const API = "https://api.cloudflare.com/client/v4/accounts/acct123/workers";
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const COMMIT_C = "c".repeat(40);

/**
 * Deployments in no particular order, as Cloudflare lists them, each with the commit its one
 * version records, or none, as a secret change's version does.
 * @param {{ id: string, at: string, commit?: string }[]} deployed
 * @param {{ refuseRollback?: boolean }} [options]
 */
function createFakeCloudflare(deployed, { refuseRollback = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/deployments") && init.method === "POST" && refuseRollback)
      return new Response(
        JSON.stringify({ success: false, errors: [{ code: 10000, message: "Refused" }] }),
        { status: 403 },
      );
    let result = {};
    if (url.endsWith("/deployments") && init.method === "GET")
      result = {
        deployments: deployed.map(({ id, at }) => ({
          created_on: at,
          versions: [{ version_id: id, percentage: 100 }],
        })),
      };
    const version = deployed.find(({ id }) => url.endsWith(`/versions/${id}`));
    if (version)
      result = { annotations: version.commit ? { "workers/message": version.commit } : {} };
    return new Response(JSON.stringify({ success: true, result }));
  };
  return { fetchImpl, calls };
}

const findRollback = (calls) =>
  calls.find((call) => call.url.endsWith("/deployments") && call.init.method === "POST");

test("the version before the live one goes back to all of the traffic", async () => {
  const cloudflare = createFakeCloudflare([
    { id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A },
    { id: "v3", at: "2026-10-03T10:00:00Z", commit: COMMIT_C },
    { id: "v2", at: "2026-10-02T10:00:00Z", commit: COMMIT_B },
  ]);
  const printed = [];
  const result = await rollBack({
    app: "mlb",
    fetchImpl: cloudflare.fetchImpl,
    env: ENV,
    log: (line) => printed.push(line),
  });
  assert.deepEqual(result, { from: COMMIT_C, to: COMMIT_B });
  const rollback = findRollback(cloudflare.calls);
  assert.equal(rollback.url, `${API}/scripts/mlb-app/deployments`);
  assert.deepEqual(JSON.parse(rollback.init.body), {
    strategy: "percentage",
    versions: [{ version_id: "v2", percentage: 100 }],
  });
  assert.ok(
    printed.includes("mlb-app was live at ccccccc and is now at bbbbbbb."),
    printed.join("\n"),
  );
});

test("a secret change's version deploys the same code, so it's passed over", async () => {
  const cloudflare = createFakeCloudflare([
    { id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A },
    { id: "v2", at: "2026-10-02T10:00:00Z", commit: COMMIT_B },
    { id: "v3", at: "2026-10-03T10:00:00Z" },
    { id: "v4", at: "2026-10-04T10:00:00Z", commit: COMMIT_B },
    { id: "v5", at: "2026-10-05T10:00:00Z" },
  ]);
  const result = await rollBack({
    app: "mlb",
    fetchImpl: cloudflare.fetchImpl,
    env: ENV,
    log: () => {},
  });
  assert.deepEqual(result, { from: COMMIT_B, to: COMMIT_A });
  assert.deepEqual(JSON.parse(findRollback(cloudflare.calls).init.body).versions, [
    { version_id: "v1", percentage: 100 },
  ]);
});

test("the beta channel rolls back its own Worker", async () => {
  const cloudflare = createFakeCloudflare([
    { id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A },
    { id: "v2", at: "2026-10-02T10:00:00Z", commit: COMMIT_B },
  ]);
  await rollBack({
    app: "wnba",
    channel: "beta",
    fetchImpl: cloudflare.fetchImpl,
    env: ENV,
    log: () => {},
  });
  assert.ok(cloudflare.calls.every((call) => call.url.startsWith(`${API}/scripts/wnba-app-beta/`)));
  assert.ok(findRollback(cloudflare.calls));
});

test("with no earlier version, nothing changes", async () => {
  const cases = [
    { deployed: [], reason: /No version of mlb-app records its commit/ },
    {
      deployed: [{ id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A }],
      reason: /mlb-app has no earlier version than aaaaaaa/,
    },
    {
      deployed: [
        { id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A },
        { id: "v2", at: "2026-10-02T10:00:00Z" },
      ],
      reason: /no earlier version than aaaaaaa/,
    },
  ];
  for (const { deployed, reason } of cases) {
    const cloudflare = createFakeCloudflare(deployed);
    await assert.rejects(
      rollBack({ app: "mlb", fetchImpl: cloudflare.fetchImpl, env: ENV, log: () => {} }),
      reason,
    );
    assert.equal(findRollback(cloudflare.calls), undefined);
  }
});

test("a refused rollback says so", async () => {
  const cloudflare = createFakeCloudflare(
    [
      { id: "v1", at: "2026-10-01T10:00:00Z", commit: COMMIT_A },
      { id: "v2", at: "2026-10-02T10:00:00Z", commit: COMMIT_B },
    ],
    { refuseRollback: true },
  );
  await assert.rejects(
    rollBack({ app: "mlb", fetchImpl: cloudflare.fetchImpl, env: ENV, log: () => {} }),
    /rollback failed: 10000: Refused/,
  );
});
