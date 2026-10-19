export function platformAdmin(userId: string, configured = process.env.PLATFORM_ADMIN_USER_IDS || '') {
  return configured.split(',').map(value => value.trim()).filter(Boolean).includes(userId);
}

// Includes GSM extension characters, which consume two septets.
export function smsSegments(text: string): number {
  if (!text) return 0;
  const basic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const extension = '^{}\\[~]|€\f';
  let length = 0;
  for (const character of text) {
    if (basic.includes(character)) length++;
    else if (extension.includes(character)) length += 2;
    else return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  }
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

export function modelCost(model: string, input: number, output: number, config = process.env.AI_USAGE_RATES_JSON || '{}'): number | null {
  try {
    const rate = JSON.parse(config)[model];
    if (!rate || !Number.isFinite(rate.input) || !Number.isFinite(rate.output) || rate.input < 0 || rate.output < 0) return null;
    return (input * rate.input + output * rate.output) / 1_000_000;
  } catch { return null; }
}

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
