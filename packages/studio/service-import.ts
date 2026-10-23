export type ImportedService = {
  name: string; serviceType: string; category: string | null; description: string | null;
  durationMinutes: number; pricingType: 'FLAT' | 'HOURLY' | 'QUOTE';
  basePriceCents: number | null; hourlyRateCents: number | null; requiresArtistApproval: boolean;
};
export const serviceCsvTemplate = 'Name,Service Type,Duration Minutes,Pricing Type,Price,Category,Description\r\nTattoo consultation,TATTOO,30,FLAT,50,Consultations,Initial consultation\r\n';
export function serviceImportKey(service: Pick<ImportedService, 'name' | 'serviceType'>) {
  return `${service.serviceType.trim().toUpperCase()}\u0000${service.name.trim().toLocaleLowerCase('en-US')}`;
}

function csvRecords(source: string): string[][] {
  if (source.length > 1_000_000) throw new Error('CSV files must be smaller than 1 MB.');
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false;
  const push = () => { row.push(value); value = ''; closed = false; if (row.length > 40) throw new Error('CSV files may contain at most 40 columns.'); };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (char === '"') { if (source[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += char; continue; }
    if (char === '"') { if (value || closed) throw new Error('Invalid CSV quoting.'); quoted = true; }
    else if (char === ',') push();
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[i + 1] === '\n') i++; push(); if (row.some(cell => cell.trim())) rows.push(row); row = []; if (rows.length > 251) throw new Error('Import up to 250 services at a time.'); }
    else { if (closed && char.trim()) throw new Error('Unexpected text after a quoted CSV value.'); if (!closed) value += char; }
  }
  if (quoted) throw new Error('A quoted CSV value is not closed.');
  push(); if (row.some(cell => cell.trim())) rows.push(row);
  if (rows.length > 251) throw new Error('Import up to 250 services at a time.');
  return rows;
}
const headerKey = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string> = { name: 'name', servicename: 'name', itemname: 'name', servicetype: 'type', type: 'type', durationminutes: 'duration', duration: 'duration', pricingtype: 'pricing', pricingmethod: 'pricing', price: 'price', category: 'category', description: 'description', currency: 'currency' };

export function parseServiceCsv(source: string) {
  const records = csvRecords(source);
  if (records.length < 2) throw new Error('Include a header row and at least one service.');
  const headers = records[0].map(value => aliases[headerKey(value)] || headerKey(value));
  if (new Set(headers).size !== headers.length) throw new Error('Remove duplicate CSV column names.');
  if (!headers.includes('name') || !headers.includes('duration')) throw new Error('CSV needs Name and Duration Minutes columns. Download the template for the expected format.');
  const seen = new Set<string>();
  return records.slice(1).map((record, index) => {
    const row = index + 2;
    const fields = Object.fromEntries(headers.map((header, i) => [header, (record[i] || '').trim()]));
    const errors: string[] = [];
    if (record.length !== headers.length) errors.push('Column count does not match the header.');
    const name = fields.name;
    const serviceType = (fields.type || 'OTHER').toUpperCase();
    if (!name || name.length > 120) errors.push('Name is required and must be at most 120 characters.');
    if (!/^[A-Z][A-Z0-9_ -]{0,39}$/.test(serviceType)) errors.push('Service Type must be a short text label.');
    const durationMinutes = Number(fields.duration);
    if (!/^\d+$/.test(fields.duration) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) errors.push('Duration must be 1–1440 whole minutes.');
    const pricing = (fields.pricing || 'FLAT').toUpperCase().replace(/[ -]/g, '_');
    const pricingTypes: Record<string, ImportedService['pricingType']> = { FIXED: 'FLAT', FIXED_PRICE: 'FLAT', FLAT: 'FLAT', HOURLY: 'HOURLY', QUOTE: 'QUOTE' };
    const pricingType = pricingTypes[pricing];
    if (!pricingType) errors.push('Pricing Type must be FLAT, HOURLY, or QUOTE.');
    let cents: number | null = null;
    if (pricingType !== 'QUOTE') {
      const price = (fields.price || '').replace(/^\$/, '');
      if (!/^\d+(?:\.\d{1,2})?$/.test(price)) errors.push('Price must be a dollar amount; use QUOTE for variable pricing.');
      else { const [whole, fraction = ''] = price.split('.'); cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2)); if (!Number.isSafeInteger(cents) || cents > 2147483647) errors.push('Price is too large.'); }
    }
    if (fields.currency && fields.currency.toUpperCase() !== 'USD') errors.push('Only USD prices are supported.');
    if ((fields.category || '').length > 80 || (fields.description || '').length > 500) errors.push('Category or description is too long.');
    const service: ImportedService = { name, serviceType, category: fields.category || null, description: fields.description || null, durationMinutes, pricingType: pricingType || 'QUOTE', basePriceCents: pricingType === 'FLAT' ? cents : null, hourlyRateCents: pricingType === 'HOURLY' ? cents : null, requiresArtistApproval: pricingType === 'QUOTE' };
    const key = serviceImportKey(service);
    if (seen.has(key)) errors.push('Duplicate service name and type in this file.');
    seen.add(key);
    return { row, service, errors };
  });
}
