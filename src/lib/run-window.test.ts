import assert from "node:assert/strict";
import test from "node:test";
import {
  addMinutes,
  formatLocalDateTime,
  parseLocalDateTime,
  readVerdict,
  roundedHourInTimeZone,
  sliceHourIndexes,
} from "./run-window.ts";

test("sliceHourIndexes keeps hours that overlap the run", () => {
  const times = ["2026-10-09T06:00", "2026-10-09T07:00", "2026-10-09T08:00", "2026-10-09T09:00"];
  assert.deepEqual(sliceHourIndexes(times, "2026-10-09T07:20", 45), [1, 2]);
  assert.deepEqual(sliceHourIndexes(times, "2026-10-09T07:00", 30), [1]);
});

test("sliceHourIndexes rejects a window outside the forecast", () => {
  const times = ["2026-10-09T06:00"];
  assert.deepEqual(sliceHourIndexes(times, "2026-10-11T06:00", 30), []);
});

test("parseLocalDateTime rejects impossible dates", () => {
  assert.equal(parseLocalDateTime("2026-02-31T10:00"), null);
  assert.equal(parseLocalDateTime("2026-10-09T25:00"), null);
});

test("addMinutes crosses midnight", () => {
  const start = parseLocalDateTime("2026-10-09T23:40");
  assert.ok(start);
  assert.equal(formatLocalDateTime(addMinutes(start, 45)), "2026-10-10T00:25");
});

test("roundedHourInTimeZone bumps a partial hour", () => {
  const date = new Date("2026-10-09T15:10:00Z");
  assert.equal(roundedHourInTimeZone("UTC", date), "2026-10-09T16:00");
  assert.equal(roundedHourInTimeZone("UTC", new Date("2026-10-09T15:00:00Z")), "2026-10-09T15:00");
});

test("readVerdict prefers the conservative label", () => {
  assert.equal(readVerdict("No salir\nHace demasiado calor."), "stop");
  assert.equal(readVerdict("Salir con precaución\nLleva gorra."), "caution");
  assert.equal(readVerdict("Salir\nBuen cielo."), "go");
});
