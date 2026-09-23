export function normalizePortStatus(value: unknown) {
  return String(value || "UNKNOWN").trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
}

export function portNeedsAction(requestStatus: unknown, phoneStatus?: unknown) {
  const values = [normalizePortStatus(requestStatus), normalizePortStatus(phoneStatus)];
  return values.some(value => ["ACTION_REQUIRED", "PORT_REJECTED", "REJECTED", "EXPIRED"].includes(value));
}

export function portIsComplete(requestStatus: unknown, phoneStatus?: unknown) {
  return normalizePortStatus(requestStatus) === "COMPLETED" || normalizePortStatus(phoneStatus) === "COMPLETED";
}

export function minimumTargetPortDate(now = new Date()) {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + 7);
  return value.toISOString().slice(0, 10);
}
