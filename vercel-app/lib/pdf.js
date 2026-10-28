// ============================================================
//  PDF mínimo sin dependencias (A4, Helvetica/Helvetica-Bold, imágenes JPEG).
//  Suficiente para documentos de texto con logo y firmas; corre igual en local y en Vercel.
//  Coordenadas: x desde la izquierda, y desde ARRIBA (se convierten al sistema de PDF al escribir).
// ============================================================
import zlib from 'node:zlib';

const W = 595.28, H = 841.89;

// Anchos AFM (1/1000 em) de Helvetica y Helvetica-Bold para los caracteres 32–126
const HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
// Caracteres fuera de Latin-1 que sí existen en WinAnsi (cp1252)
const CP1252 = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function charCode(ch) {
  const c = ch.codePointAt(0);
  if (c < 128 || (c >= 0xa0 && c <= 0xff)) return c;
  return CP1252[ch] || 0x3f; // '?'
}
// Anchos de los signos de cp1252 que no están en ASCII (rayas, comillas tipográficas, puntos suspensivos…)
const EXTRA = { '—': [1000, 1000], '–': [556, 556], '‘': [222, 278], '’': [222, 278], '“': [333, 500], '”': [333, 500], '…': [1000, 1000], '•': [350, 350], '€': [556, 556], '·': [278, 278], '°': [400, 400] };
function charWidth(ch, bold) {
  const t = bold ? HB : HV;
  if (EXTRA[ch]) return EXTRA[ch][bold ? 1 : 0];
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return t[c - 32];
  const base = ch.normalize('NFD')[0];                 // á → a, ñ → n
  const b = base.codePointAt(0);
  if (b >= 32 && b <= 126) return t[b - 32];
  return 556;
}
export function textWidth(str, size, bold) {
  let w = 0;
  for (const ch of String(str)) w += charWidth(ch, bold);
  return (w * size) / 1000;
}
function pdfString(str) {
  let out = '';
  for (const ch of String(str).replace(/[\r\n\t]+/g, ' ')) {
    const c = charCode(ch);
    const s = String.fromCharCode(c);
    out += s === '(' || s === ')' || s === '\\' ? '\\' + s : s;
  }
  return '(' + out + ')';
}
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => c.map((v) => num(v / 255)).join(' ');

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('invalid JPEG');
}

export class PDF {
  constructor() {
    this.W = W; this.H = H;
    this.pages = [];
    this.images = [];
    this.addPage();
  }
  addPage() { this.ops = []; this.pages.push(this.ops); }
  text(x, y, str, { size = 10, bold = false, color = [0, 0, 0] } = {}) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(H - y)} Td ${pdfString(str)} Tj ET`);
    return textWidth(str, size, bold);
  }
  textRight(xRight, y, str, o = {}) { return this.text(xRight - textWidth(str, o.size || 10, o.bold), y, str, o); }
  textCenter(y, str, o = {}) { return this.text((W - textWidth(str, o.size || 10, o.bold)) / 2, y, str, o); }
  line(x1, y1, x2, y2, { color = [0, 0, 0], width = 0.6 } = {}) {
    this.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, width = 0.6 } = {}) {
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(`${fill ? rgb(fill) + ' rg ' : ''}${stroke ? rgb(stroke) + ' RG ' + num(width) + ' w ' : ''}${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re ${op}`);
  }
  // JPEG (Buffer) con caja (w,h) en puntos; devuelve la altura usada
  image(jpeg, x, y, w, h) {
    const { w: pw, h: ph, comps } = jpegSize(jpeg);
    if (!h) h = (w * ph) / pw;
    if (!w) w = (h * pw) / ph;
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, data: jpeg, pw, ph, comps });
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(H - y - h)} cm /${name} Do Q`);
    return h;
  }
  // Párrafo con segmentos [{t, bold}] ajustado a maxW; devuelve la y final
  paragraph(x, y, segs, maxW, { size = 10, lead = 14, color = [0, 0, 0] } = {}) {
    const words = [];
    for (const s of segs) for (const w of String(s.t).split(/(\s+)/)) if (w) words.push({ t: w, bold: !!s.bold });
    let line = [], lw = 0;
    const flush = () => {
      let cx = x;
      for (const w of line) cx += this.text(cx, y, w.t, { size, bold: w.bold, color });
      y += lead; line = []; lw = 0;
    };
    for (const w of words) {
      const ww = textWidth(w.t, size, w.bold);
      if (/^\s+$/.test(w.t)) { if (line.length) { line.push(w); lw += ww; } continue; }
      if (lw + ww > maxW && line.length) { while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop(); flush(); }
      line.push(w); lw += ww;
    }
    if (line.length) flush();
    return y;
  }
  // Recorta un texto a maxW (con …)
  fit(str, maxW, size, bold) {
    str = String(str || '');
    if (textWidth(str, size, bold) <= maxW) return str;
    while (str && textWidth(str + '…', size, bold) > maxW) str = str.slice(0, -1);
    return str + '…';
  }
  build({ title = '', author = '' } = {}) {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgIds = {};
    for (const im of this.images) {
      imgIds[im.name] = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /${im.comps === 1 ? 'DeviceGray' : im.comps === 4 ? 'DeviceCMYK' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`, stream: im.data });
    }
    const xobj = Object.keys(imgIds).length ? `/XObject << ${Object.entries(imgIds).map(([n, id]) => `/${n} ${id} 0 R`).join(' ')} >>` : '';
    const pageIds = [];
    for (const ops of this.pages) {
      const raw = Buffer.from(ops.join('\n'), 'latin1');
      const z = zlib.deflateSync(raw);
      const content = add({ dict: `<< /Length ${z.length} /Filter /FlateDecode >>`, stream: z });
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> /Contents ${content} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
    const info = add(`<< /Title ${pdfString(title)} /Author ${pdfString(author)} /Producer (JKD Legacy CRM) >>`);
    const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let offset = chunks[0].length;
    const offsets = [];
    objs.forEach((o, i) => {
      offsets.push(offset);
      let part;
      if (o && typeof o === 'object') part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      else part = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
      chunks.push(part); offset += part.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    chunks.push(Buffer.from(xref + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
}
