# Salida

Una pantalla para runners. Eliges lugar, hora y duración, y **GLM 5.3** dice si conviene salir, salir con precaución o no salir. Antes de opinar consulta el pronóstico, el UV, la radiación solar y la calidad del aire.

El clima sale de [Open-Meteo](https://open-meteo.com/), que no pide clave. El modelo se llama por [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) con `zai/glm-5.3`. La única clave es `AI_GATEWAY_API_KEY`.

## Cómo correrlo

Necesitas Node.js 22 o superior.

```bash
npm install
cp .env.example .env.local
```

En `.env.local` pega una clave del AI Gateway. Cada equipo de Vercel incluye 5 USD al mes; para usarlos la cuenta necesita un método de pago guardado. Esos 5 USD alcanzan para un demo de este consejo.

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Qué mira el consejo

- Temperatura, sensación térmica, lluvia, viento y nubes.
- Índice UV y radiación de onda corta, directa y difusa.
- AQI de EE. UU. y PM2.5.
- La ventana de la salida (30, 45 o 60 minutos), no el día entero.

Si el aire falla, el consejo lo dice y no inventa ese dato.

Los datos de Open-Meteo van bajo la licencia [CC BY 4.0](https://open-meteo.com/en/licence). Si usas el GPS, el nombre del lugar sale de OpenStreetMap.
