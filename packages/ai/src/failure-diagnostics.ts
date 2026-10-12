const errorNames = new Set([
  'AI_InvalidToolArgumentsError', 'AI_NoSuchToolError', 'AI_ToolExecutionError',
  'AI_APICallError', 'AI_RetryError', 'AI_NoObjectGeneratedError',
  'ZodError', 'RangeError', 'TypeError', 'AbortError', 'SquareApiError',
]);
const toolNames = new Set([
  'get_studio_context', 'search_services', 'get_service_pricing', 'list_artists',
  'check_availability', 'get_client_appointments', 'save_client_name', 'request_artist_quote', 'confirm_quote_terms', 'accept_quote_terms', 'getClient', 'createBookingHold',
  'create_deposit_request', 'getWaiverLink', 'sendMessage', 'escalateToArtist',
]);
const fields = new Set(['serviceId', 'fromDate', 'toDate', 'artistPreference', 'timePeriod']);

/** Persist only bounded codes, never error messages, tool arguments, or provider bodies. */
export function agentFailureDiagnostics(error: unknown) {
  const chain: string[] = [];
  const invalidFields = new Set<string>();
  let toolName: string | undefined;
  let statusCode: number | undefined;
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 5 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    const value = current as Record<string, unknown>;
    const name = typeof value.name === 'string' && errorNames.has(value.name) ? value.name : 'UnknownError';
    chain.push(name);
    if (typeof value.toolName === 'string' && toolNames.has(value.toolName)) toolName ??= value.toolName;
    const status = value.statusCode ?? value.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) statusCode ??= status;
    if (name === 'ZodError' && Array.isArray(value.issues)) {
      for (const issue of value.issues) {
        if (issue && typeof issue === 'object' && Array.isArray(issue.path)) {
          const field = issue.path[0];
          if (typeof field === 'string' && fields.has(field)) invalidFields.add(field);
        }
      }
    }
    current = value.cause;
  }
  return { code: chain.find(name => name !== 'UnknownError') || 'AgentExecutionError', errorChain: chain, toolName, statusCode, invalidFields: [...invalidFields] };
}
