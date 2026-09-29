import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import {
  appointments,
  clients,
  conversations,
  messages,
  organizations,
  payments,
  services,
} from '@db/schema';
import { sendStudioSms } from '@integrations/studio-sms';

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
    // Only the webhook invocation that actually transitions the appointment
    // from TENTATIVE -> CONFIRMED may send the confirmation message.
    // Square can retry payment.updated events.
    const [confirmedAppointment] = await db.transaction(async tx => {
      await tx
        .update(payments)
        .set({
          status: 'PAID',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.id, localPayment.id),
            eq(payments.organizationId, localPayment.organizationId),
          ),
        );

      return tx
        .update(appointments)
        .set({
          status: 'CONFIRMED',
          depositStatus: 'PAID',
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(appointments.id, localPayment.appointmentId),
            eq(appointments.organizationId, localPayment.organizationId),
            eq(appointments.status, 'TENTATIVE'),
          ),
        )
        .returning();
    });

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
      const [details] = await db
        .select({
          artistId: appointments.artistId,
          clientId: appointments.clientId,
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

        if (details.clientSmsOptIn && details.clientPhone) {
          try {
            const sent = await sendStudioSms({
              organizationId: localPayment.organizationId,
              artistId: details.artistId,
              to: details.clientPhone,
              body: confirmationBody,
            });

            let [conversation] = await db
              .select()
              .from(conversations)
              .where(
                and(
                  eq(conversations.organizationId, localPayment.organizationId),
                  eq(conversations.artistId, details.artistId),
                  eq(conversations.clientId, details.clientId),
                  eq(conversations.channel, 'SMS'),
                  eq(conversations.status, 'OPEN'),
                ),
              )
              .limit(1);

            if (!conversation) {
              [conversation] = await db
                .insert(conversations)
                .values({
                  organizationId: localPayment.organizationId,
                  artistId: details.artistId,
                  clientId: details.clientId,
                  channel: 'SMS',
                  status: 'OPEN',
                  aiEnabled: true,
                  lastMessageAt: new Date(),
                })
                .returning();
            }

            const now = new Date();

            await db.insert(messages).values({
              conversationId: conversation.id,
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
              .set({
                lastMessageAt: now,
                updatedAt: now,
              })
              .where(eq(conversations.id, conversation.id));

            console.log(
              JSON.stringify({
                event: 'square_deposit_confirmation_sent',
                appointmentId: localPayment.appointmentId,
                conversationId: conversation.id,
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
                reason: error instanceof Error ? error.message : 'UNKNOWN',
              }),
            );
          }
        } else {
          console.log(
            JSON.stringify({
              event: 'square_deposit_confirmation_sms_skipped',
              appointmentId: localPayment.appointmentId,
              reason: !details.clientSmsOptIn
                ? 'CLIENT_NOT_OPTED_IN'
                : 'CLIENT_HAS_NO_PHONE',
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
