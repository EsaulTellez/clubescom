import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  eventDaySpan,
  eventDaysInMonth,
  eventIntersectsDayRange,
} = createJiti(import.meta.url)("../src/lib/event-dates.ts");

test("un evento sin fecha de cierre solo ocupa su día de inicio", () => {
  assert.deepEqual(
    eventDaySpan("2026-11-25T10:00:00-06:00", null),
    { startDay: "2026-11-25", endDay: "2026-11-25" },
  );
  assert.deepEqual(
    eventDaysInMonth("2026-11-25T10:00:00-06:00", null, "2026-11"),
    ["2026-11-25"],
  );
});

test("un evento con rango de varios días marca todos los días del rango", () => {
  assert.deepEqual(
    eventDaysInMonth(
      "2026-11-25T10:00:00-06:00",
      "2026-11-28T18:00:00-06:00",
      "2026-11",
    ),
    ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"],
  );
});

test("un evento que cruza de mes marca los días correspondientes en cada mes", () => {
  const start = "2026-11-29T09:00:00-06:00";
  const end = "2026-12-02T17:00:00-06:00";
  assert.deepEqual(eventDaysInMonth(start, end, "2026-11"), ["2026-11-29", "2026-11-30"]);
  assert.deepEqual(eventDaysInMonth(start, end, "2026-12"), ["2026-12-01", "2026-12-02"]);
  assert.equal(eventIntersectsDayRange(start, end, "2026-12-01", "2026-12-07"), true);
  assert.equal(eventIntersectsDayRange(start, end, "2026-12-03", "2026-12-10"), false);
});

test("un evento que cierra exactamente a medianoche no invade el día siguiente", () => {
  assert.deepEqual(
    eventDaySpan("2026-11-25T18:00:00-06:00", "2026-11-26T00:00:00-06:00"),
    { startDay: "2026-11-25", endDay: "2026-11-25" },
  );
});

test("un rango enorme queda acotado al mes visible sin desbordar", () => {
  const days = eventDaysInMonth(
    "2026-01-01T09:00:00-06:00",
    "2028-12-31T18:00:00-06:00",
    "2026-11",
  );
  assert.equal(days.length, 30);
  assert.equal(days[0], "2026-11-01");
  assert.equal(days.at(-1), "2026-11-30");
});
