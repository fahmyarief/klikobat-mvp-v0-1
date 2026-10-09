// Server-only FarmaBox connector. Do not expose FARMABOX_API_KEY to the browser.
export const FARMABOX_API_BASE = "https://apotekfarmabox.com/api/klikobat/v1";
export const FARMABOX_PILOT_BRANCH_ID = 1;
const MAX_PAGE = 20;
const PAGE_SIZE = 500;

export class FarmaboxApiError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "FarmaboxApiError";
    this.code = code;
    this.status = status;
  }
}

export function createFarmaboxApi({ apiKey = process.env.FARMABOX_API_KEY, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!apiKey) throw new FarmaboxApiError("API_KEY_NOT_CONFIGURED", 503);
  if (typeof apiKey !== "string" || apiKey.length < 20) throw new FarmaboxApiError("API_KEY_INVALID", 503);

  async function get(path, params = {}) {
    if (!["/ping", "/cabang", "/produk"].includes(path)) throw new FarmaboxApiError("PATH_NOT_ALLOWED", 400);
    const url = new URL(FARMABOX_API_BASE + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { "X-API-KEY": apiKey, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FarmaboxApiError("SOURCE_UNREACHABLE", 502);
    }
    if (response.status === 401 || response.status === 403) throw new FarmaboxApiError("SOURCE_AUTH_FAILED", 502);
    if (response.status === 429) throw new FarmaboxApiError("SOURCE_RATE_LIMIT", 503);
    if (!response.ok) throw new FarmaboxApiError("SOURCE_UNAVAILABLE", 502);
    let body;
    try {
      body = await response.json();
    } catch {
      throw new FarmaboxApiError("SOURCE_RESPONSE_INVALID", 502);
    }
    if (!body || body.success !== true) throw new FarmaboxApiError("SOURCE_RESPONSE_INVALID", 502);
    return body;
  }

  return {
    ping: () => get("/ping"),
    cabang: () => get("/cabang"),
    produk: ({ page = 1, perPage = PAGE_SIZE } = {}) => get("/produk", {
      cabang_id: FARMABOX_PILOT_BRANCH_ID, page, per_page: perPage,
    }),
  };
}

export async function fetchPilotProducts(api = createFarmaboxApi()) {
  const branches = await api.cabang();
  if (!Array.isArray(branches.data) ||
      !branches.data.some(x => Number(x.id) === FARMABOX_PILOT_BRANCH_ID)) {
    throw new FarmaboxApiError("PILOT_BRANCH_NOT_FOUND", 502);
  }
  const all = [];
  let expectedTotal = null;
  for (let page = 1; page <= MAX_PAGE; page++) {
    const result = await api.produk({ page, perPage: PAGE_SIZE });
    const last = Number(result.pagination?.last_page);
    const total = Number(result.pagination?.total);
    if (Number(result.meta?.cabang_id) !== FARMABOX_PILOT_BRANCH_ID ||
        !Number.isSafeInteger(last) || last < 1 || last > MAX_PAGE ||
        !Number.isSafeInteger(total) || total < 0 || total > MAX_PAGE * PAGE_SIZE ||
        !Array.isArray(result.data) || result.data.length > PAGE_SIZE ||
        (expectedTotal !== null && expectedTotal !== total)) {
      throw new FarmaboxApiError("SOURCE_PAGINATION_INVALID", 502);
    }
    expectedTotal = total;
    all.push(...result.data);
    if (page === last) {
      if (all.length !== total) throw new FarmaboxApiError("SOURCE_COUNT_MISMATCH", 502);
      return { products: all, total, branchId: FARMABOX_PILOT_BRANCH_ID };
    }
    if (page > last) break;
  }
  throw new FarmaboxApiError("SOURCE_TOO_MANY_PAGES", 502);
}