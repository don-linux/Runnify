"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DayScene } from "@/components/day-scene";
import { Button } from "@/components/ui/button";
import type { HourReading, Place, RunConditions } from "@/lib/conditions";
import { OPEN_METEO_CREDIT } from "@/lib/credits";
import type { RunMessage } from "@/lib/run-message";
import {
  DURATIONS,
  dayPeriodFromLocal,
  readVerdict,
  roundedHourInTimeZone,
  type DurationMinutes,
} from "@/lib/run-window";

const transport = new DefaultChatTransport<RunMessage>({ api: "/api/run" });

const TOOL_LABELS = [
  { type: "tool-pronostico", label: "Pronóstico" },
  { type: "tool-sol", label: "Sol" },
  { type: "tool-aire", label: "Aire" },
] as const;

export function RunAdvice() {
  const { messages, sendMessage, status, error, stop, clearError } = useChat<RunMessage>({
    transport,
  });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [startTouched, setStartTouched] = useState(false);
  const [duration, setDuration] = useState<DurationMinutes>(45);
  const suggestedStart = useSuggestedStart(place?.timezone ?? null);
  const startValue = startTouched ? startLocal : suggestedStart;
  const period = dayPeriodFromLocal(startValue) ?? "day";
  const night = period === "night";

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/run", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setConfigured(false);
          return;
        }
        const payload = (await response.json()) as { configured?: boolean };
        setConfigured(Boolean(payload.configured));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConfigured(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (place || query.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await response.text());
          }
          const payload = (await response.json()) as { places: Place[] };
          setPlaces(payload.places);
          setSearchError(payload.places.length === 0 ? "No encontré esa ciudad." : null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setPlaces([]);
          setSearchError(cause instanceof Error ? cause.message : "No pude buscar ciudades.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [place, query]);

  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  const advice = assistant
    ? assistant.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
    : "";
  const verdict = readVerdict(advice);
  const conditions = assistant?.metadata?.conditions ?? null;
  const busy = status === "submitted" || status === "streaming";

  function choosePlace(next: Place) {
    setPlace(next);
    setQuery(next.label);
    setPlaces([]);
    setSearchError(null);
    clearError();
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setSearchError("Este navegador no comparte la ubicación.");
      return;
    }

    setLocating(true);
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams({
          lat: String(position.coords.latitude),
          lon: String(position.coords.longitude),
        });
        void fetch(`/api/places?${params.toString()}`)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(await response.text());
            }
            const payload = (await response.json()) as { place: Place };
            choosePlace(payload.place);
          })
          .catch((cause: unknown) => {
            setSearchError(cause instanceof Error ? cause.message : "No pude leer tu ubicación.");
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setSearchError("No pude leer tu ubicación. Escríbela o permite el acceso.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function ask() {
    if (!place || !startValue || busy) {
      return;
    }
    clearError();
    void sendMessage(
      {
        text: `Quiero salir a correr en ${place.label} a las ${startValue.replace("T", " ")} durante ${duration} minutos. Consulta el pronóstico, el sol y el aire.`,
      },
      {
        body: {
          place,
          startLocal: startValue,
          durationMinutes: duration,
        },
      },
    );
  }

  return (
    <>
    <DayScene period={period} />
    <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">Salida</p>
          <h1 className={`mt-2 font-heading text-4xl leading-none sm:text-6xl ${night ? "text-white" : "text-foreground"}`}>
            ¿Salgo a correr?
          </h1>
          <p className={`mt-3 max-w-xl text-base leading-7 ${night ? "text-white/80" : "text-muted-foreground"}`}>
            Kimi K2.7 Code mira la hora que elegiste: temperatura, lluvia, sol y el aire que vas a respirar.
            Te dice si sales, con qué cuidado, o si mejor lo dejas.
          </p>
        </div>
        <p className={`max-w-xs text-sm leading-6 ${night ? "text-white/75" : "text-muted-foreground"}`}>
          Modelo <span className={night ? "text-white" : "text-foreground"}>moonshotai/kimi-k2.7-code</span> por Vercel AI Gateway. El
          cielo lo pone Open-Meteo, sin otra clave.
        </p>
      </header>

      {configured === false ? (
        <p className="mb-6 rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-sm leading-6 text-foreground">
          Falta <code className="font-mono">AI_GATEWAY_API_KEY</code> en{" "}
          <code className="font-mono">.env.local</code>. Créala en el AI Gateway de Vercel. El cupo
          incluido de 5 dólares alcanza para este demo. Reinicia el servidor después de guardarla.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-md sm:p-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="place" className="text-sm font-medium">
                Dónde corres
              </label>
              <input
                id="place"
                value={query}
                autoComplete="off"
                placeholder="Coyoacán, Ciudad de México"
                className="h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPlace(null);
                  setPlaces([]);
                  setSearchError(null);
                  setSearching(false);
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
                  {locating ? "Buscando…" : "Usar mi ubicación"}
                </Button>
                {searching ? <span className="text-xs text-muted-foreground">Buscando</span> : null}
              </div>
              {places.length > 0 ? (
                <ul className="overflow-hidden rounded-xl border border-border bg-background">
                  {places.map((option) => (
                    <li key={`${option.latitude}-${option.longitude}-${option.label}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => choosePlace(option)}
                      >
                        {option.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="flex flex-col gap-2">
                <label htmlFor="when" className="text-sm font-medium">
                  Hora de salida
                </label>
                <input
                  id="when"
                  type="datetime-local"
                  value={startValue}
                  suppressHydrationWarning
                  className="h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  onChange={(event) => {
                    setStartTouched(true);
                    setStartLocal(event.target.value);
                  }}
                />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Duración</legend>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={duration === option ? "default" : "outline"}
                      className="h-11"
                      aria-pressed={duration === option}
                      onClick={() => setDuration(option)}
                    >
                      {option} min
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>

            <Button type="submit" className="h-12 text-base" disabled={!place || !startValue || busy || configured === false}>
              {busy ? "Consultando el cielo…" : "¿Salgo a correr?"}
            </Button>
            {busy ? (
              <Button type="button" variant="ghost" onClick={() => stop()}>
                Detener
              </Button>
            ) : null}
          </form>
        </section>

        <section className="flex min-h-[28rem] flex-col rounded-3xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-md sm:p-6">
          <ToolStatus message={assistant} busy={busy} />

          {error ? (
            <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm leading-6">{error.message}</p>
              <Button type="button" variant="outline" className="mt-3" onClick={ask}>
                Reintentar
              </Button>
            </div>
          ) : null}

          {!assistant && !busy && !error ? (
            place ? (
              <div className="flex flex-1 flex-col justify-end">
                <p className="font-heading text-3xl leading-tight text-foreground">
                  {place.name} ya está en el mapa.
                </p>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {configured === false
                    ? "En cuanto guardes la clave del AI Gateway, el botón le pide a Kimi el veredicto de esta hora."
                    : "Pulsa ¿Salgo a correr? y el modelo consulta el pronóstico, el sol y el aire de esa ventana."}
                </p>
              </div>
            ) : (
              <EmptyState />
            )
          ) : null}

          {advice ? <VerdictPill kind={verdict} /> : null}
          {conditions && (advice || !busy) ? <ConditionsPanel conditions={conditions} /> : null}
          {advice ? <AdviceCopy text={advice} kind={verdict} /> : null}
        </section>
      </div>

      <footer className={`mt-8 w-fit rounded-full px-3 py-1 text-xs leading-5 ${night ? "bg-black/45 text-white/80" : "bg-card/85 text-muted-foreground"}`}>{OPEN_METEO_CREDIT}</footer>
    </main>
    </>
  );
}

function subscribeClock() {
  return () => {};
}

function useSuggestedStart(timeZone: string | null): string {
  return useSyncExternalStore(
    subscribeClock,
    () => roundedHourInTimeZone(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => (timeZone ? roundedHourInTimeZone(timeZone) : ""),
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col justify-end">
      <p className="font-heading text-3xl leading-tight text-foreground">
        Elige el lugar y la hora. El resto lo mira el modelo.
      </p>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Una salida de mediodía no se juzga igual que una de las 7. El veredicto usa solo esa
        ventana: sol directo, calor, lluvia y el aire que vas a respirar.
      </p>
    </div>
  );
}

function ToolStatus({ message, busy }: { message: RunMessage | undefined; busy: boolean }) {
  const states = useMemo(() => {
    const parts = message?.parts ?? [];
    return TOOL_LABELS.map((tool) => {
      const part = [...parts].reverse().find((item) => item.type === tool.type);
      const state = part && "state" in part ? part.state : null;
      return { ...tool, state };
    });
  }, [message]);

  if (!busy && states.every((tool) => tool.state == null)) {
    return null;
  }

  return (
    <ol className="mb-5 flex flex-wrap gap-2" aria-live="polite">
      {states.map((tool) => (
        <li
          key={tool.type}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
        >
          {tool.label}
          <span className="ml-2 text-foreground">{toolPhrase(tool.state ?? null, busy)}</span>
        </li>
      ))}
    </ol>
  );
}

function toolPhrase(state: string | null, busy: boolean): string {
  if (state === "output-available") return "listo";
  if (state === "output-error") return "falló";
  if (state || busy) return "consultando";
  return "en espera";
}

function bodyAfterVerdict(text: string, kind: ReturnType<typeof readVerdict>): string {
  if (!kind) {
    return text;
  }
  const [first, ...rest] = text.split("\n");
  if (readVerdict(first) === kind) {
    return rest.join("\n").trim();
  }
  return text;
}

function VerdictPill({ kind }: { kind: ReturnType<typeof readVerdict> }) {
  const label = kind === "stop" ? "No salir" : kind === "caution" ? "Salir con precaución" : kind === "go" ? "Salir" : "Consejo";
  const tone =
    kind === "stop"
      ? "bg-destructive/15 text-destructive"
      : kind === "caution"
        ? "bg-accent text-accent-foreground"
        : kind === "go"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground";

  return (
    <p className={`mx-auto mb-6 flex w-fit max-w-full items-center justify-center rounded-full px-8 py-3 text-center font-heading text-2xl leading-none sm:text-3xl ${tone}`}>
      {label}
    </p>
  );
}

function AdviceCopy({ text, kind }: { text: string; kind: ReturnType<typeof readVerdict> }) {
  const { body, close } = splitClosingLine(bodyAfterVerdict(text, kind).replaceAll("**", ""));

  return (
    <div className="mt-6">
      {body ? <div className="space-y-3 text-base leading-7 whitespace-pre-wrap">{body}</div> : null}
      {close ? (
        <p className="mt-8 text-center font-heading text-2xl italic leading-snug text-foreground">{close}</p>
      ) : null}
    </div>
  );
}

function splitClosingLine(text: string): { body: string; close: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { body: "", close: "" };
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    return {
      body: paragraphs.slice(0, -1).join("\n\n"),
      close: paragraphs[paragraphs.length - 1],
    };
  }

  const lines = trimmed.split("\n").map((part) => part.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { body: lines.slice(0, -1).join("\n"), close: lines[lines.length - 1] };
  }

  return { body: trimmed, close: "" };
}

function ConditionsPanel({ conditions }: { conditions: RunConditions }) {
  const hours = conditions.hours;
  return (
    <div className="border-t border-border pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-2xl">Parámetros de tu run</h2>
        <p className="text-sm text-muted-foreground">
          {clock(conditions.startLocal)}–{clock(conditions.endLocal)} · {conditions.place.label}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Temperatura" value={range(hours, (hour) => hour.temperatureC, "°C")} />
        <Metric label="Sensación" value={maxOf(hours, (hour) => hour.feelsLikeC, "°C")} />
        <Metric label="Lluvia" value={maxOf(hours, (hour) => hour.precipitationProbability, "%")} />
        <Metric
          label="UV"
          value={maxOf(hours, (hour) => hour.uvIndex, "")}
          detail={labelOf(hours, (hour) => hour.uvLabel)}
        />
        <Metric label="Radiación" value={maxOf(hours, (hour) => hour.shortwaveWm2, " W/m²")} />
        <Metric
          label="Aire"
          value={conditions.airNote ? "Sin dato" : (labelOf(hours, (hour) => hour.aqiLabel) ?? "—")}
          detail={conditions.airNote ?? airDetail(hours)}
        />
        <Metric
          label="Sol"
          value={conditions.sunrise ? clock(conditions.sunrise) : "—"}
          detail={conditions.sunset ? `se pone ${clock(conditions.sunset)}` : undefined}
        />
      </dl>
      <ul className="mt-4 flex flex-col gap-2">
        {hours.map((hour) => (
          <li key={hour.time} className="rounded-2xl bg-background/80 px-3 py-2 text-sm leading-6">
            <span className="font-medium">{clock(hour.time)}</span>
            <span className="text-muted-foreground">
              {" "}
              {hour.weather}, {formatNumber(hour.temperatureC, "°C")}, UV {formatNumber(hour.uvIndex)},{" "}
              {formatNumber(hour.shortwaveWm2, " W/m²")}
              {hour.aqiLabel ? `, aire ${hour.aqiLabel}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="rounded-2xl bg-background/80 px-3 py-3">
      <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-2xl leading-none">{value}</dd>
      {detail ? <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function clock(local: string): string {
  return local.slice(11, 16);
}

function formatNumber(value: number | null, suffix = ""): string {
  if (value == null) {
    return "—";
  }
  return `${value}${suffix}`;
}

function maxOf(
  hours: HourReading[],
  pick: (hour: HourReading) => number | null,
  suffix: string,
): string {
  const values = hours.map(pick).filter((value): value is number => value != null);
  if (values.length === 0) {
    return "—";
  }
  return formatNumber(Math.max(...values), suffix);
}

function range(
  hours: HourReading[],
  pick: (hour: HourReading) => number | null,
  suffix: string,
): string {
  const values = hours.map(pick).filter((value): value is number => value != null);
  if (values.length === 0) {
    return "—";
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) {
    return formatNumber(low, suffix);
  }
  return `${low}–${high}${suffix}`;
}

function airDetail(hours: HourReading[]): string | undefined {
  const value = maxOf(hours, (hour) => hour.usAqi, "");
  return value === "—" ? undefined : `índice ${value}`;
}

function labelOf(hours: HourReading[], pick: (hour: HourReading) => string | null): string | null {
  return [...hours].reverse().map(pick).find((value) => value) ?? null;
}
