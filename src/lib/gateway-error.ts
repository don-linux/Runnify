import { APICallError } from "ai";

const CARD_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card";

function errorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (APICallError.isInstance(error)) {
    return `${error.message}\n${error.responseBody ?? ""}\n${errorText(error.cause)}`;
  }
  if (error instanceof Error) {
    return `${error.message}\n${errorText(error.cause)}`;
  }
  return "";
}

function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error) && error.statusCode) {
    return error.statusCode;
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const status = error.statusCode;
    if (typeof status === "number") {
      return status;
    }
  }
  if (error instanceof Error && error.cause) {
    return statusOf(error.cause);
  }
  return undefined;
}

export function publicModelError(error: unknown): string {
  const detail = errorText(error);
  const status = statusOf(error);

  if (detail.includes("customer_verification_required") || detail.includes("credit card on file")) {
    return `La clave sirve, pero el AI Gateway aún no suelta los 5 dólares. Agrega una tarjeta en el equipo de Vercel y vuelve a preguntar: ${CARD_URL}`;
  }
  if (status === 401) {
    return "La clave del AI Gateway no es válida. Revisa AI_GATEWAY_API_KEY.";
  }
  if (status === 402) {
    return "El crédito del AI Gateway se agotó. Revisa el saldo antes de volver a preguntar.";
  }
  if (status === 403) {
    return "El AI Gateway rechazó la consulta. Confirma que GLM 5.3 esté disponible en tu cupo.";
  }
  if (status === 429) {
    return "GLM 5.3 está limitado por un momento. Espera y reintenta.";
  }

  return "No pude completar el consejo. Reintenta en un momento.";
}
