const statuses = new Set(["accepted", "queued", "sending", "sent", "delivered", "undelivered", "failed", "canceled"]);
const terminalStatuses = new Set(["delivered", "undelivered", "failed", "canceled"]);
export const STATUS_CALLBACK_LOOKUP_DELAYS_MS = [50, 100, 200, 400] as const;

export function normalizeTwilioMessageStatus(value: string) {
  const status = value.trim().toLowerCase();
  return statuses.has(status) ? status : null;
}

function rank(status: string) {
  if (["accepted", "queued"].includes(status)) return 0;
  if (status === "sending") return 1;
  if (status === "sent") return 2;
  if (terminalStatuses.has(status)) return 3;
  return -1;
}

export function shouldApplyTwilioMessageStatus(currentValue: string | null | undefined, nextValue: string) {
  const next = normalizeTwilioMessageStatus(nextValue);
  if (!next) return false;
  const currentText = currentValue?.trim().toLowerCase();
  if (currentText && !normalizeTwilioMessageStatus(currentText)) return false;
  const current = currentValue ? normalizeTwilioMessageStatus(currentValue) : null;
  if (!current) return true;
  if (current === next) return false;
  if (terminalStatuses.has(current)) return false;
  return rank(next) >= rank(current);
}