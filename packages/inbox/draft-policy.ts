import { z } from 'zod';

export const draftDetailsSchema = z.object({
  body: z.string().trim().min(1).max(1600),
  inboundVersion: z.number().int().nonnegative(),
  sourceMessageId: z.string().uuid(),
  status: z.enum(['PENDING', 'SENDING', 'SENT', 'DISCARDED', 'REVIEW_REQUIRED']),
  automationJobId: z.string().uuid().optional(),
});
export type ReplyDraft = z.infer<typeof draftDetailsSchema> & { id: string };

export function shouldDraftReply(aiMode: string, channel: string, forced = false) {
  return forced || (aiMode === 'DRAFT' && channel !== 'WEB_TEST');
}

export function reviewableDraft(event: { id: string; details: unknown } | undefined, inboundVersion: number, aiMode: string): ReplyDraft | null {
  const parsed = draftDetailsSchema.safeParse(event?.details);
  return event && aiMode === 'DRAFT' && parsed.success && parsed.data.status === 'PENDING' && parsed.data.inboundVersion === inboundVersion
    ? { id: event.id, ...parsed.data } : null;
}

const readTools = new Set(['getClient', 'get_studio_context', 'search_services', 'get_service_pricing', 'list_artists', 'check_availability', 'get_client_appointments']);
export function draftReadTools<T>(tools: Record<string, T>) {
  return Object.fromEntries(Object.entries(tools).filter(([name]) => readTools.has(name)));
}

// A null override preserves the artist default for existing and new conversations.
export function effectiveReplyMode(override: string | null | undefined, artistDefault: string, requiresSupervisorApproval = false): string {
  if (requiresSupervisorApproval) return "DRAFT";
  return override === "DRAFT" || override === "ASSISTED" ? override : artistDefault;
}
