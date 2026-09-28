import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, payments } from '@db/schema';

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
    await db.transaction(async tx => {
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

      await tx
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
        );
    });

    console.log(
      JSON.stringify({
        event: 'square_deposit_paid',
        squareEventId: event.event_id,
        squarePaymentId: payment.id,
        squareOrderId: payment.order_id,
        appointmentId: localPayment.appointmentId,
        organizationId: localPayment.organizationId,
      }),
    );
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
