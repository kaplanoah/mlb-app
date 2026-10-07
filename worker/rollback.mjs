// Puts an app's previous version back at all of its traffic, with the call a deploy makes when its
// new version doesn't answer. The previous version is the newest deployment before the live code
// whose version records another commit, since a secret change deploys the same code again, and
// a rollback keeps the secrets as they are.
import { fileURLToPath } from "node:url";
import { checkAppName } from "./apps.mjs";
import { readCommandLine } from "./channels.mjs";
import {
  createCloudflareCaller,
  createDeploymentsClient,
  findMainVersion,
  findWorkersApi,
  readAccount,
  readAppWorkerConfig,
} from "./deploy.mjs";

/** @typedef {{ version_id: string, percentage: number }[]} Deployment */

/**
 * The first deployment, newest first, whose recorded commit `isWanted`, and that commit.
 * @param {Deployment[]} deployments
 * @param {(deployment: Deployment, what: string) => Promise<string | null>} readCommit
 * @param {(commit: string) => boolean} isWanted
 * @param {string} what
 */
async function findDeploymentOf(deployments, readCommit, isWanted, what) {
  for (const [index, deployment] of deployments.entries()) {
    const commit = await readCommit(deployment, what);
    if (commit && isWanted(commit)) return { index, commit, deployment };
  }
  return null;
}

/**
 * @param {object} options
 * @param {string} options.app
 * @param {string} [options.channel]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {typeof console.log} [options.log]
 * @returns {Promise<{ from: string, to: string }>} the commit that was live, and the one now
 */
export async function rollBack({
  app,
  channel = "production",
  fetchImpl = fetch,
  env = process.env,
  log = console.log,
}) {
  const { name } = readAppWorkerConfig(app, channel);
  const callCloudflare = createCloudflareCaller({ fetchImpl, env, log });
  const client = createDeploymentsClient({
    base: findWorkersApi(readAccount(env)),
    name,
    callCloudflare,
  });
  const deployments = await client.listDeployments();
  const live = await findDeploymentOf(deployments, client.readCommit, () => true, "live commit");
  if (!live)
    throw new Error(`No version of ${name} records its commit, so there's none to go back to.`);
  const earlier = await findDeploymentOf(
    deployments.slice(live.index + 1),
    client.readCommit,
    (commit) => commit !== live.commit,
    "earlier commit",
  );
  if (!earlier)
    throw new Error(
      `${name} has no earlier version than ${live.commit.slice(0, 7)} to go back to.`,
    );
  const { version_id } = findMainVersion(earlier.deployment);
  await client.putLive([{ version_id, percentage: 100 }]);
  log(
    `${name} was live at ${live.commit.slice(0, 7)} and is now at ${earlier.commit.slice(0, 7)}.`,
  );
  return { from: live.commit, to: earlier.commit };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => {
      const { positionals, channel } = readCommandLine(process.argv.slice(2));
      return rollBack({ app: checkAppName(positionals[0]), channel });
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
