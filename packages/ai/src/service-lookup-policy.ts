/** Resolve real service IDs again: conversation text does not retain tool results. */
export function requiresServiceLookup(message: string): boolean {
  return /\b(price|prices|cost|costs|deposit|availability|available|openings|slots|schedule|scheduling|book|booking)\b|how much/i.test(message);
}

export function serviceScopedTools<T extends string>(tools: T[], servicesDiscovered: boolean): T[] {
  return servicesDiscovered ? tools : tools.filter(name => !['get_service_pricing', 'check_availability', 'createBookingHold'].includes(name));
}
