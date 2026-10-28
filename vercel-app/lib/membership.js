// ============================================================
//  Membership Application and Waiver Form — ficha de alumno.
//  Página privada /membership-application → POST /api/public/membership → PDF diligenciado
//  (réplica del formulario en papel de la academia, «Membership Application 2026.docx»).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDF, textWidth } from './pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let LOGO = null;
try { LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'membership-logo.jpg')); } catch (e) {}

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
export const LEVELS = ['Foundation', 'Progression', 'Mastery'];
export const FEES = ['New Member ($75.00)', 'Existing Member'];

// Cláusulas del formulario original (texto legal de la academia, en inglés)
export const CLAUSES = [
  ['Physical Condition:', 'You are in good physical condition and have no disabilities, diseases, or other conditions that could prevent you from safely participating in the Jeet Kune Do Legacy Academy (JKDLA) training program. You confirm that you have consulted a physician regarding your participation and have received approval to engage in the training activities, or you deem such consultation unnecessary.'],
  ['Disclosure of Limitations:', 'If you have any special training requirements or physical limitations, you agree to disclose these to the JKDLA instructors before commencing any training.'],
  ['Assumption of Risk:', 'You understand and accept that participation in the JKDLA training program is at your own risk. You voluntarily waive any claims, demands, injuries, damages, actions, suits, or causes of action arising out of or related to your participation in the program, and release JKDLA from any liability on your behalf and on behalf of your dependents.'],
  ['Release of Liability:', 'You agree to hold JKDLA harmless from any claims, damages, or liabilities associated with your participation in the training program. By signing this document, you acknowledge that you have read and fully understand the terms of this waiver and release of liability.'],
  ['Use of Training:', 'You agree to use the training provided by JKDLA solely for personal protection and commit to using only the necessary force to defend yourself in the event of an attack. You understand and agree that the training will never be misused or abused.'],
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const cap = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

export function ageOn(dob, ref = new Date()) {
  const d = new Date(dob + 'T00:00:00');
  if (isNaN(d)) return null;
  let a = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) a--;
  return a;
}
// Firma dibujada: JPEG en data URL (fondo blanco), máx. ~300 KB
function signature(v) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(v || ''));
  if (!m || m[1].length > 400000) return '';
  const buf = Buffer.from(m[1], 'base64');
  return buf[0] === 0xff && buf[1] === 0xd8 ? m[1] : '';
}

// Valida y normaliza lo que envía la página. Devuelve { data } o { error, field }
export function validateMembership(b) {
  const d = {
    last_name: cap(b.last_name, 80), first_name: cap(b.first_name, 80), date_of_birth: cap(b.date_of_birth, 10),
    email: cap(b.email, 160).toLowerCase(), profession: cap(b.profession, 120), street_address: cap(b.street_address, 200),
    postal_code: cap(b.postal_code, 10), phone_home: cap(b.phone_home, 30), phone_mobile: cap(b.phone_mobile, 30),
    experience: cap(b.experience, 600), emergency_name: cap(b.emergency_name, 120), emergency_phone: cap(b.emergency_phone, 30),
    tshirt: SHIRT_SIZES.includes(b.tshirt) ? b.tshirt : '', health: cap(b.health, 800),
    fee: FEES.includes(b.fee) ? b.fee : '', level: LEVELS.includes(b.level) ? b.level : '',
    guardian_name: cap(b.guardian_name, 120), guardian_phone: cap(b.guardian_phone, 30), guardian_address: cap(b.guardian_address, 200),
    agree: !!b.agree, signature: signature(b.signature), guardian_signature: signature(b.guardian_signature),
    lang: b.lang === 'es' ? 'es' : 'en',
  };
  const req = ['last_name', 'first_name', 'date_of_birth', 'email', 'street_address', 'postal_code', 'phone_mobile', 'emergency_name', 'emergency_phone', 'fee', 'level'];
  for (const k of req) if (!d[k]) return { error: 'required', field: k };
  if (!EMAIL_RE.test(d.email)) return { error: 'email', field: 'email' };
  const age = ageOn(d.date_of_birth);
  if (age === null || age < 3 || age > 110) return { error: 'date_of_birth', field: 'date_of_birth' };
  d.minor = age < 18;
  if (d.minor) for (const k of ['guardian_name', 'guardian_phone', 'guardian_address', 'guardian_signature']) if (!d[k]) return { error: 'required', field: k };
  if (!d.agree) return { error: 'required', field: 'agree' };
  if (!d.signature) return { error: 'required', field: 'signature' };
  return { data: d };
}

const fmtDate = (iso) => { const [y, m, dd] = String(iso || '').slice(0, 10).split('-'); return y ? `${dd}/${m}/${y}` : ''; };
function melbourne(iso) {
  try { return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso; }
}

