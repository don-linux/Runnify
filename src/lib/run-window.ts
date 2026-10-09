export const DURATIONS = [30, 45, 60] as const;

export type DurationMinutes = (typeof DURATIONS)[number];

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = LOCAL_RE.exec(value);
  if (!match) {
    return null;
  }

  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };

  if (
    parsed.month < 1 ||
    parsed.month > 12 ||
    parsed.day < 1 ||
    parsed.day > 31 ||
    parsed.hour > 23 ||
    parsed.minute > 59
  ) {
    return null;
  }

  const probe = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (
    probe.getUTCFullYear() !== parsed.year ||
    probe.getUTCMonth() !== parsed.month - 1 ||
    probe.getUTCDate() !== parsed.day
  ) {
    return null;
  }

  return parsed;
}

export function isDuration(value: number): value is DurationMinutes {
  return DURATIONS.some((duration) => duration === value);
}

function toEpochMinutes(value: LocalDateTime): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute) / 60000;
}

export function addMinutes(value: LocalDateTime, minutes: number): LocalDateTime {
  const next = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute + minutes));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: next.getUTCHours(),
    minute: next.getUTCMinutes(),
  };
}

export function formatLocalDateTime(value: LocalDateTime): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`;
}

export function sliceHourIndexes(
  times: string[],
  startLocal: string,
  durationMinutes: number,
): number[] {
  const start = parseLocalDateTime(startLocal);
  if (!start) {
    return [];
  }

  const startMin = toEpochMinutes(start);
  const endMin = startMin + durationMinutes;
  const indexes: number[] = [];

  for (let index = 0; index < times.length; index += 1) {
    const hour = parseLocalDateTime(times[index].slice(0, 16));
    if (!hour) {
      continue;
    }
    const hourMin = toEpochMinutes(hour);
    if (hourMin < endMin && hourMin + 60 > startMin) {
      indexes.push(index);
    }
  }

  return indexes;
}

export function roundedHourInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let year = Number(bag.year);
  let month = Number(bag.month);
  let day = Number(bag.day);
  let hour = Number(bag.hour);
  const minute = Number(bag.minute);

  if (minute > 0) {
    hour += 1;
  }
  if (hour >= 24) {
    hour = 0;
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
  }

  return formatLocalDateTime({ year, month, day, hour, minute: 0 });
}

export type DayPeriod = "morning" | "day" | "afternoon" | "night";

export function dayPeriodFromHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) {
    return "morning";
  }
  if (hour >= 11 && hour < 16) {
    return "day";
  }
  if (hour >= 16 && hour < 20) {
    return "afternoon";
  }
  return "night";
}

export function dayPeriodFromLocal(local: string): DayPeriod | null {
  const parsed = parseLocalDateTime(local);
  if (!parsed) {
    return null;
  }
  return dayPeriodFromHour(parsed.hour);
}

export function readVerdict(text: string): "go" | "caution" | "stop" | null {
  const head = text.slice(0, 120).toLowerCase();
  if (head.includes("no salir")) {
    return "stop";
  }
  if (head.includes("precaución") || head.includes("precaucion")) {
    return "caution";
  }
  if (head.includes("salir")) {
    return "go";
  }
  return null;
}
