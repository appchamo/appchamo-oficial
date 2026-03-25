/** Marcador de mensagem de solicitação de agendamento (parseada no MessageThread). */
export const CHAT_APPOINTMENT_REQUEST_MARKER = "📅 CHAMO_APPOINTMENT_REQUEST";

export function buildChatAppointmentRequestMessage(params: {
  servicesLabel: string;
  dateDdMmYyyy: string;
  slot: string;
}): string {
  return [CHAT_APPOINTMENT_REQUEST_MARKER, params.servicesLabel, params.dateDdMmYyyy, params.slot].join("\n");
}

export type ParsedAppointmentRequest = { service: string; dateLine: string; time: string };

export function parseChatAppointmentRequestMessage(content: string): ParsedAppointmentRequest | null {
  if (!content.startsWith(`${CHAT_APPOINTMENT_REQUEST_MARKER}\n`)) return null;
  const lines = content.split("\n");
  if (lines.length < 4) return null;
  const service = lines[1]?.trim() ?? "";
  const dateLine = lines[2]?.trim() ?? "";
  const time = lines[3]?.trim() ?? "";
  if (!service || !dateLine || !time) return null;
  return { service, dateLine, time };
}

/** Mensagens antigas (markdown ** não renderizado no app). */
export function parseLegacyAppointmentRequestMessage(content: string): ParsedAppointmentRequest | null {
  const m = content.match(
    /^Agendamento solicitado:\s*(?:\*\*)?(.+?)(?:\*\*)?\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+às\s+([\d:]+)\./i,
  );
  if (!m) return null;
  return { service: m[1].replace(/\*+/g, "").trim(), dateLine: m[2], time: m[3] };
}
