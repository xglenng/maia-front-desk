// Produce a deterministic, display-safe US E.164 number for mock mode.
// UUID hexadecimal letters are converted to decimal digits instead of being
// copied into the phone number.
export function mockPhoneNumber(artistId: string) {
  const decimalDigits = artistId
    .replace(/[^0-9a-f]/gi, "")
    .split("")
    .map(character => (Number.parseInt(character, 16) % 10).toString())
    .join("")
    .slice(0, 7)
    .padEnd(7, "0");
  return `+1555${decimalDigits}`;
}

export function isE164PhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
