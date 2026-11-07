// Enable only in Stripe test mode while the fee is being verified.
export function testPlatformFee(amountCents: number, livemode: boolean) {
  if (livemode || process.env.MAIA_STRIPE_TEST_PLATFORM_FEE !== 'true') return {};
  const feeCents = Math.round(amountCents * 150 / 10_000);
  return feeCents > 0 ? { application_fee_amount: feeCents } : {};
}