// PDF diligenciado con el mismo orden y textos del formulario en papel
export function membershipPdf(rec) {
  const d = rec.data || rec;
  const pdf = new PDF();
  const L = 64, R = pdf.W - 64, INK = [33, 33, 33], VAL = [20, 52, 120], MUTE = [110, 110, 110];
  // Encabezado: logo + datos de contacto a la derecha
  if (LOGO) pdf.image(LOGO, L, 44, 170);
  const contact = [['A', 'Unit 6/72-80 Hampstead Rd, Maidstone VIC 3012'], ['W', 'www.jkdlegacy.com.au'], ['E', 'jkdlegacyacademy@gmail.com'], ['M', '0459785073']];
  contact.forEach(([k, v], i) => {
    const y = 64 + i * 14, rest = ' - ' + v;
    const x = R - textWidth(k + rest, 10.5, false) - (textWidth(k, 10.5, true) - textWidth(k, 10.5, false));
    pdf.text(x, y, k, { size: 10.5, bold: true, color: INK });
    pdf.text(x + textWidth(k, 10.5, true), y, rest, { size: 10.5, color: INK });
  });
  let y = 150;
  pdf.textCenter(y, 'Membership Application and Waiver Form', { size: 14, bold: true, color: INK });
  y += 22;
  pdf.textCenter(y, 'Personal Information', { size: 10.5, bold: true, color: INK });
  y += 20;

  // Campos en dos columnas (mismo orden que el formulario en papel); los valores largos ocupan la fila entera
  const MID = L + (R - L) / 2, LEAD = 13.5;
  const cell = (label, value, x, maxW, yy) => {          // devuelve la y siguiente (el valor se ajusta en su columna)
    const lw = pdf.text(x, yy, label, { size: 9.5, color: INK });
    return pdf.paragraph(x + lw + 4, yy, [{ t: value || '—', bold: true }], maxW - lw - 4, { size: 9.5, lead: LEAD, color: VAL });
  };
  const row = (a, b) => {                                  // dos campos lado a lado
    const y1 = cell(a[0], a[1], L, MID - L - 12, y);
    const y2 = b ? cell(b[0], b[1], MID, R - MID, y) : y1;
    y = Math.max(y1, y2) + 1.5;
  };
  const full = (label, value) => { y = cell(label, value, L, R - L, y) + 1.5; };
  const minor = d.minor;
  row(['Last Name:', d.last_name], ['First Name:', d.first_name]);
  row(['Date of Birth:', fmtDate(d.date_of_birth)], ['Profession:', d.profession]);
  row(['Email Address:', d.email], ['Telephone (Mobile):', d.phone_mobile]);
  full('Street Address:', d.street_address);
  row(['Postal Code:', d.postal_code], ['Telephone (Home):', d.phone_home]);
  full('Previous Martial Arts Experience:', d.experience);
  row(['Emergency Contact Name:', d.emergency_name], ['Emergency Contact Telephone:', d.emergency_phone]);
  row(['T-Shirt Size:', d.tshirt], ['Student Level:', d.level]);
  full('Health Conditions:', d.health || 'None declared');
  row(['Membership Fees:', d.fee], ['For Minors:', minor ? 'Yes — under 18' : 'N/A']);
  row(['Legal Guardian Name:', minor ? d.guardian_name : ''], ['Guardian Phone Number:', minor ? d.guardian_phone : '']);
  full('Guardian Address:', minor ? d.guardian_address : '');

  y += 8;
  pdf.textCenter(y, 'Acknowledgment and Agreement', { size: 10.5, bold: true, color: INK });
  y += 18;
  y = pdf.paragraph(L, y, [{ t: 'By signing below, you, on behalf of yourself and any dependents, acknowledge and agree to the following:' }], R - L, { size: 9.5, lead: 13, color: INK });
  y += 4;
  CLAUSES.forEach(([lead, body], i) => {
    pdf.text(L + 10, y, `${i + 1}.`, { size: 9.5, color: INK });
    y = pdf.paragraph(L + 26, y, [{ t: lead + ' ', bold: true }, { t: body }], R - L - 26, { size: 9.5, lead: 12.6, color: INK }) + 2;
  });

  // Firmas
  y += 6;
  // Fecha de firma en hora de Melbourne (no UTC: en la mañana australiana UTC sigue en el día anterior)
  const signed = new Date(rec.created_at || Date.now()).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: '2-digit', month: '2-digit', year: 'numeric' });
  const DATE_X = R - 108;
  const sigBlock = (label, img, yy) => {
    pdf.text(L, yy, label, { size: 10, bold: true, color: INK });
    const sx = L + textWidth(label, 10, true) + 10;
    const sw = Math.min(160, DATE_X - sx - 14);
    if (img) pdf.image(Buffer.from(img, 'base64'), sx, yy - 30, sw, 40);
    pdf.line(sx, yy + 4, sx + sw, yy + 4, { color: [150, 150, 150], width: 0.5 });
    pdf.text(DATE_X, yy, 'Date:', { size: 10, bold: true, color: INK });
    pdf.text(DATE_X + 32, yy, img ? signed : '', { size: 10, bold: true, color: VAL });
  };
  if (y > pdf.H - 165) { pdf.addPage(); y = 70; }     // las firmas ocupan ~95 pt + pie: si no caben, van a la página 2
  sigBlock('Applicant Signature:', d.signature, y + 26);
  y += 52;
  pdf.text(L, y, 'For Applicants Under 18 Years of Age:', { size: 10, color: INK });
  y += 12;
  sigBlock('Legal Guardian Consent and Approval Signature:', minor ? d.guardian_signature : '', y + 26);
  if (!minor) pdf.text(L + textWidth('Legal Guardian Consent and Approval Signature:', 10, true) + 14, y + 24, 'N/A', { size: 10, color: MUTE });

  // Pie: trazabilidad del envío en línea
  const ref = 'JKD-M-' + String(rec.id || 0).padStart(4, '0');
  pdf.text(L, pdf.H - 44, `Submitted online on ${melbourne(rec.created_at || new Date().toISOString())} (Melbourne time) · Reference ${ref}`, { size: 7.5, color: MUTE });
  pdf.text(L, pdf.H - 33, 'Confidential — contains personal and health information. Keep on file at Jeet Kune Do Legacy Academy.', { size: 7.5, color: MUTE });
  return pdf.build({ title: `Membership Application — ${d.first_name} ${d.last_name}`, author: 'Jeet Kune Do Legacy Academy' });
}
