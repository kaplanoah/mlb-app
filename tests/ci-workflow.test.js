import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** @param {string} path from the repo's root */
const readRepoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readInstalledPlaywright = () =>
  JSON.parse(readRepoFile("package-lock.json")).packages["node_modules/playwright"].version;

const readWebKitImageVersion = () =>
  readRepoFile(".github/workflows/ci.yml").match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/)?.[1];

// The image holds only the browsers its own Playwright version runs, so CI's WebKit job would find
// no WebKit once Dependabot moves Playwright on without it.
test("the WebKit job's image is the Playwright version the lockfile installs", () => {
  assert.equal(readWebKitImageVersion(), readInstalledPlaywright());
});
