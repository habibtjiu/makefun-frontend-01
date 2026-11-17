// Formatting helpers: every figure on screen comes from the API, and is
// shaped in one place so money, dates and countdowns read the same on
// all four surfaces.

/** Text made safe to place inside HTML. */
export function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** A dollar figure ('739.50', 500, 0.5) as $739.50, $500 or $0.50. */
export function usd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';
  const places = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: places,
    maximumFractionDigits: 2,
  });
}

/** A count with thousands separators: 12719 becomes 12,719. */
export function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

/** An ISO date as a short UTC date and time. */
export function utcDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
}

/** Whether a bounty still takes entries: its deadline decides, not its status. */
export function acceptingEntries(competition) {
  const end = new Date(competition?.deadline).getTime();
  return Number.isFinite(end) && end > Date.now();
}

/** Time left until a deadline: '6d 3h left', '9h 12m left', '42m left', 'ended'. */
export function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return 'under a minute left';
}

/** True when a deadline falls within the next 24 hours. */
export function closingSoon(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 && ms <= 86400000;
}

/** A win rate stored in millionths (956066) as a percentage: 95.6%. */
export function winRate(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n / 10000).toFixed(1)}%`;
}

/** A byte size as kilobytes: 936439 becomes 914 KB. */
export function kilobytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return 'n/a';
  return `${Math.round(n / 1024).toLocaleString('en-US')} KB`;
}

/** Milliseconds of build wall time as '49m' or '2h 5m'. */
export function buildTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return 'n/a';
  const minutes = Math.round(n / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** An ISO date as a short UTC date, without the time: 'Nov 10, 2026'. */
export function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
}

/** A build cost in micro-USD as dollars: 37625556 becomes $37.63. */
export function buildCost(microUsd) {
  const n = Number(microUsd);
  if (!Number.isFinite(n)) return 'n/a';
  return usd(n / 1000000);
}
