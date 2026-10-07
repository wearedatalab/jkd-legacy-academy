// ============================================================
//  Transactional email via Resend (REST, no dependencies).
//  Used to deliver the CRM "magic link", lead notifications
//  and task reminders.
//  The API key is read from process.env.RESEND_API_KEY (never hardcoded).
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
        <div style="color:#837e72;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:2px">Panel · Sign in</div>
      </td></tr>
      <tr><td style="padding:12px 32px 4px;color:#c2bdb1;font-size:15px;line-height:1.6">
        Hi${safeName ? ' ' + safeName : ''}, use this button to sign in to the panel. The link is single-use and expires in 15&nbsp;minutes.
      </td></tr>
      <tr><td style="padding:22px 32px 8px">
        <a href="${safeLink}" style="display:inline-block;background:#2f7be0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:100px">Sign in to the panel →</a>
      </td></tr>
      <tr><td style="padding:8px 32px 26px;color:#837e72;font-size:12px;line-height:1.6">
        If you did not request this access, ignore this email.<br>
        <span style="color:#5b5750">Or copy and paste:</span><br><span style="color:#8a8578;word-break:break-all">${safeLink}</span>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function leadNotifyHtml({ lead, crmLink }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'New contact';
  const rows = [
    ['Name', name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Location', lead.location],
    ['Experience / path', lead.experience],
    ['Message', lead.message],
    ['Source', lead.source],
    ['Channel', lead.channel],
    ['Date', lead.created_label],
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
        <div style="color:#9ec19a;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:3px">New sign-up from the website</div>
      </td></tr>
      <tr><td style="padding:10px 32px 4px;color:#c2bdb1;font-size:15px;line-height:1.6">
        A new person signed up through the website form. Here are their details:
      </td></tr>
      <tr><td style="padding:14px 32px 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #23262e">${rows}</table>
      </td></tr>
      ${mailto ? `<tr><td style="padding:6px 32px 2px;color:#837e72;font-size:12px">You can reply to this email or write to them directly: ${mailto}</td></tr>` : ''}
      <tr><td style="padding:18px 32px 8px">
        <a href="${ESC(crmLink)}" style="display:inline-block;background:#2f7be0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:100px">View in the panel →</a>
      </td></tr>
      <tr><td style="padding:6px 32px 26px;color:#5b5750;font-size:12px;line-height:1.6">
        Automated notification from the JKD Legacy panel.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Notifies administrators when a new lead comes in. Best-effort: never throws.
// `to` can be an array of emails. Returns { ok, ... }.
export async function sendLeadNotification({ to, lead, crmLink }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'JKD Legacy <onboarding@resend.dev>';
  const recipients = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
  if (!key || !recipients.length) return { ok: false, skipped: true };
  const name = [lead && lead.first_name, lead && lead.last_name].filter(Boolean).join(' ') || 'New contact';
  try {
    const payload = {
      from, to: recipients,
      subject: `New sign-up on the website — ${name}`,
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
    console.error('[email] lead-notify network error:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

function fmtMel(iso) {
  try { return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return String(iso || ''); }
}
function taskReminderHtml({ name, tasks, crmLink }) {
  const now = Date.now();
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const soon = tasks.filter((t) => !overdue.includes(t));
  const rowsOf = (arr) => arr.map((t) => {
    const lead = [t.lf, t.ll].filter(Boolean).join(' ');
    const phone = t.lphone ? ` · <a href="tel:${ESC(String(t.lphone).replace(/\s+/g, ''))}" style="color:#9ec1ff;text-decoration:none">${ESC(t.lphone)}</a>` : '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #23262e;vertical-align:top">
      <div style="color:#e9e5da;font-size:14px;line-height:1.4">${ESC(t.title)}</div>
      <div style="color:#837e72;font-size:12px;margin-top:3px">${t.due_at ? ESC(fmtMel(t.due_at)) : 'no date'}${lead ? ' · ' + ESC(lead) : ''}${phone}</div>
    </td></tr>`;
  }).join('');
  const block = (title, arr, col) => arr.length ? `
    <tr><td style="padding:18px 32px 2px"><div style="color:${col};font-size:11px;letter-spacing:.18em;text-transform:uppercase">${title} · ${arr.length}</div></td></tr>
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsOf(arr)}</table></td></tr>` : '';
  return `<!doctype html><html><body style="margin:0;background:#0b0c10;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#14161c;border:1px solid #262a33;border-radius:14px;overflow:hidden">
      <tr><td style="padding:26px 32px 6px">
        <div style="font-family:Georgia,serif;color:#f4f1ea;font-size:20px;font-weight:600">The JKD Legacy Academy</div>
        <div style="color:#8b7ff0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:3px">Task reminder</div>
      </td></tr>
      <tr><td style="padding:10px 32px 2px;color:#c2bdb1;font-size:15px;line-height:1.6">
        Hi${name ? ' ' + ESC(name) : ''}, you have pending follow-ups:
      </td></tr>
      ${block('Overdue', overdue, '#e06666')}
      ${block('Today / next 24 h', soon, '#c8a96a')}
      <tr><td style="padding:20px 32px 8px">
        <a href="${ESC(crmLink)}" style="display:inline-block;background:#2f7be0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:100px">Open the panel →</a>
      </td></tr>
      <tr><td style="padding:6px 32px 26px;color:#5b5750;font-size:12px;line-height:1.6">Automated reminder from the JKD Legacy panel.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Sends ONE recipient the digest of their tasks due soon. Best-effort: never throws.
export async function sendTaskReminder({ to, name, tasks, crmLink }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'JKD Legacy <onboarding@resend.dev>';
  if (!key || !to || !tasks || !tasks.length) return { ok: false, skipped: true };
  const n = tasks.length;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to,
        subject: `⏰ ${n} task${n > 1 ? 's' : ''} to do — JKD Legacy`,
        html: taskReminderHtml({ name, tasks, crmLink: crmLink || '' }),
      }),
    });
    if (!resp.ok) { const body = await resp.text().catch(() => ''); console.error('[email] task-reminder', resp.status, body.slice(0, 300)); return { ok: false, status: resp.status }; }
    return { ok: true };
  } catch (e) {
    console.error('[email] task-reminder network error:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// Returns { ok:true } if Resend accepted the send; { ok:false, ... } on error or missing key.
export async function sendMagicLink({ to, name, link }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'JKD Legacy <onboarding@resend.dev>';
  if (!key) { console.log('[email] No RESEND_API_KEY — link (dev only):', link); return { ok: false, skipped: true }; }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject: 'Your panel access — JKD Legacy',
        html: magicLinkHtml({ name, link }),
      }),
    });
    if (!resp.ok) { const body = await resp.text().catch(() => ''); console.error('[email] Resend', resp.status, body.slice(0, 300)); return { ok: false, status: resp.status }; }
    return { ok: true };
  } catch (e) {
    console.error('[email] network error:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
