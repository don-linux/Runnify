import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from "ai";
import { connection } from "next/server";
import { z } from "zod";
import {
  airView,
  ConditionsError,
  forecastView,
  loadRunConditions,
  solarView,
  type Place,
  type RunConditions,
} from "@/lib/conditions";
import { publicModelError } from "@/lib/gateway-error";
import { isDuration, parseLocalDateTime } from "@/lib/run-window";

export const maxDuration = 60;

const INSTRUCTIONS = `Eres el asesor de salida de Salida. Hablas en español, claro y breve, como un entrenador que mira el cielo.

Antes de opinar llama las tres herramientas: pronostico, sol y aire. Usa solo lo que devuelven. Si un dato falta, dilo y no lo inventes. El viento no cuenta: no lo menciones.

La primera línea debe ser exactamente una de estas:
Salir
Salir con precaución
No salir

Después, en dos o tres párrafos cortos, explica la salida con la temperatura, la lluvia, el sol y el aire. Incluye ropa, protector, agua, si conviene mover la hora y una nota de ruta (sombra, asfalto, esfuerzo).

Del aire habla en palabras de todos los días, usando el nivel de la herramienta: limpio si es bueno, aceptable si es moderado, pesado si incomoda a quien es sensible, y mejor no correr si está insalubre o peor. No digas siglas ni cifras del aire.

Del sol di si pega suave, fuerte o ya se fue. No cites vatios ni unidades técnicas.

Umbrales orientativos:
- Sol moderado o alto: protector y gorra; si pega muy fuerte, otra hora o no salir.
- Lluvia probable o precipitación notable: precaución o no salir.
- Aire pesado: precaución. Aire insalubre o peor: no salir.
- Sensación por encima de 32 °C: acortar, hidratar y bajar el ritmo; por encima de 36 °C: no salir.
- Sensación por debajo de 5 °C: capas y precaución.

Si varios factores se juntan, elige el veredicto más conservador.

Cierra con un párrafo de una sola frase, motivadora y concreta para esta salida. Si el veredicto es no salir, anima a cuidar el cuerpo y volver en una hora mejor. Sin citas de autores.`;

export async function GET() {
  await connection();
  return Response.json({
    configured: Boolean(process.env.AI_GATEWAY_API_KEY),
  });
}

function plain(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function readPlace(value: unknown): Place | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const place = value as Partial<Place>;
  if (
    typeof place.label !== "string" ||
    typeof place.name !== "string" ||
    typeof place.timezone !== "string" ||
    typeof place.latitude !== "number" ||
    typeof place.longitude !== "number" ||
    place.label.length > 180 ||
    place.timezone.length > 80 ||
    place.latitude < -90 ||
    place.latitude > 90 ||
    place.longitude < -180 ||
    place.longitude > 180
  ) {
    return null;
  }

  return {
    name: place.name,
    label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
    elevation: typeof place.elevation === "number" ? place.elevation : null,
  };
}

export async function POST(request: Request) {
  await connection();

  if (!process.env.AI_GATEWAY_API_KEY) {
    return plain(
      "Falta AI_GATEWAY_API_KEY. Créala en el AI Gateway de Vercel y ponla en .env.local.",
      503,
    );
  }

  let body: {
    messages?: UIMessage[];
    place?: unknown;
    startLocal?: unknown;
    durationMinutes?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return plain("La consulta no se pudo leer.", 400);
  }

  const place = readPlace(body.place);
  const startLocal = typeof body.startLocal === "string" ? body.startLocal : "";
  const durationMinutes = Number(body.durationMinutes);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const latest = [...messages].reverse().find((message) => message.role === "user");

  if (!place || !parseLocalDateTime(startLocal) || !isDuration(durationMinutes) || !latest) {
    return plain("Elige un lugar, una hora y una duración antes de preguntar.", 400);
  }

  let conditions: RunConditions;
  try {
    conditions = await loadRunConditions({ place, startLocal, durationMinutes });
  } catch (error) {
    const message =
      error instanceof ConditionsError ? error.message : "No pude leer el cielo de esa hora.";
    return plain(message, 502);
  }

  const windowField = z.object({
    ventana: z
      .string()
      .optional()
      .describe("Hora local de salida, en formato YYYY-MM-DDTHH:mm. Si la omites, se usa la hora de la consulta."),
  });

  const result = streamText({
    model: "moonshotai/kimi-k2.7-code",
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages([latest]),
    reasoning: "low",
    stopWhen: isStepCount(5),
    tools: {
      pronostico: tool({
        description:
          "Pronóstico de Open-Meteo para la ventana de la salida: temperatura, sensación, lluvia, nubes, amanecer y atardecer.",
        inputSchema: windowField,
        execute: async () => forecastView(conditions),
      }),
      sol: tool({
        description:
          "Sol de Open-Meteo para la ventana de la salida: si pega suave o fuerte. El nivel de UV viene en palabras.",
        inputSchema: windowField,
        execute: async () => solarView(conditions),
      }),
      aire: tool({
        description:
          "Aire de la ventana, en palabras: bueno, moderado, insalubre para sensibles, insalubre, muy insalubre o peligroso. Si no está disponible, el campo disponible viene en falso.",
        inputSchema: windowField,
        execute: async () => airView(conditions),
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: false,
      originalMessages: [latest],
      messageMetadata: () => ({ conditions }),
      onError: publicModelError,
    }),
  });
}
