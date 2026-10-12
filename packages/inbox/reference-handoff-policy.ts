export function shouldHandoffReference(input: { quoteConfigured: boolean; quoteApproved: boolean; tattooContext: boolean; latestAttachments: Array<{ type?: string }> }) {
  return input.quoteConfigured && !input.quoteApproved && input.tattooContext && input.latestAttachments.some(attachment => attachment.type === 'image');
}
