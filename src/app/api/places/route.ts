import { connection } from "next/server";
import { ConditionsError, locate, searchPlaces } from "@/lib/conditions";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  try {
    if (query) {
      const places = await searchPlaces(query);
      return Response.json({ places });
    }

    if (url.searchParams.has("lat") || url.searchParams.has("lon")) {
      const place = await locate(lat, lon);
      return Response.json({ place });
    }

    return new Response("Escribe una ciudad o comparte tu ubicación.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const message =
      error instanceof ConditionsError ? error.message : "No pude buscar ese lugar.";
    return new Response(message, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
