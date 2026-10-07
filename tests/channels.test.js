import test from "node:test";
import assert from "node:assert/strict";
import { findChannel, readCommandLine } from "../worker/channels.mjs";

test("a command runs on production unless it names another channel", () => {
  assert.deepEqual(readCommandLine(["mlb"]), {
    positionals: ["mlb"],
    flags: {},
    channel: "production",
  });
  assert.deepEqual(readCommandLine(["--channel", "beta", "wnba"]), {
    positionals: ["wnba"],
    flags: {},
    channel: "beta",
  });
  assert.equal(readCommandLine(["mlb", "--channel=beta"]).channel, "beta");
});

test("the channel's value never reads as the command's app or code", () => {
  const { positionals, flags, channel } = readCommandLine(
    ["mlb", "--channel", "beta", "s3cret", "--remove"],
    { remove: { type: "boolean" } },
  );
  assert.deepEqual(positionals, ["mlb", "s3cret"]);
  assert.deepEqual(flags, { remove: true });
  assert.equal(channel, "beta");
});

test("an unknown channel or switch is refused, naming the channels", () => {
  assert.throws(() => readCommandLine(["mlb", "--channel", "staging"]), /production, beta/);
  assert.throws(() => readCommandLine(["mlb", "--rotate"]), /Unknown option '--rotate'/);
});

test("each channel deploys from its own branch", () => {
  assert.equal(findChannel().branch, "main");
  assert.equal(findChannel("beta").branch, "beta");
  assert.equal(findChannel("beta").environment, "beta");
  assert.equal(findChannel("production").label, null);
});
