/**
 * Normaliza WhatsApp para E.164 ("+5511999990000"). Números brasileiros sem DDI ganham +55.
 * Retorna null quando não parece um telefone.
 */
export function normalizeWhatsapp(input: string): string | null {
  const raw = input.trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!raw.startsWith("+") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}
