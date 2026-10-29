// Pure formatting helpers. Whatever depends on the clock takes `now`.

export type Text = string | number | null | undefined;

const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;']
]);

export const esc = (s: Text): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ESCAPES.get(c) ?? c);

// Links in text from Linear can't be followed here, so show their name: [text](url) → text,
// a Linear issue URL → its id (COD-123), a GitHub PR or issue URL → #n, any other URL → host and path
const linkName = (u: string): string => {
  const lin = u.match(/^https?:\/\/linear\.app\/[^/]+\/issue\/([A-Za-z]+-\d+)/);
  if (lin) return lin[1].toUpperCase();
  const gh = u.match(
    /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/(\d+)/
  );
  if (gh) return '#' + gh[1];
  return u.replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '');
};

export const tidy = (s: Text): string =>
  String(s ?? '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t: string) =>
      /^https?:\/\//.test(t.trim()) ? linkName(t.trim()) : t
    )
    .replace(/<(https?:\/\/[^>\s]+)>/g, (_m, u: string) => linkName(u))
    .replace(
      /https?:\/\/[^\s)\]>"']+/g,
      (u) =>
        linkName(u.replace(/[.,;:]+$/, '')) + (u.match(/[.,;:]+$/)?.[0] || '')
    );

export const txt = (s: Text): string => esc(tidy(s));

export const inline = (s: Text): string =>
  txt(s).replace(/`([^`]+)`/g, '<code>$1</code>');

export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** "5 min ago", "3 h ago", "4 days ago" from minutes */
export const ageText = (min: number): string =>
  min < 60
    ? `${Math.max(0, Math.round(min))} min ago`
    : min < 48 * 60
      ? `${Math.round(min / 60)} h ago`
      : `${Math.round(min / 1440)} days ago`;

/** "1 h 5 min" from minutes */
export const span = (min: number): string =>
  min < 60
    ? `${Math.round(min)} min`
    : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;

/** How long ago an ISO time was, as text; empty without one */
export const seenAgo = (iso: string | null | undefined, now: Date): string =>
  iso ? ageText((now.getTime() - Date.parse(iso)) / 6e4) : '';

export const hhmm = (t: number): string =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The time of a `YYYY-MM-DD HH:MM` stamp, in local time */
export const runTime = (when: string): number =>
  Date.parse(when.replace(' ', 'T'));

/** `YYYY-MM-DD` in local time */
export const dayKey = (t: number | string | Date): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dayLabel = (key: string): string =>
  new Date(key + 'T12:00').toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });

export const usd = (n: number | null | undefined, dp = 0): string =>
  n == null
    ? '?'
    : '$' +
      n.toLocaleString('en-US', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp
      });

/** A round number at or above `v` for an axis maximum: 1, 2, 2.5, 5 or 10 times a power of ten */
export const niceCeil = (v: number): number => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) ?? 10 * p;
};

export const mtok = (n: number): string =>
  n >= 1e9
    ? (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + 'M'
      : n >= 1e3
        ? Math.round(n / 1e3) + 'k'
        : String(n);
