export type CheckoutStep = 'LIBRARY' | 'REVIEW' | 'PAYMENT';
// Recovery takes precedence over catalog initialization and back navigation.
export function checkoutVisibleStep(step: CheckoutStep, cardPending: boolean): CheckoutStep {
  return cardPending ? 'PAYMENT' : step;
}
