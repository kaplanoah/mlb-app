import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { listApps } from "../worker/apps.mjs";

const listPages = (app) => {
  const folder = new URL(`../apps/${app}/page/`, import.meta.url);
  return readdirSync(folder)
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({
      name: `${app}/${name}`,
      markup: readFileSync(new URL(name, folder), "utf8"),
    }));
};

const readViewport = (markup) =>
  markup.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1].split(/,\s*/) ?? [];

// An iPhone zooms into a field under 16px when it's tapped, unless the page can't scale past 1;
// Safari still lets a pinch zoom.
test("no app's page zooms on its own when a field is tapped", () => {
  for (const app of listApps())
    for (const { name, markup } of listPages(app))
      assert.ok(readViewport(markup).includes("maximum-scale=1"), name);
});
