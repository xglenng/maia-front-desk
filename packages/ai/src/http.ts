import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { agentContextSelectionSchema } from './context-policy';
import { MaiaAgentContextError, resolveAuthenticatedMaiaAgentContext } from './context.server';
import { runMaiaAgent } from './agent.server';

const inputSchema = agentContextSelectionSchema.extend({ message: z.string().min(1).max(4000) });

export async function handlePOST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  try {
    const { context } = await resolveAuthenticatedMaiaAgentContext(request, input);
    const result = await runMaiaAgent(context, { message: input.message });
    return NextResponse.json(result, { status: 'error' in result ? 409 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI receptionist failed';
    const status = error instanceof MaiaAgentContextError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
