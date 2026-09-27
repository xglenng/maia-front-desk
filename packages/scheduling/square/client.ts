import { isLosslessNumber, parse, parseLosslessNumber } from 'lossless-json';
import { squareApiVersion, squareBaseUrl } from './config';

export class SquareApiError extends Error {
  constructor(readonly status: number, readonly codes: string[]) {
    super('Square API request failed.');
    this.name = 'SquareApiError';
  }
}

type SquareErrorBody = { errors?: Array<{ code?: string }> };
type SquareLocation = { id: string; name: string; status?: string; timezone?: string };
type SquareTeamMember = { id: string; given_name?: string; family_name?: string; status?: string };
type SquareJsonInt64 = number | bigint | string | ReturnType<typeof parseLosslessNumber>;
type SquareCatalogObject = {
  id: string;
  type: string;
  version?: SquareJsonInt64;
  item_data?: { name?: string; product_type?: string; variations?: Array<{ id: string }> };
  item_variation_data?: { name?: string; item_id?: string; service_duration?: SquareJsonInt64 };
};
export type SquareServiceVariation = { id: string; version: string | null; name: string; durationMinutes: number | null };
export type SquareAvailability = {
  start_at?: string;
  location_id?: string;
  appointment_segments?: Array<{ service_variation_id?: string; team_member_id?: string; duration_minutes?: number }>;
};

export class SquareApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = squareBaseUrl(),
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Square-Version': squareApiVersion(),
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const bodyText = await response.text();
    let body: unknown = {};
    try {
      body = parse(bodyText, null, { parseNumber: parseLosslessNumber });
    } catch {
      body = {};
    }
    const parsedBody = body as SquareErrorBody;
    if (!response.ok) throw new SquareApiError(response.status, parsedBody.errors?.map(error => error.code || 'UNKNOWN') || []);
    return body as T;
  }

  async listLocations() {
    const body = await this.request<{ locations?: SquareLocation[] }>('/v2/locations');
    return (body.locations || []).filter(location => location.id && location.status !== 'INACTIVE').map(location => ({ id: location.id, name: location.name || location.id, timezone: location.timezone || 'UTC' }));
  }

  async searchTeamMembers() {
    const members: SquareTeamMember[] = [];
    let cursor: string | undefined;
    do {
      const body = await this.request<{ team_members?: SquareTeamMember[]; cursor?: string }>('/v2/team-members/search', {
        method: 'POST',
        body: JSON.stringify({ query: { filter: { status: 'ACTIVE' } }, limit: 100, ...(cursor ? { cursor } : {}) }),
      });
      members.push(...(body.team_members || []));
      cursor = body.cursor;
    } while (cursor);
    return members.filter(member => member.id).map(member => ({
      id: member.id,
      name: [member.given_name, member.family_name].filter(Boolean).join(' ') || member.id,
    }));
  }

  async listServiceVariations(): Promise<SquareServiceVariation[]> {
    const objects: SquareCatalogObject[] = [];
    let cursor: string | undefined;
    do {
      const body = await this.request<{ objects?: SquareCatalogObject[]; related_objects?: SquareCatalogObject[]; cursor?: string }>('/v2/catalog/search', {
        method: 'POST',
        body: JSON.stringify({ object_types: ['ITEM'], include_related_objects: true, ...(cursor ? { cursor } : {}) }),
      });
      objects.push(...(body.objects || []), ...(body.related_objects || []));
      cursor = body.cursor;
    } while (cursor);

    const byId = new Map(objects.map(object => [object.id, object]));
    const variations: SquareServiceVariation[] = [];
    for (const item of objects) {
      if (item.type !== 'ITEM' || item.item_data?.product_type !== 'APPOINTMENTS_SERVICE') continue;
      for (const reference of item.item_data.variations || []) {
        const variation = byId.get(reference.id);
        if (variation?.type !== 'ITEM_VARIATION' || !variation.item_variation_data) continue;
        const durationMs = safeSquareNumber(variation.item_variation_data.service_duration);
        variations.push({
          id: variation.id,
          version: squareInt64String(variation.version),
          name: [item.item_data.name, variation.item_variation_data.name].filter(Boolean).join(' · ') || variation.id,
          durationMinutes: durationMs == null ? null : Math.ceil(durationMs / 60_000),
        });
      }
    }
    return variations;
  }

  async searchAvailability(input: {
    locationId: string;
    serviceVariationId: string;
    teamMemberId?: string | null;
    startAt: string;
    endAt: string;
  }) {
    const segmentFilter: Record<string, unknown> = { service_variation_id: input.serviceVariationId };
    if (input.teamMemberId) segmentFilter.team_member_id_filter = { any: [input.teamMemberId] };
    return this.request<{ availabilities?: SquareAvailability[] }>('/v2/bookings/availability/search', {
      method: 'POST',
      body: JSON.stringify({ query: { filter: {
        start_at_range: { start_at: input.startAt, end_at: input.endAt },
        location_id: input.locationId,
        segment_filters: [segmentFilter],
      } } }),
    });
  }
}

export function squareInt64String(value: SquareJsonInt64 | undefined): string | null {
  if (value == null) return null;
  if (isLosslessNumber(value)) {
    const text = value.toString();
    return /^\d+$/.test(text) ? text : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  if (typeof value === 'string') return /^\d+$/.test(value) ? value : null;
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
}

function safeSquareNumber(value: SquareJsonInt64 | undefined): number | null {
  const decimal = squareInt64String(value);
  if (decimal == null) return null;
  const bigintValue = BigInt(decimal);
  return bigintValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bigintValue) : null;
}