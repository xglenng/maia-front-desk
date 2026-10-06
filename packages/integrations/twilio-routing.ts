export type InboundPhoneRoute = {
  provider: string;
  organizationId: string | null;
  artistId: string | null;
  lifecycleRole: string;
  retireAfter: Date | null;
};

const inboundLifecycleRoles = new Set(["PRIMARY", "TEMPORARY", "PORTED"]);

export function isInboundPhoneRoutable(number: InboundPhoneRoute | null | undefined, now = new Date()) {
  if (!number || number.provider !== "twilio" || !number.organizationId || !number.artistId) return false;
  if (number.lifecycleRole === "TEMPORARY_GRACE") return Boolean(number.retireAfter && number.retireAfter > now);
  return inboundLifecycleRoles.has(number.lifecycleRole);
}