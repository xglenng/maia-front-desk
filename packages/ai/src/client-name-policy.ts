export function hasBookingName(firstName: string | null | undefined): boolean {
  return Boolean(firstName?.trim()) && !/^(sms|social|unknown|client)$/i.test(firstName!.trim());
}
