/** Formats a timestamp as ISO-8601 with the UTC offset of the given IANA zone. */
export function isoInZone(ms: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((local - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

/** Local wall-clock time in a zone → epoch ms. */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, timeZone: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const iso = isoInZone(guess, timeZone);
  const m = iso.match(/([+-])(\d\d):(\d\d)$/)!;
  const offset = (m[1] === "+" ? 1 : -1) * (+m[2] * 60 + +m[3]) * 60000;
  return guess - offset;
}

export function validTimeZone(tz: string | undefined | null) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Parses an ISO timestamp that must carry an explicit offset. */
export function parseIsoWithOffset(value: string) {
  if (!/(Z|[+-]\d\d:?\d\d)$/i.test(value.trim())) {
    throw new Error(`"${value}" has no UTC offset — use e.g. 2026-11-02T09:00:00-05:00`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`"${value}" is not a valid ISO-8601 timestamp`);
  return ms;
}
