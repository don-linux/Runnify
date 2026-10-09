import { APICallError } from "ai";

export function publicModelError(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;

  if (status === 401) {
    return "La clave del AI Gateway no es válida. Revisa AI_GATEWAY_API_KEY.";
  }
  if (status === 402) {
    return "El crédito del AI Gateway se agotó. Revisa el saldo antes de volver a preguntar.";
  }
  if (status === 403) {
    return "El AI Gateway rechazó la consulta. Si es la primera vez, confirma el método de pago del equipo o que GLM 5.3 esté en tu cupo.";
  }
  if (status === 429) {
    return "GLM 5.3 está limitado por un momento. Espera y reintenta.";
  }

  return "No pude completar el consejo. Reintenta en un momento.";
}
