import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db } from '@db/index';
import {
  appointments,
  clients,
  conversations,
  messages,
  organizations,
  payments,
  services,
  schedulingConnections,
} from '@db/schema';
import { sendStudioSms } from '@integrations/studio-sms';
import { createSchedulingBooking, usesInternalScheduling } from '@/packages/scheduling/service';
import { SquareApiClient } from '@/packages/scheduling/square/client';
import { squareAccessToken } from '@/packages/scheduling/square/credentials';

type SquarePayment = {
  id?: string;
  order_id?: string;
  status?: string;
  amount_money?: {
    amount?: number;
    currency?: string;
  };
};

type SquareWebhookEvent = {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: SquarePayment;
    };
  };
};

function webhookUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.TWILIO_WEBHOOK_BASE_URL;

  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured.');
  }

  return `${base.replace(/\/$/, '')}/api/payments/square/webhook`;
}

function verifySquareSignature(
  body: string,
  signature: string,
  signatureKey: string,
) {
  const payload = webhookUrl() + body;

  const expected = crypto
    .createHmac('sha256', signatureKey)
    .update(payload)
    .digest('base64');

  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

  if (!signatureKey) {
    return NextResponse.json(
      { error: 'Square webhook signature key is not configured' },
      { status: 503 },
    );
  }

  const signature = request.headers.get('x-square-hmacsha256-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Square webhook signature' },
      { status: 400 },
    );
  }

  const body = await request.text();

  if (!verifySquareSignature(body, signature, signatureKey)) {
    return NextResponse.json(
      { error: 'Invalid Square webhook signature' },
      { status: 400 },
    );
  }

  let event: SquareWebhookEvent;

  try {
    event = JSON.parse(body) as SquareWebhookEvent;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (event.type !== 'payment.updated') {
    return NextResponse.json({ received: true });
  }

  const payment = event.data?.object?.payment;

  if (!payment?.order_id) {
    return NextResponse.json({ received: true });
  }

  const [localPayment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.provider, 'square'),
        eq(payments.providerCheckoutSessionId, payment.order_id),
      ),
    )
    .limit(1);

  if (!localPayment) {
    console.warn(
      JSON.stringify({
        event: 'square_webhook_payment_not_found',
        squareEventId: event.event_id,
        squarePaymentId: payment.id,
        squareOrderId: payment.order_id,
      }),
    );

    return NextResponse.json({ received: true });
  }

  if (payment.status === 'COMPLETED') {
    const [pendingAppointment] = await db.select().from(appointments).where(and(
      eq(appointments.id, localPayment.appointmentId),
      eq(appointments.organizationId, localPayment.organizationId),
    )).limit(1);

    if (!pendingAppointment) {
      return NextResponse.json({ received: true });
    }

    // A deposit does not reserve a slot. At payment time we attempt to claim
    // the slot. External providers enforce their own booking conflict rules;
    // internal scheduling uses a PostgreSQL advisory lock for this artist/time.
    let providerBookingId = pendingAppointment.providerBookingId;
    let providerCustomerId: string | undefined;
    let providerStart = pendingAppointment.startsAt;
    let providerEnd = pendingAppointment.endsAt;
    let canConfirm = pendingAppointment.status === 'PAYMENT_PENDING';

    if (canConfirm && pendingAppointment.serviceId) {
      const internalScheduling = await usesInternalScheduling(pendingAppointment.organizationId, pendingAppointment.artistId);
      if (!internalScheduling) {
        const idempotencyKey = crypto.createHash('sha256').update(`deposit-booking:${pendingAppointment.id}`).digest('hex');
        const booking = await createSchedulingBooking(pendingAppointment.organizationId, pendingAppointment.artistId, {
          serviceId: pendingAppointment.serviceId,
          clientId: pendingAppointment.clientId,
          start: pendingAppointment.startsAt.toISOString(),
          idempotencyKey,
        });
        if (booking.status === 'BOOKED') {
          providerBookingId = booking.providerBookingId;
          providerCustomerId = booking.providerCustomerId;
          providerStart = new Date(booking.start);
          providerEnd = new Date(booking.end);
        } else {
          canConfirm = false;
          console.warn(JSON.stringify({
            event: 'square_deposit_slot_lost',
            appointmentId: pendingAppointment.id,
            bookingStatus: booking.status,
            message: booking.message,
          }));
        }
      }
    }

    const [confirmedAppointment] = canConfirm ? await db.transaction(async tx => {
      // Serialize internal claims for this artist/start. External scheduling has
      // already claimed the provider slot above.
      if ((pendingAppointment.schedulingProvider || 'INTERNAL') === 'INTERNAL') {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${pendingAppointment.artistId}:${pendingAppointment.startsAt.toISOString()}`}))`);
        const [conflict] = await tx.select({ id: appointments.id }).from(appointments).where(and(
          eq(appointments.organizationId, pendingAppointment.organizationId),
          eq(appointments.artistId, pendingAppointment.artistId),
          ne(appointments.id, pendingAppointment.id),
          lt(appointments.startsAt, pendingAppointment.endsAt),
          gte(appointments.endsAt, pendingAppointment.startsAt),
          eq(appointments.status, 'CONFIRMED'),
        )).limit(1);
        if (conflict) return [];
      }

      await tx.update(payments).set({ status: 'PAID', updatedAt: new Date() }).where(and(
        eq(payments.id, localPayment.id),
        eq(payments.organizationId, localPayment.organizationId),
      ));

      if (providerCustomerId) {
        await tx.update(clients).set({ providerCustomerId, updatedAt: new Date() }).where(and(
          eq(clients.id, pendingAppointment.clientId),
          eq(clients.organizationId, pendingAppointment.organizationId),
        ));
      }

      return tx.update(appointments).set({
        status: 'CONFIRMED',
        depositStatus: 'PAID',
        holdExpiresAt: null,
        providerBookingId,
        startsAt: providerStart,
        endsAt: providerEnd,
        updatedAt: new Date(),
      }).where(and(
        eq(appointments.id, localPayment.appointmentId),
        eq(appointments.organizationId, localPayment.organizationId),
        eq(appointments.status, 'PAYMENT_PENDING'),
      )).returning();
    }) : [];

    if (!confirmedAppointment) {
      // Payment succeeded after another client secured the slot (or the
      // provider rejected it). Keep an explicit state so support can refund or
      // reschedule; never falsely confirm the appointment.
      await db.update(payments).set({ status: 'PAID', updatedAt: new Date() }).where(eq(payments.id, localPayment.id));
      await db.update(appointments).set({ status: 'PAYMENT_RECEIVED_SLOT_UNAVAILABLE', depositStatus: 'PAID', updatedAt: new Date() }).where(and(
        eq(appointments.id, localPayment.appointmentId),
        eq(appointments.status, 'PAYMENT_PENDING'),
      ));
    }

    console.log(
      JSON.stringify({
        event: 'square_deposit_paid',
        squareEventId: event.event_id,
        squarePaymentId: payment.id,
        squareOrderId: payment.order_id,
        appointmentId: localPayment.appointmentId,
        organizationId: localPayment.organizationId,
        transitionedToConfirmed: Boolean(confirmedAppointment),
      }),
    );

    if (confirmedAppointment) {
      // This client won the slot. Cancel all other unpaid intents that overlap
      // it, and disable their Square payment links so they cannot pay later.
      const competing = await db.select({
        appointmentId: appointments.id,
        paymentId: payments.id,
        paymentLinkId: payments.providerCheckoutLinkId,
      }).from(appointments).leftJoin(payments, and(
        eq(payments.appointmentId, appointments.id),
        eq(payments.status, 'PENDING'),
      )).where(and(
        eq(appointments.organizationId, pendingAppointment.organizationId),
        eq(appointments.artistId, pendingAppointment.artistId),
        ne(appointments.id, pendingAppointment.id),
        lt(appointments.startsAt, pendingAppointment.endsAt),
        gte(appointments.endsAt, pendingAppointment.startsAt),
        eq(appointments.status, 'PAYMENT_PENDING'),
      ));

      if (competing.length) {
        const [connection] = await db.select().from(schedulingConnections).where(and(
          eq(schedulingConnections.organizationId, pendingAppointment.organizationId),
          eq(schedulingConnections.artistId, pendingAppointment.artistId),
          eq(schedulingConnections.provider, 'SQUARE'),
          eq(schedulingConnections.status, 'CONNECTED'),
        )).limit(1);
        const square = connection ? new SquareApiClient(await squareAccessToken(connection)) : null;
        for (const loser of competing) {
          if (square && loser.paymentLinkId) {
            try { await square.deletePaymentLink(loser.paymentLinkId); }
            catch (error) { console.error(JSON.stringify({ event: 'square_competing_payment_link_cancel_failed', appointmentId: loser.appointmentId, reason: error instanceof Error ? error.message : 'UNKNOWN' })); }
          }
          if (loser.paymentId) await db.update(payments).set({ status: 'CANCELED', updatedAt: new Date() }).where(eq(payments.id, loser.paymentId));
          await db.update(appointments).set({ status: 'CANCELED', updatedAt: new Date() }).where(and(eq(appointments.id, loser.appointmentId), eq(appointments.status, 'PAYMENT_PENDING')));
        }
      }

      const [details] = await db
        .select({
          artistId: appointments.artistId,
          clientId: appointments.clientId,
          conversationId: appointments.conversationId,
          startsAt: appointments.startsAt,
          depositCents: appointments.depositCents,
          serviceName: services.name,
          clientPhone: clients.phone,
          clientSmsOptIn: clients.smsOptIn,
          organizationName: organizations.name,
          organizationTimezone: organizations.timezone,
        })
        .from(appointments)
        .innerJoin(
          clients,
          and(
            eq(clients.id, appointments.clientId),
            eq(clients.organizationId, appointments.organizationId),
          ),
        )
        .innerJoin(
          organizations,
          eq(organizations.id, appointments.organizationId),
        )
        .leftJoin(services, eq(services.id, appointments.serviceId))
        .where(
          and(
            eq(appointments.id, localPayment.appointmentId),
            eq(appointments.organizationId, localPayment.organizationId),
          ),
        )
        .limit(1);

      if (details) {
        const timezone = details.organizationTimezone || 'UTC';

        const appointmentTime = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(details.startsAt);

        const amount = ((details.depositCents ?? localPayment.amountCents) / 100)
          .toFixed(2);

        const service = details.serviceName || 'appointment';

        const confirmationBody =
          `${details.organizationName}: Your $${amount} deposit has been received. ` +
          `Your ${service} appointment for ${appointmentTime} is confirmed.`;

        // Route the asynchronous confirmation back to the exact conversation
        // that created the appointment. This avoids guessing between WEB, SMS,
        // and future social channels for the same client.
        const [originConversation] = details.conversationId
          ? await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.id, details.conversationId),
                  eq(conversations.organizationId, localPayment.organizationId),
                ),
              )
              .limit(1)
          : [];

        if (originConversation?.channel === 'WEB') {
          const now = new Date();

          await db.insert(messages).values({
            conversationId: originConversation.id,
            senderType: 'AI',
            role: 'assistant',
            content: confirmationBody,
            metadata: {
              provider: 'square',
              source: 'square_deposit_confirmation',
              appointmentId: localPayment.appointmentId,
            },
          });

          await db
            .update(conversations)
            .set({ lastMessageAt: now, updatedAt: now })
            .where(eq(conversations.id, originConversation.id));

          console.log(
            JSON.stringify({
              event: 'square_deposit_confirmation_web',
              appointmentId: localPayment.appointmentId,
              conversationId: originConversation.id,
            }),
          );
        } else if (originConversation?.channel === 'SMS') {
          if (!details.clientSmsOptIn || !details.clientPhone) {
            console.log(
              JSON.stringify({
                event: 'square_deposit_confirmation_sms_skipped',
                appointmentId: localPayment.appointmentId,
                conversationId: originConversation.id,
                reason: !details.clientSmsOptIn
                  ? 'CLIENT_NOT_OPTED_IN'
                  : 'CLIENT_HAS_NO_PHONE',
              }),
            );
          } else {
            try {
              const sent = await sendStudioSms({
                organizationId: localPayment.organizationId,
                artistId: details.artistId,
                to: details.clientPhone,
                body: confirmationBody,
              });
              const now = new Date();

              await db.insert(messages).values({
                conversationId: originConversation.id,
                senderType: 'AI',
                role: 'assistant',
                content: confirmationBody,
                externalMessageId: sent.sid,
                metadata: {
                  provider: 'twilio',
                  status: sent.status,
                  studioPhone: sent.studioPhone,
                  source: 'square_deposit_confirmation',
                  appointmentId: localPayment.appointmentId,
                },
              });

              await db
                .update(conversations)
                .set({ lastMessageAt: now, updatedAt: now })
                .where(eq(conversations.id, originConversation.id));

              console.log(
                JSON.stringify({
                  event: 'square_deposit_confirmation_sent',
                  appointmentId: localPayment.appointmentId,
                  conversationId: originConversation.id,
                  messageSid: sent.sid,
                }),
              );
            } catch (error) {
              // The payment and appointment are already confirmed. A Twilio
              // problem must not cause Square to retry the financial webhook.
              console.error(
                JSON.stringify({
                  event: 'square_deposit_confirmation_failed',
                  appointmentId: localPayment.appointmentId,
                  conversationId: originConversation.id,
                  reason: error instanceof Error ? error.message : 'UNKNOWN',
                }),
              );
            }
          }
        } else {
          console.log(
            JSON.stringify({
              event: 'square_deposit_confirmation_channel_skipped',
              appointmentId: localPayment.appointmentId,
              conversationId: details.conversationId,
              channel: originConversation?.channel ?? null,
              reason: details.conversationId
                ? 'UNSUPPORTED_OR_MISSING_CONVERSATION'
                : 'APPOINTMENT_HAS_NO_CONVERSATION',
            }),
          );
        }
      }
    }
  }

  if (payment.status === 'FAILED') {
    await db
      .update(payments)
      .set({
        status: 'FAILED',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, localPayment.id));
  }

  if (payment.status === 'CANCELED') {
    await db
      .update(payments)
      .set({
        status: 'CANCELED',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, localPayment.id));
  }

  return NextResponse.json({ received: true });
}
