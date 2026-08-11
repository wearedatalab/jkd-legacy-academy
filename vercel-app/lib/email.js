// ============================================================
//  Envío de email transaccional vía Resend (REST, sin dependencias).
//  Se usa para entregar el "magic link" de acceso al CRM.
//  La API key se lee de process.env.RESEND_API_KEY (nunca hardcodeada).
// ============================================================
import process from 'node:process';

const ESC = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function magicLinkHtml({ name, link }) {
  const safeName = ESC(name || '');
  const safeLink = ESC(link);
  return `<!doctype html><html><body style="margin:0;background:#0b0c10;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#14161c;border:1px solid #262a33;border-radius:14px;overflow:hidden">
      <tr><td style="padding:28px 32px 8px">
        <div style="font-family:Georgia,serif;color:#f4f1ea;font-size:20px;font-weight:600">The JKD Legacy Academy</div>
        <div style="color:#837e72;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:2px">Panel · Acceso</div>
      </td></tr>
      <tr><td style="padding:12px 32px 4px;color:#c2bdb1;font-size:15px;line-height:1.6">
        Hola${safeName ? ' ' + safeName : ''}, usa este botón para entrar al panel. El enlace es de un solo uso y caduca en 15&nbsp;minutos.
      </td></tr>
      <tr><td style="padding:22px 32px 8px">
        <a href="${safeLink}" style="display:inline-block;background:#2f7be0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:100px">Entrar al panel →</a>
      </td></tr>
      <tr><td style="padding:8px 32px 26px;color:#837e72;font-size:12px;line-height:1.6">
        Si no solicitaste este acceso, ignora este correo.<br>
        <span style="color:#5b5750">O copia y pega:</span><br><span style="color:#8a8578;word-break:break-all">${safeLink}</span>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function leadNotifyHtml({ lead, crmLink }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Nuevo contacto';
  const rows = [
    ['Nombre', name],
    ['Correo', lead.email],
    ['Teléfono', lead.phone],
    ['Ubicación', lead.location],
    ['Experiencia / camino', lead.experience],
    ['Mensaje', lead.message],
    ['Origen', lead.source],
    ['Canal', lead.channel],
    ['Fecha', lead.created_label],
  ].filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #23262e;color:#837e72;font-size:12px;letter-spacing:.02em;vertical-align:top;width:150px">${ESC(k)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #23262e;color:#e9e5da;font-size:14px;line-height:1.5">${ESC(v)}</td>
    </tr>`).join('');
  const mailto = lead.email ? `<a href="mailto:${ESC(lead.email)}" style="color:#2f7be0;text-decoration:none">${ESC(lead.email)}</a>` : '';
  return `<!doctype html><html><body style="margin:0;background:#0b0c10;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#14161c;border:1px solid #262a33;border-radius:14px;overflow:hidden">
      <tr><td style="padding:26px 32px 6px">
        <div style="font-family:Georgia,serif;color:#f4f1ea;font-size:20px;font-weight:600">The JKD Legacy Academy</div>
        <div style="color:#9ec19a;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:3px">Nuevo registro desde la web</div>
      </td></tr>
      <tr><td style="padding:10px 32px 4px;color:#c2bdb1;font-size:15px;line-height:1.6">
        Se registró una nueva persona en el formulario del sitio. Estos son sus datos:
      </td></tr>
      <tr><td style="padding:14px 32px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #23262e">${rows}</table>
      </td></tr>
      ${mailto ? `<tr><td style="padding:6px 32px 2px;color:#837e72;font-size:12px">Puedes responder este correo o escribirle directo: ${mailto}</td></tr>` : ''}
      <tr><td style="padding:18px 32px 8px">
        <a href="${ESC(crmLink)}" style="display:inline-block;background:#2f7be0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:100px">Ver en el panel →</a>
      </td></tr>
      <tr><td style="padding:6px 32px 26px;color:#5b5750;font-size:12px;line-height:1.6">
        Notificación automática del panel de JKD Legacy.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Notifica a los administradores cuando entra un lead nuevo. Best-effort: nunca lanza.
// `to` puede ser un array de correos. Devuelve { ok, ... }.
export async function sendLeadNotification({ to, lead, crmLink }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'JKD Legacy <onboarding@resend.dev>';
  const recipients = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
  if (!key || !recipients.length) return { ok: false, skipped: true };
  const name = [lead && lead.first_name, lead && lead.last_name].filter(Boolean).join(' ') || 'Nuevo contacto';
  try {
    const payload = {
      from, to: recipients,
      subject: `Nuevo registro en la web — ${name}`,
      html: leadNotifyHtml({ lead: lead || {}, crmLink: crmLink || '' }),
    };
    if (lead && lead.email) payload.reply_to = lead.email;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) { const body = await resp.text().catch(() => ''); console.error('[email] lead-notify', resp.status, body.slice(0, 300)); return { ok: false, status: resp.status }; }
    return { ok: true };
  } catch (e) {
    console.error('[email] lead-notify fallo de red:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// Devuelve { ok:true } si Resend aceptó el envío; { ok:false, ... } en error o sin key.
export async function sendMagicLink({ to, name, link }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'JKD Legacy <onboarding@resend.dev>';
  if (!key) { console.log('[email] Sin RESEND_API_KEY — link (solo dev):', link); return { ok: false, skipped: true }; }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject: 'Tu acceso al panel — JKD Legacy',
        html: magicLinkHtml({ name, link }),
      }),
    });
    if (!resp.ok) { const body = await resp.text().catch(() => ''); console.error('[email] Resend', resp.status, body.slice(0, 300)); return { ok: false, status: resp.status }; }
    return { ok: true };
  } catch (e) {
    console.error('[email] fallo de red:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
