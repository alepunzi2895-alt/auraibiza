import { Resend } from "resend";
import { t, type Lang } from "./i18n";

// Lazy init come in db.ts: non lancia errore al caricamento del modulo se
// RESEND_API_KEY manca, solo quando si prova davvero a inviare un'email.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY env var.");
  _resend = new Resend(apiKey);
  return _resend;
}

const FROM = "Aura Ibiza <noreply@auraibiza.com>";

// Wrapper generico di invio, riusabile anche per le future notifiche di
// prenotazione (nuova prenotazione, cambio stato) oltre al reset password.
export async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    const res = await resend.emails.send({ from: FROM, to, subject, html });
    if (res.error) return { success: false, error: res.error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

const emailShell = (bodyHtml: string) => `
<div style="background:#080B0F;padding:40px 20px;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#10141C;border:1px solid rgba(200,169,110,0.25);border-radius:16px;padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:3px;color:#E8D5A8;text-transform:uppercase;">Aura Ibiza</div>
    </div>
    ${bodyHtml}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1E2433;font-size:11px;color:#484540;text-align:center;">
      Aura Ibiza · info.auraibiza@gmail.com
    </div>
  </div>
</div>
`;

export async function sendPasswordResetEmail(to: string, resetUrl: string, lang: Lang) {
  const html = emailShell(`
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;color:#EDE9E1;margin:0 0 12px;">${t(lang, "email_reset_heading")}</h1>
    <p style="font-size:14px;color:#8A8678;line-height:1.7;margin:0 0 24px;">${t(lang, "email_reset_body")}</p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#8A6A30,#C8A96E);color:#080B0F;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${t(lang, "email_reset_button")}</a>
    </div>
    <p style="font-size:12px;color:#484540;line-height:1.6;">${t(lang, "email_reset_expires_note")}</p>
  `);
  return sendEmail(to, t(lang, "email_reset_subject"), html);
}

export async function sendGoogleOnlyNotice(to: string, lang: Lang) {
  const html = emailShell(`
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;color:#EDE9E1;margin:0 0 12px;">${t(lang, "email_reset_heading")}</h1>
    <p style="font-size:14px;color:#8A8678;line-height:1.7;margin:0;">${t(lang, "email_reset_google_only")}</p>
  `);
  return sendEmail(to, t(lang, "email_reset_subject"), html);
}
