import { z } from "zod";

export const ArtistContext = z.object({
  artistId: z.string(),
  displayName: z.string(),
  hourlyRateCents: z.number(),
  minimumPriceCents: z.number(),
  aiMode: z.enum(["DRAFT", "ASSISTED", "AUTONOMOUS"])
});

export type ArtistContext = z.infer<typeof ArtistContext>;

export interface BookingTools {
  getAvailableSlots(input: {
    artistId: string;
    durationMinutes: number;
    from: string;
    to: string;
  }): Promise<Array<{ start: string; end: string }>>;

  createBookingHold(input: {
    artistId: string;
    clientId: string;
    start: string;
    end: string;
  }): Promise<{ holdId: string; expiresAt: string }>;

  createDepositCheckout(input: {
    appointmentHoldId: string;
    amountCents: number;
  }): Promise<{ checkoutUrl: string }>;

  sendWaiver(input: {
    clientId: string;
    appointmentHoldId: string;
  }): Promise<{ waiverUrl: string }>;

  escalateToArtist(input: {
    conversationId: string;
    reason: string;
  }): Promise<void>;
}
