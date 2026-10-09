import { OPEN_METEO_CREDIT } from "./credits";
import {
  addMinutes,
  formatLocalDateTime,
  isDuration,
  parseLocalDateTime,
  sliceHourIndexes,
  type DurationMinutes,
} from "./run-window";

export class ConditionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionsError";
  }
}

export type Place = {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number | null;
};

export type HourReading = {
  time: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  weather: string;
  windKmh: number | null;
  gustKmh: number | null;
  cloudCover: number | null;
  uvIndex: number | null;
  uvLabel: string | null;
  shortwaveWm2: number | null;
  directWm2: number | null;
  diffuseWm2: number | null;
  usAqi: number | null;
  aqiLabel: string | null;
  pm25: number | null;
};

export type RunConditions = {
  place: Place;
  startLocal: string;
  endLocal: string;
  durationMinutes: DurationMinutes;
  sunrise: string | null;
  sunset: string | null;
  uvIndexMax: number | null;
  airNote: string | null;
  hours: HourReading[];
  source: string;
};

type ForecastPayload = {
  timezone?: string;
  elevation?: number;
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    apparent_temperature?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    precipitation?: Array<number | null>;
    weather_code?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    cloud_cover?: Array<number | null>;
    uv_index?: Array<number | null>;
    shortwave_radiation?: Array<number | null>;
    direct_radiation?: Array<number | null>;
    diffuse_radiation?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    sunrise?: Array<string | null>;
    sunset?: Array<string | null>;
    uv_index_max?: Array<number | null>;
  };
};

type AirPayload = {
  hourly?: {
    time?: string[];
    us_aqi?: Array<number | null>;
    pm2_5?: Array<number | null>;
  };
};

type GeoResult = {
  name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  elevation?: number;
  country?: string;
  admin1?: string;
};

const WEATHER_LABELS: Record<number, string> = {
  0: "cielo despejado",
  1: "mayormente despejado",
  2: "parcialmente nublado",
  3: "nublado",
  45: "niebla",
  48: "niebla con escarcha",
  51: "llovizna ligera",
  53: "llovizna",
  55: "llovizna intensa",
  56: "llovizna helada",
  57: "llovizna helada intensa",
  61: "lluvia ligera",
  63: "lluvia",
  65: "lluvia fuerte",
  66: "lluvia helada",
  67: "lluvia helada fuerte",
  71: "nieve ligera",
  73: "nieve",
  75: "nieve fuerte",
  80: "chubascos ligeros",
  81: "chubascos",
  82: "chubascos fuertes",
  85: "chubascos de nieve",
  86: "chubascos de nieve fuertes",
  95: "tormenta",
  96: "tormenta con granizo",
  99: "tormenta fuerte con granizo",
};

export { OPEN_METEO_CREDIT };

export function weatherLabel(code: number | null): string {
  if (code == null) {
    return "sin dato";
  }
  return WEATHER_LABELS[code] ?? `código ${code}`;
}

export function uvLabel(index: number | null): string | null {
  if (index == null) {
    return null;
  }
  if (index < 3) return "bajo";
  if (index < 6) return "moderado";
  if (index < 8) return "alto";
  if (index < 11) return "muy alto";
  return "extremo";
}

export function aqiLabel(aqi: number | null): string | null {
  if (aqi == null) {
    return null;
  }
  if (aqi <= 50) return "bueno";
  if (aqi <= 100) return "moderado";
  if (aqi <= 150) return "insalubre para sensibles";
  if (aqi <= 200) return "insalubre";
  if (aqi <= 300) return "muy insalubre";
  return "peligroso";
}

function round(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

async function readJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ConditionsError("Open-Meteo no respondió. Reintenta en un momento.");
  }

  if (!response.ok) {
    throw new ConditionsError("Open-Meteo no pudo completar la consulta.");
  }

  return response.json();
}

