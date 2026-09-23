import Stripe from 'stripe';

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

export async function createDepositCheckout(input: { appointmentId: string; organizationId: string; amountCents: number; customerEmail?: string | null; successUrl: string; cancelUrl: string }) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: input.customerEmail ?? undefined,
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Tattoo appointment deposit' }, unit_amount: input.amountCents }, quantity: 1 }],
    metadata: { appointmentId: input.appointmentId, organizationId: input.organizationId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}
