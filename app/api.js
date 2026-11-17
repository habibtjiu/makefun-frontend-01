// make.fun's public API: read-only GET requests, open to any origin (CORS).
// Answers are cached in memory for a minute (the API binds its ETags to the
// minute) and revalidated with If-None-Match after that, and a request
// already in flight is shared instead of sent twice.

const API_BASE = 'https://make.fun/api';
const FRESH_MS = 60000;

const cache = new Map();
const pending = new Map();

async function apiGet(path) {
  const url = API_BASE + path;
  const held = cache.get(url);
  if (held && Date.now() - held.at < FRESH_MS) return held.body;
  const inflight = pending.get(url);
  if (inflight) return inflight;
  const run = (async () => {
    const headers = {};
    if (held?.etag) headers['If-None-Match'] = held.etag;
    const res = await fetch(url, { headers });
    if (res.status === 304 && held) return held.body;
    if (!res.ok) throw new Error(`make.fun answered ${res.status} for ${path}`);
    const body = await res.json();
    cache.set(url, { etag: res.headers.get('etag'), body, at: Date.now() });
    return body;
  })();
  pending.set(url, run);
  try {
    return await run;
  } finally {
    pending.delete(url);
  }
}

/** Every competition the board lists, without per-bounty activity. */
export function listCompetitions() {
  return apiGet('/competitions?activity=times');
}

/** One bounty with its rules and rewards, its entry list summarised. */
export function getCompetition(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}?submissions=summary`);
}

/** A bouty's ranked entries in one view: performance or overall. */
export function getLeaderboard(slug, view) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?view=${view}&rows=all`);
}

/** An account's public profile: record, entries and payouts. */
export function getProfile(handle) {
  return apiGet(`/profiles/${encodeURIComponent(handle)}`);
}

/** An avatar URL from the API, made absolute so it loads from make.fun. */
export function avatarUrl(image) {
  if (!image) return '';
  try {
    return new URL(image, API_BASE).href;
  } catch {
    return '';
  }
}