function placeLabel(result: GeoResult): string {
  const parts = [result.name, result.admin1, result.country].filter(
    (part): part is string => Boolean(part),
  );
  return [...new Set(parts)].join(", ");
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const name = query.trim();
  if (name.length < 2) {
    return [];
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "es");
  url.searchParams.set("format", "json");

  const payload = (await readJson(url.toString())) as { results?: GeoResult[] };
  return (payload.results ?? [])
    .filter(
      (result) =>
        result.name &&
        typeof result.latitude === "number" &&
        typeof result.longitude === "number" &&
        result.timezone,
    )
    .map((result) => ({
      name: result.name as string,
      label: placeLabel(result),
      latitude: result.latitude as number,
      longitude: result.longitude as number,
      timezone: result.timezone as string,
      elevation: result.elevation ?? null,
    }));
}

async function timezoneAt(latitude: number, longitude: number): Promise<string> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");
  const payload = (await readJson(url.toString())) as { timezone?: string };
  if (!payload.timezone) {
    throw new ConditionsError("No pude saber la zona horaria de ese punto.");
  }
  return payload.timezone;
}

async function reverseName(latitude: number, longitude: number): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "es");

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Salida/1.0 (consejo de running; contacto local)",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      address?: Record<string, string>;
    };
    const address = payload.address ?? {};
    const parts = [
      address.suburb || address.neighbourhood || address.quarter,
      address.city || address.town || address.village,
      address.state,
      address.country,
    ].filter((part): part is string => Boolean(part));
    const label = [...new Set(parts)].join(", ");
    return label || null;
  } catch {
    return null;
  }
}

