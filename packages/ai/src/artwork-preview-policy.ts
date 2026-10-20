export const APPOINTMENT_ARTWORK_RULE = 'Tattoo drawings are reviewed at the appointment. Do not promise early previews.';
export function asksForArtworkPreview(text: string) {
  return /\b(drawing|drawings|sketch|sketches|artwork|design|tattoo design)\b/i.test(text) && /\b(see|view|preview|look|send|show|share|ready|before|early)\b/i.test(text);
}
export function artworkPreviewReply(rule: string | undefined) {
  return rule && /\b(drawing|drawings|design|artwork)\b/i.test(rule) && /\b(review|reviewed|shown|show|go over)\b/i.test(rule) && /\b(at|during|on)\b.{0,30}\bappointment\b/i.test(rule) && !/\b(not|never) (reviewed|shown|available)\b/i.test(rule)
    ? 'Drawings are reviewed at your appointment, so you can go over the design with the artist then.'
    : 'The artist will need to confirm whether a drawing preview can be shared before your appointment.';
}
