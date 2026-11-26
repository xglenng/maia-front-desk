// HTML date inputs need a local calendar date, not a UTC timestamp slice.
export function localCalendarDate(date=new Date()):string{
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
