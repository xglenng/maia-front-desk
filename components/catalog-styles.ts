// Shared catalog styling keeps service and merchandise settings consistent.
export const field = { width: '100%', boxSizing: 'border-box' as const, padding: 10, border: '1px solid #d9d3cc', borderRadius: 7, font: 'inherit' };
export const labelStyle = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };
export const panel = { border: '1px solid #e4dfda', borderRadius: 8, background: '#fff', padding: 18 };
export const primaryButton = { border: 0, borderRadius: 7, padding: '10px 15px', background: '#181716', color: '#fff', fontWeight: 700, cursor: 'pointer' };
export const secondaryButton = { border: '1px solid #ccc', borderRadius: 7, padding: '9px 12px', background: '#fff', color: '#181716', fontWeight: 600, cursor: 'pointer' };
export const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 };
export const toggleRow = { display: 'flex', flexWrap: 'wrap' as const, gap: 16, alignItems: 'center', marginTop: 14, fontSize: 13 };
export const serviceRow = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 12, borderTop: '1px solid #eee', padding: '12px 0' };
export const statusLabel = { fontSize: 12, fontWeight: 700, padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap' as const };
export const alert = { background: '#fff0f0', color: '#8b1e1e', padding: 12, borderRadius: 6 };
export const noticeStyle = { background: '#eef5ee', color: '#2f7651', padding: 12, borderRadius: 6 };
