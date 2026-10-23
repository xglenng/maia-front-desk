'use client';
import { useState } from 'react';
import { serviceCsvTemplate, type ImportedService } from '@/packages/studio/service-import';

type Row = { row: number; service: ImportedService; errors: string[]; exists: boolean };
const button = { padding: '10px 16px', border: '1px solid #ccc', borderRadius: 22, font: 'inherit', cursor: 'pointer', background: '#fff', color: '#181716' };
export default function ServiceImport({ organizationId, artistId, onManual, onImported }: { organizationId: string; artistId: string; onManual: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(false);
  const [square, setSquare] = useState(false);
  async function request(source: string, action: 'PREVIEW' | 'IMPORT') {
    const response = await fetch('/api/services/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, artistId, csv: source, action }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to import services.');
    return body;
  }
  async function preview(file: File | undefined) {
    setRows([]); setCsv(''); setMessage('');
    if (!file) return;
    if (file.size > 1_000_000 || !file.name.toLowerCase().endsWith('.csv')) { setMessage('Choose a CSV file smaller than 1 MB. In Excel, save the sheet as CSV first.'); return; }
    setBusy(true);
    try { const source = await file.text(); const result = await request(source, 'PREVIEW'); setCsv(source); setRows(result.rows); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to read CSV.'); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setMessage('');
    try { const result = await request(csv, 'IMPORT'); setMessage(`${result.imported} services imported. ${result.skipped} existing services skipped.`); setRows([]); setCsv(''); onImported(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to import services.'); }
    finally { setBusy(false); }
  }
  const valid = rows.length > 0 && rows.every(row => !row.errors.length);
  return <section aria-label="Service setup options" style={{ marginTop: 18, padding: 18, border: '1px solid #ddd', borderRadius: 12, background: '#fff' }}>
    <h2 style={{ marginTop: 0, fontSize: 19 }}>Bring your service list into Maia</h2>
    <p>Assign imports to the artist selected above. Existing services are preserved; importing never changes their prices or deposits.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><button type="button" style={button} disabled={!artistId || busy} onClick={() => { setSquare(!square); setUpload(false); }}>Import from Square</button><button type="button" style={button} disabled={!artistId || busy} onClick={() => { setUpload(!upload); setSquare(false); }}>Upload CSV / Excel export</button><button type="button" style={button} disabled={!artistId || busy} onClick={onManual}>Add manually</button></div>
    {square && <div style={{ marginTop: 16 }}><p>Use the existing Square importer to review and select services. It currently requires connecting Square as this artist’s scheduling provider; a standalone import that keeps Maia’s calendar active is not available yet.</p><a href="/settings/scheduling">Open Square connection and service import →</a></div>}
    {upload && <div style={{ marginTop: 18 }}><p>Use CSV exported from Excel or another system. Required columns: Name, Duration Minutes, and Price (or Pricing Type = QUOTE). Prices are USD. Deposits are not imported.</p><a download="maia-services-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(serviceCsvTemplate)}`}>Download CSV template</a><label style={{ display: 'block', marginTop: 16 }}>Choose service CSV<input aria-label="Service CSV file" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void preview(event.target.files?.[0])} style={{ display: 'block', marginTop: 8 }} /></label></div>}
    {busy && <p role="status">Checking services…</p>}
    {message && <p role="status">{message}</p>}
    {rows.length > 0 && <><h3>Review {rows.length} service rows</h3><p>Nothing has been saved yet. Fix invalid rows in your spreadsheet and upload again.</p><div style={{ overflowX: 'auto', maxHeight: 360 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Row', 'Service', 'Type', 'Minutes', 'Price', 'Result'].map(title => <th key={title} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #ddd' }}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.service.name}</td><td>{row.service.serviceType}</td><td>{row.service.durationMinutes}</td><td>{row.service.pricingType === 'QUOTE' ? 'Quote' : `$${((row.service.basePriceCents ?? row.service.hourlyRateCents ?? 0) / 100).toFixed(2)}${row.service.pricingType === 'HOURLY' ? '/hr' : ''}`}</td><td>{row.errors.length ? row.errors.join(' ') : row.exists ? 'Already exists — skip' : 'Ready to import'}</td></tr>)}</tbody></table></div><button type="button" style={{ ...button, marginTop: 16 }} disabled={busy || !valid || rows.every(row => row.exists)} onClick={() => void save()}>Import {rows.filter(row => !row.exists).length} services</button></>}
  </section>;
}
