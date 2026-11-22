import type { Chart } from './model';
import { guestsAt } from './model';
import { roomSize, tableBox } from './layouts';
import { FOOTER } from './pdf';

export function chartPng(chart: Chart): Promise<Blob> {
  const room = roomSize(chart.tables);
  const s = 2, head = 50, foot = 30;
  const c = document.createElement('canvas');
  c.width = room.w * s; c.height = (room.h + head + foot) * s;
  const x = c.getContext('2d')!;
  x.scale(s, s);
  x.fillStyle = '#fff'; x.fillRect(0, 0, room.w, room.h + head + foot);
  x.fillStyle = '#1f2937'; x.font = 'bold 22px system-ui, sans-serif';
  x.fillText(chart.title || 'Seating chart', 20, 34);
  x.translate(0, head);
  for (const t of chart.tables) {
    const b = tableBox(t);
    x.strokeStyle = '#6b7280'; x.lineWidth = 1.5; x.fillStyle = '#f9fafb';
    x.beginPath();
    if (t.shape === 'round') x.ellipse(t.x + b.w / 2, t.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    else x.rect(t.x, t.y, b.w, b.h);
    x.fill(); x.stroke();
    x.fillStyle = '#111827'; x.font = 'bold 13px system-ui, sans-serif';
    const pad = t.shape === 'round' ? b.w * 0.18 : 8;
    x.fillText(t.name, t.x + pad, t.y + 20, b.w - pad * 2);
    x.font = '12px system-ui, sans-serif';
    guestsAt(chart, t.id).forEach((g, i) => x.fillText(g.name, t.x + pad, t.y + 40 + i * 20, b.w - pad * 2));
  }
  x.fillStyle = '#6b7280'; x.font = '11px system-ui, sans-serif';
  x.fillText(FOOTER, 20, room.h + 18);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
}
