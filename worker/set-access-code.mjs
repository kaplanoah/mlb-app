// Sets the ACCESS_CODE secret, the code an app's page asks for before it opens, with a new
// ACCESS_SIGNING_KEY for the cookies that keep phones signed in, or with --remove, stops asking.
// A new code signs every phone out until it types the new one.
import { fileURLToPath } from "node:url";
import { normalizeCode } from "../shared/worker/access-gate.js";
import { checkAppName } from "./apps.mjs";
import { readCommandLine } from "./channels.mjs";
import { createKey } from "./set-app-key.mjs";
import { createSecretsClient } from "./worker-secrets.mjs";

const CODE_SECRET = "ACCESS_CODE";
const SIGNING_SECRET = "ACCESS_SIGNING_KEY";
const SHORTEST_CODE = 4;

/** @param {string | undefined} code */
function checkCode(code) {
  if (!code || normalizeCode(code).length < SHORTEST_CODE)
    throw new Error(
      `Name a code of at least ${SHORTEST_CODE} letters or digits. Case, spaces, and hyphens don't count.`,
    );
}

/**
 * @param {object} options
 * @param {string} options.app The app whose page asks for the code.
 * @param {string} [options.channel] The channel whose page asks for it.
 * @param {string} [options.code]
 * @param {boolean} [options.isRemoving]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof console.log} [options.log]
 * @param {() => string} [options.makeSigningKey]
 */
export async function setAccessCode({
  app,
  channel = "production",
  code,
  isRemoving = false,
  fetchImpl = fetch,
  env = process.env,
  log = console.log,
  makeSigningKey = createKey,
}) {
  const secrets = createSecretsClient({ app, channel, fetchImpl, env, log });
  if (isRemoving) {
    const names = await secrets.listSecretNames();
    if (!names.includes(CODE_SECRET)) {
      log("The page asks for no code.");
      return;
    }
    await secrets.deleteSecret(CODE_SECRET);
    if (names.includes(SIGNING_SECRET)) await secrets.deleteSecret(SIGNING_SECRET);
    log("The page opens without a code now.");
    return;
  }
  checkCode(code);
  await secrets.putSecret(SIGNING_SECRET, makeSigningKey());
  await secrets.putSecret(CODE_SECRET, code);
  log("The page asks for the code now. Each phone types it once, and again after a new one.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => {
      const { positionals, flags, channel } = readCommandLine(process.argv.slice(2), {
        remove: { type: "boolean" },
      });
      const [named, code] = positionals;
      return setAccessCode({ app: checkAppName(named), channel, code, isRemoving: !!flags.remove });
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
