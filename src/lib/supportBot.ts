/** UUID do assistente de suporte (IA) — deve ser o mesmo da Edge Function support-ai-reply */
export const SUPPORT_BOT_SENDER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

export function isSupportBotMessage(senderId: string): boolean {
  return senderId === SUPPORT_BOT_SENDER_ID;
}