export async function locate(latitude: number, longitude: number): Promise<Place> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ConditionsError("La latitud no es válida.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ConditionsError("La longitud no es válida.");
  }

  const [timezone, label] = await Promise.all([
    timezoneAt(latitude, longitude),
    reverseName(latitude, longitude),
  ]);

  return {
    name: label ?? "Tu ubicación",
    label: label ?? `Tu ubicación (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
    latitude,
    longitude,
    timezone,
    elevation: null,
  };
}

function at<T>(values: T[] | undefined, index: number): T | null {
  const value = values?.[index];
  return value == null ? null : value;
}

export async function loadRunConditions(input: {
  place: Place;
  startLocal: string;
  durationMinutes: number;
}): Promise<RunConditions> {
  const start = parseLocalDateTime(input.startLocal);
  if (!start) {
    throw new ConditionsError("La hora de salida no es válida.");
  }
  if (!isDuration(input.durationMinutes)) {
    throw new ConditionsError("La duración tiene que ser 30, 45 o 60 minutos.");
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(input.place.latitude));
  forecastUrl.searchParams.set("longitude", String(input.place.longitude));
  forecastUrl.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "cloud_cover",
      "uv_index",
      "shortwave_radiation",
      "direct_radiation",
      "diffuse_radiation",
    ].join(","),
  );
  forecastUrl.searchParams.set("daily", "sunrise,sunset,uv_index_max");
  forecastUrl.searchParams.set("timezone", input.place.timezone);
  forecastUrl.searchParams.set("forecast_days", "2");

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.searchParams.set("latitude", String(input.place.latitude));
  airUrl.searchParams.set("longitude", String(input.place.longitude));
  airUrl.searchParams.set("hourly", "us_aqi,pm2_5");
  airUrl.searchParams.set("timezone", input.place.timezone);
  airUrl.searchParams.set("forecast_days", "2");

  const [forecastResult, airResult] = await Promise.allSettled([
    readJson(forecastUrl.toString()) as Promise<ForecastPayload>,
    readJson(airUrl.toString()) as Promise<AirPayload>,
  ]);

  if (forecastResult.status === "rejected") {
    throw forecastResult.reason instanceof ConditionsError
      ? forecastResult.reason
      : new ConditionsError("No pude leer el pronóstico.");
  }

  const forecast = forecastResult.value;
  const times = forecast.hourly?.time ?? [];
  const indexes = sliceHourIndexes(times, input.startLocal, input.durationMinutes);
  if (indexes.length === 0) {
    throw new ConditionsError(
      "Esa hora queda fuera del pronóstico disponible. Elige una salida dentro de las próximas horas.",
    );
  }

  let airNote: string | null = null;
  const airByTime = new Map<string, { aqi: number | null; pm25: number | null }>();
  if (airResult.status === "fulfilled") {
    const airTimes = airResult.value.hourly?.time ?? [];
    airTimes.forEach((time, index) => {
      airByTime.set(time, {
        aqi: round(at(airResult.value.hourly?.us_aqi, index)),
        pm25: round(at(airResult.value.hourly?.pm2_5, index)),
      });
    });
  } else {
    airNote = "El aire no está disponible ahora. El consejo no lo usa.";
  }

  const hours: HourReading[] = indexes.map((index) => {
    const time = times[index];
    const air = airByTime.get(time);
    const uv = round(at(forecast.hourly?.uv_index, index));
    const aqi = air?.aqi ?? null;
    return {
      time,
      temperatureC: round(at(forecast.hourly?.temperature_2m, index)),
      feelsLikeC: round(at(forecast.hourly?.apparent_temperature, index)),
      precipitationProbability: round(at(forecast.hourly?.precipitation_probability, index)),
      precipitationMm: round(at(forecast.hourly?.precipitation, index)),
      weather: weatherLabel(at(forecast.hourly?.weather_code, index)),
      windKmh: round(at(forecast.hourly?.wind_speed_10m, index)),
      gustKmh: round(at(forecast.hourly?.wind_gusts_10m, index)),
      cloudCover: round(at(forecast.hourly?.cloud_cover, index)),
      uvIndex: uv,
      uvLabel: uvLabel(uv),
      shortwaveWm2: round(at(forecast.hourly?.shortwave_radiation, index)),
      directWm2: round(at(forecast.hourly?.direct_radiation, index)),
      diffuseWm2: round(at(forecast.hourly?.diffuse_radiation, index)),
      usAqi: aqi,
      aqiLabel: aqiLabel(aqi),
      pm25: air?.pm25 ?? null,
    };
  });

  const day = input.startLocal.slice(0, 10);
  const dayIndex = forecast.daily?.time?.indexOf(day) ?? -1;

  return {
    place: {
      ...input.place,
      elevation: input.place.elevation ?? forecast.elevation ?? null,
    },
    startLocal: input.startLocal,
    endLocal: formatLocalDateTime(addMinutes(start, input.durationMinutes)),
    durationMinutes: input.durationMinutes,
    sunrise: dayIndex >= 0 ? (forecast.daily?.sunrise?.[dayIndex] ?? null) : null,
    sunset: dayIndex >= 0 ? (forecast.daily?.sunset?.[dayIndex] ?? null) : null,
    uvIndexMax: dayIndex >= 0 ? round(forecast.daily?.uv_index_max?.[dayIndex] ?? null) : null,
    airNote,
    hours,
    source: OPEN_METEO_CREDIT,
  };
}

export function forecastView(conditions: RunConditions) {
  return {
    lugar: conditions.place.label,
    zonaHoraria: conditions.place.timezone,
    salida: conditions.startLocal,
    fin: conditions.endLocal,
    amanecer: conditions.sunrise,
    atardecer: conditions.sunset,
    horas: conditions.hours.map((hour) => ({
      hora: hour.time,
      cielo: hour.weather,
      temperaturaC: hour.temperatureC,
      sensacionC: hour.feelsLikeC,
      lluviaProbabilidad: hour.precipitationProbability,
      lluviaMm: hour.precipitationMm,
      nubes: hour.cloudCover,
    })),
  };
}

export function solarView(conditions: RunConditions) {
  return {
    uvMaximoDelDia: conditions.uvIndexMax,
    horas: conditions.hours.map((hour) => ({
      hora: hour.time,
      uv: hour.uvIndex,
      uvNivel: hour.uvLabel,
      radiacionOndaCortaWm2: hour.shortwaveWm2,
      radiacionDirectaWm2: hour.directWm2,
      radiacionDifusaWm2: hour.diffuseWm2,
    })),
  };
}

export function airView(conditions: RunConditions) {
  if (conditions.airNote) {
    return { disponible: false, nota: conditions.airNote };
  }
  return {
    disponible: true,
    horas: conditions.hours.map((hour) => ({
      hora: hour.time,
      nivel: hour.aqiLabel,
    })),
  };
}
