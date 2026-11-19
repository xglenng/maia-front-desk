import { identity, protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db, pool } from '@db/index';
import { appointments, artists, clients, organizations, services } from '@db/schema';
import { generateText } from 'ai';
import { configuredLanguageModel } from '@/packages/ai/src/model-config';
import { z } from 'zod';

async function handlePOST(request: NextRequest) {
  try {
    const user = await identity(request);
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const body = await request.json();
    const parsed = z.object({ message: z.string().trim().min(1).max(1000) }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Enter a question of up to 1000 characters.' }, { status: 400 });
    const { message } = parsed.data;

    if (/^(?:what are (?:my |the )?|show (?:me )?(?:my |the )?)?unpaid invoices[?.!]*$/i.test(message)) {
      const result = await pool.query<{ client_name: string; total_cents: number; total_count: string }>(
        `SELECT i.client_name, i.total_cents, count(*) OVER() AS total_count
         FROM studio_invoices i
         JOIN artists a ON a.id=i.artist_id AND a.organization_id=i.organization_id
         WHERE i.organization_id=$1 AND i.status='OPEN' AND ($2::boolean OR a.user_id=$3)
         ORDER BY i.created_at DESC, i.id DESC LIMIT 10`,
        [user.organization_id, user.role === 'OWNER', user.id],
      );
      const count = Number(result.rows[0]?.total_count ?? 0);
      const invoices = result.rows.map(row =>
        `• ${row.client_name}: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.total_cents / 100)} original amount`
      ).join('\n');
      const reply = count
        ? `${count} ${count === 1 ? 'invoice is' : 'invoices are'} recorded as open in Maia.${count > result.rows.length ? ` Showing the ${result.rows.length} most recent.` : ''}\n${invoices}\n\nAmounts are original invoice totals, not necessarily balances due. Refresh payment status on the Invoices page to check Stripe for current payment status.`
        : 'No invoices are currently recorded as open in Maia. Refresh payment status on the Invoices page to check Stripe for current payment status.';
      return NextResponse.json({ reply });
    }

    // Get the user's organization
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, user.organization_id))
      .limit(1);

    if (!org) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });

    // Get available artists for this user
    const availableArtists = await db
      .select({ id: artists.id, displayName: artists.displayName })
      .from(artists)
      .where(
        and(
          eq(artists.organizationId, org.id),
          user.role === 'ARTIST' ? eq(artists.userId, user.id) : undefined
        )
      );

    if (availableArtists.length === 0) {
      return NextResponse.json({ error: 'No artists configured.' }, { status: 404 });
    }

    const artistIds = availableArtists.map(a => a.id);

    // Gather business data for context
    let businessContext = '';

    // Get this week's bookings
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(0, 0, 0, 0);

    try {
      const thisWeekBookings = await db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          serviceName: services.name,
          status: appointments.status,
        })
        .from(appointments)
        .innerJoin(clients, and(eq(appointments.clientId, clients.id), eq(appointments.organizationId, clients.organizationId)))
        .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(appointments.organizationId, services.organizationId)))
        .where(
          and(
            eq(appointments.organizationId, org.id),
            inArray(appointments.artistId, artistIds),
            gte(appointments.startsAt, weekStart),
            lt(appointments.startsAt, weekEnd)
          )
        )
        .orderBy(appointments.startsAt);

      if (thisWeekBookings.length > 0) {
        businessContext += `\n\nThis week's bookings (${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}):`;
        thisWeekBookings.forEach(b => {
          const date = new Date(b.startsAt).toLocaleDateString();
          const clientName = `${b.clientFirstName} ${b.clientLastName}`.trim();
          businessContext += `\n- ${clientName} - ${b.serviceName || 'Service'} on ${date} (${b.status})`;
        });
      } else {
        businessContext += `\n\nThis week's bookings: No appointments scheduled.`;
      }
    } catch (e) {
      businessContext += `\n\nThis week's bookings: Unable to load.`;
    }

    // Get monthly revenue
    try {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const monthlyRevenue = await db
        .select({
          total: sql<number>`COALESCE(SUM(${appointments.priceCents}), 0)`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.organizationId, org.id),
            inArray(appointments.artistId, artistIds),
            gte(appointments.startsAt, monthStart),
            lt(appointments.startsAt, monthEnd),
            eq(appointments.status, 'CONFIRMED')
          )
        );

      const monthlyTotal = (monthlyRevenue[0]?.total || 0) / 100;
      businessContext += `\n\nMonthly revenue (${monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}): $${monthlyTotal.toFixed(2)} from confirmed appointments.`;
    } catch (e) {
      businessContext += `\n\nMonthly revenue: Unable to load.`;
    }

    businessContext += `\n\nInvoice details are not included in this response. For open invoices, ask "Unpaid invoices" or open the Invoices page.`;

    // Get onboarding readiness
    const readinessResponse = await fetch('http://localhost:3000/api/onboarding/readiness', {
      headers: { cookie: request.headers.get('cookie') || '' },
    }).catch(() => null);

    let onboardingContext = '';
    if (readinessResponse?.ok) {
      const readinessData = await readinessResponse.json();
      const readiness = readinessData.readiness;
      const nextIncompleteStep = readiness.steps.find(
        (s: any) => s.status !== 'COMPLETE' && s.status !== 'OPTIONAL'
      );
      if (nextIncompleteStep) {
        onboardingContext = `\n\nSetup progress: The studio is not fully set up. The next step is "${nextIncompleteStep.title}". `;
      } else {
        onboardingContext = `\n\nSetup progress: The studio is fully set up and ready to go.`;
      }
    }

    // Generate response using the configured model
    const systemPrompt = `You are the Maia Business Manager, an AI assistant for tattoo and piercing studios. You help studio owners understand their business performance and guide them through setup.

You have access to the following data for ${org.name}:${businessContext}${onboardingContext}

When users ask about their business:
- Provide accurate information based on the data provided
- Use the studio's timezone (${org.timezone || 'UTC'}) for dates/times
- Show revenue breakdowns and invoice totals clearly
- Distinguish between paid and unpaid invoices
- When data is missing, clearly explain what's not available

When users ask to be walked through setup:
- Explain one setup step at a time
- Link them to the relevant Maia configuration screen
- Show their current progress

Keep responses concise and professional. For complex requests, ask clarifying questions.`;

    const { text: reply } = await generateText({
      model: configuredLanguageModel(),
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
      temperature: 0.7,
      maxTokens: 500,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Business Manager error:', error);
    return NextResponse.json(
      { error: 'Failed to process request.' },
      { status: 500 }
    );
  }
}

export const POST = protectedRoute(handlePOST);
