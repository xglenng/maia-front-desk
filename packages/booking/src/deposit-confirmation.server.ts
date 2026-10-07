import 'server-only';
import crypto from 'node:crypto';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, clients, payments } from '@db/schema';
import { createSchedulingBooking, usesInternalScheduling } from '@/packages/scheduling/service';
import { scheduleConfirmedAppointmentAutomations } from '@/packages/automations/lifecycle.server';

export type DepositConfirmationMethod = 'MANUAL' | 'SQUARE_WEBHOOK' | 'STRIPE_WEBHOOK';

export async function confirmAppointmentDeposit(input: {
  organizationId: string;
  appointmentId: string;
  paymentId?: string;
  providerPaymentIntentId?: string | null;
  confirmingUserId?: string;
  confirmationMethod: DepositConfirmationMethod;
}) {
  const [initial] = await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.organizationId, input.organizationId))).limit(1);
  if (!initial) return { status: 'NOT_FOUND' as const };
  if (initial.status === 'CONFIRMED' && initial.depositStatus === 'PAID') {
    await scheduleConfirmedAppointmentAutomations(initial.id);
    return { status: 'CONFIRMED' as const, appointment: initial, duplicate: true };
  }
  if (initial.status === 'PAYMENT_RECEIVED_SLOT_UNAVAILABLE' && initial.depositStatus === 'PAID') return { status: 'SLOT_UNAVAILABLE' as const, appointment: initial, duplicate: true };
  if (initial.status !== 'PAYMENT_PENDING' || initial.depositStatus !== 'PENDING' || !initial.depositCents || initial.depositCents <= 0) return { status: 'INVALID_STATE' as const };
  if (input.confirmationMethod === 'MANUAL' && initial.paymentProvider !== 'VENMO_MANUAL') return { status: 'PROVIDER_MISMATCH' as const };
  if (input.confirmationMethod === 'STRIPE_WEBHOOK' && initial.paymentProvider && initial.paymentProvider !== 'STRIPE') return { status: 'PROVIDER_MISMATCH' as const };
  if (initial.holdExpiresAt && initial.holdExpiresAt.getTime() < Date.now()) return { status: 'EXPIRED' as const };

  const [payment] = input.paymentId
    ? await db.select().from(payments).where(and(eq(payments.id, input.paymentId), eq(payments.appointmentId, input.appointmentId), eq(payments.organizationId, input.organizationId))).limit(1)
    : await db.select().from(payments).where(and(eq(payments.appointmentId, input.appointmentId), eq(payments.organizationId, input.organizationId), eq(payments.provider, 'venmo_manual'), eq(payments.status, 'PENDING'))).orderBy(sql`${payments.createdAt} DESC`).limit(1);
  if (payment && (payment.amountCents !== initial.depositCents || payment.currency.toLowerCase() !== 'usd')) return { status: 'AMOUNT_MISMATCH' as const };
  if (input.confirmationMethod === 'MANUAL' && payment && payment.provider !== 'venmo_manual') return { status: 'PROVIDER_MISMATCH' as const };

  let providerBookingId = initial.providerBookingId;
  let providerCustomerId: string | undefined;
  let providerStart = initial.startsAt;
  let providerEnd = initial.endsAt;
  let canConfirm = true;
  if (initial.serviceId && !(await usesInternalScheduling(input.organizationId, initial.artistId))) {
    const idempotencyKey = crypto.createHash('sha256').update(`deposit-booking:${initial.id}`).digest('hex');
    const booking = await createSchedulingBooking(input.organizationId, initial.artistId, {
      serviceId: initial.serviceId, clientId: initial.clientId, start: initial.startsAt.toISOString(), idempotencyKey,
    });
    if (booking.status === 'BOOKED') {
      providerBookingId = booking.providerBookingId;
      providerCustomerId = booking.providerCustomerId;
      providerStart = new Date(booking.start);
      providerEnd = new Date(booking.end);
    } else canConfirm = false;
  }

  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM appointments WHERE id = ${input.appointmentId} AND organization_id = ${input.organizationId} FOR UPDATE`);
    const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.organizationId, input.organizationId))).limit(1);
    if (!current) return { status: 'NOT_FOUND' as const };
    if (current.status === 'CONFIRMED' && current.depositStatus === 'PAID') return { status: 'CONFIRMED' as const, appointment: current, duplicate: true };
    if (current.status !== 'PAYMENT_PENDING' || current.depositStatus !== 'PENDING' || current.depositCents !== initial.depositCents) return { status: 'INVALID_STATE' as const };
    if (input.confirmationMethod === 'MANUAL' && current.paymentProvider !== 'VENMO_MANUAL') return { status: 'PROVIDER_MISMATCH' as const };
    if (input.confirmationMethod === 'STRIPE_WEBHOOK' && current.paymentProvider && current.paymentProvider !== 'STRIPE') return { status: 'PROVIDER_MISMATCH' as const };

    let selectedPayment = payment;
    if (selectedPayment) {
      const [lockedPayment] = await tx.select().from(payments).where(and(eq(payments.id, selectedPayment.id), eq(payments.organizationId, input.organizationId), eq(payments.appointmentId, current.id))).limit(1);
      if (!lockedPayment || (lockedPayment.status !== 'PENDING' && lockedPayment.status !== 'PAID')) return { status: 'INVALID_PAYMENT_STATE' as const };
      selectedPayment = lockedPayment;
    } else if (input.confirmationMethod === 'MANUAL') {
      [selectedPayment] = await tx.insert(payments).values({ organizationId: input.organizationId, appointmentId: current.id, provider: 'venmo_manual', amountCents: current.depositCents!, status: 'PENDING', currency: 'usd' }).returning();
    } else return { status: 'PAYMENT_NOT_FOUND' as const };

    if (selectedPayment.status === 'PAID') return { status: 'INVALID_STATE' as const };
    if (current.schedulingProvider === 'INTERNAL' && canConfirm) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${current.artistId}:${current.startsAt.toISOString()}`}))`);
      const [conflict] = await tx.select({ id: appointments.id }).from(appointments).where(and(
        eq(appointments.organizationId, current.organizationId), eq(appointments.artistId, current.artistId), ne(appointments.id, current.id),
        lt(appointments.startsAt, current.endsAt), gte(appointments.endsAt, current.startsAt), eq(appointments.status, 'CONFIRMED'),
      )).limit(1);
      if (conflict) canConfirm = false;
    }
    const now = new Date();
    await tx.update(payments).set({ status: 'PAID', confirmationMethod: input.confirmationMethod, confirmedByUserId: input.confirmingUserId ?? null, confirmedAt: now, ...(input.providerPaymentIntentId !== undefined ? { providerPaymentIntentId: input.providerPaymentIntentId } : {}), updatedAt: now }).where(eq(payments.id, selectedPayment.id));
    if (providerCustomerId) await tx.update(clients).set({ providerCustomerId, updatedAt: now }).where(and(eq(clients.id, current.clientId), eq(clients.organizationId, current.organizationId)));
    const [updated] = await tx.update(appointments).set({
      status: canConfirm ? 'CONFIRMED' : 'PAYMENT_RECEIVED_SLOT_UNAVAILABLE', depositStatus: 'PAID', holdExpiresAt: null,
      providerBookingId, startsAt: providerStart, endsAt: providerEnd, updatedAt: now,
    }).where(and(eq(appointments.id, current.id), eq(appointments.status, 'PAYMENT_PENDING'))).returning();
    return { status: canConfirm ? 'CONFIRMED' as const : 'SLOT_UNAVAILABLE' as const, appointment: updated, duplicate: false };
  });

  if (result.status === 'CONFIRMED' && result.appointment) await scheduleConfirmedAppointmentAutomations(result.appointment.id);
  return result;
}
