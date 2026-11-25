export const MX_TIME_ZONE = "America/Mexico_City";

export function eventDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: MX_TIME_ZONE,
  }).formatToParts(date);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Returns the inclusive [startDay, endDay] YYYY-MM-DD range (CDMX) covered by an event.
 * - Events without a closing date (`endsAt == null`) cover ONLY their start day (never endless).
 * - If an event ends exactly at midnight (00:00:00.000), subtracting 1 ms prevents spilling a dot
 *   onto the following day.
 */
export function eventDaySpan(
  startsAt: Date | string,
  endsAt: Date | string | null | undefined,
): { startDay: string; endDay: string } {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const startDay = eventDateKey(start);
  if (!endsAt) return { startDay, endDay: startDay };

  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  if (!Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    return { startDay, endDay: startDay };
  }

  const endDay = eventDateKey(new Date(end.getTime() - 1));
  return {
    startDay,
    endDay: endDay >= startDay ? endDay : startDay,
  };
}

export function eventIntersectsDayRange(
  startsAt: Date | string,
  endsAt: Date | string | null | undefined,
  rangeStartDay: string,
  rangeEndDay: string,
): boolean {
  const { startDay, endDay } = eventDaySpan(startsAt, endsAt);
  return startDay <= rangeEndDay && endDay >= rangeStartDay;
}

export function monthDayBounds(month: string): { monthStart: string; monthEnd: string; days: number } {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  return {
    monthStart: `${month}-01`,
    monthEnd: `${month}-${String(days).padStart(2, "0")}`,
    days,
  };
}

/**
 * Lists every YYYY-MM-DD day inside `month` ("YYYY-MM") covered by the event.
 * Clamped to the visible month (at most 31 days), so even huge accidental ranges stay O(1).
 */
export function eventDaysInMonth(
  startsAt: Date | string,
  endsAt: Date | string | null | undefined,
  month: string,
): string[] {
  const { monthStart, monthEnd } = monthDayBounds(month);
  const { startDay, endDay } = eventDaySpan(startsAt, endsAt);
  if (startDay > monthEnd || endDay < monthStart) return [];

  const fromDay = startDay > monthStart ? Number(startDay.slice(8, 10)) : 1;
  const toDay = endDay < monthEnd ? Number(endDay.slice(8, 10)) : Number(monthEnd.slice(8, 10));
  const result: string[] = [];
  for (let day = fromDay; day <= toDay; day += 1) {
    result.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return result;
}
