// Calls GitHub's REST API for one repository, as the tooling's scripts that read and write its
// pull requests and issues do.

const API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;

/**
 * @param {object} options
 * @param {string} options.repository as owner/name
 * @param {typeof fetch} options.fetchImpl
 * @param {NodeJS.ProcessEnv} options.env
 */
export function createGitHub({ repository, fetchImpl, env }) {
  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown }} [request]
   */
  return async (path, { method = "GET", body } = {}) => {
    const response = await fetchImpl(`${API}/repos/${repository}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GH_TOKEN}`,
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${method} ${path}`);
    return response.json();
  };
}

/**
 * Every page of a listing, in order.
 * @param {(path: string) => Promise<any[]>} readJson
 * @param {string} path
 */
export async function readAllPages(readJson, path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = await readJson(
      `${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`,
    );
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return items;
  }
}
