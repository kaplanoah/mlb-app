import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../shared/page/html.js";
import { capNotifications, describeAsNotification } from "../shared/worker/notifications.js";

const listMessages = (count) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Update ${index + 1}`,
    body: "",
    tag: `update:${index + 1}`,
  }));

const describeMore = (count) => `${count} more updates`;

test("a few notifications at once all go out", () => {
  const messages = listMessages(4);
  assert.deepEqual(capNotifications(messages, describeMore), messages);
});

test("past a few at once, the rest are summed up in one tagged by the first it hides", () => {
  const capped = capNotifications(listMessages(6), describeMore);

  assert.deepEqual(capped.slice(0, 3), listMessages(3));
  assert.deepEqual(capped[3], {
    title: "3 more updates",
    body: "Open the page to see them all.",
    tag: "more:update:4",
  });
  assert.equal(capped.length, 4);
});

test("a line of the page becomes a notification: its main clause the title, and what explains it the body", () => {
  const line = html`<b>Fever</b> beat the <b>Aces</b> 99-89 in Game&nbsp;2&nbsp;&mdash; tie the series 1&ndash;1`;

  assert.deepEqual(describeAsNotification(line, "final:1"), {
    title: "Fever beat the Aces 99-89 in Game\u00a02",
    body: "Tie the series 1\u20131",
    tag: "final:1",
  });
});

test("a line with nothing after a dash is all title", () => {
  assert.deepEqual(describeAsNotification(html`The official bracket is set`, "lock"), {
    title: "The official bracket is set",
    body: "",
    tag: "lock",
  });
});
