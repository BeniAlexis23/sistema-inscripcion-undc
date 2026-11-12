/** Capture once per document: independent of the server/container timezone. */
export function pdfDate(now = new Date()) {
  const zone = { timeZone: 'America/Lima' };
  const short = new Intl.DateTimeFormat('es-PE', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  const long = new Intl.DateTimeFormat('es-PE', { ...zone, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('es-PE', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { short, long, time, dateTime: `${short} ${time} (Lima)` };
}
