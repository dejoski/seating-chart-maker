export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const EXTRA: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'Œ': 'OE', 'œ': 'oe', 'Ħ': 'H', 'ħ': 'h' };

/** Make text safe for PDF standard fonts (WinAnsi). Strips accents only when needed. */
export function pdfSafe(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else if (ch === '\u2019' || ch === '\u2018') out += "'";
    else if (ch === '\u201c' || ch === '\u201d') out += '"';
    else if (ch === '\u2013' || ch === '\u2014') out += '-';
    else if (EXTRA[ch]) out += EXTRA[ch];
    else {
      const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
    }
  }
  return out;
}

export function sortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return (last + ' ' + parts.join(' ')).toLowerCase();
}

export function csvCell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v; // avoid spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
