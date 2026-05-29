// Handwritten responsive HTML + plain-text renderer for the password-reset
// email. Both consume the same typed payload so they cannot drift. Inline
// styles only, table-based layout, no remote images.

export interface PasswordResetEmailPayload {
  resetUrl: string;
  expiresInMinutes: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function passwordResetSubject(): string {
  return "Reset your PaperHub password";
}

export function renderPasswordResetHtml(payload: PasswordResetEmailPayload): string {
  const url = escapeHtml(payload.resetUrl);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">Reset your password</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.5;">We received a request to reset the password for your PaperHub account. Click the button below to choose a new password.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 0 20px;">
          <a href="${url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">Reset your password</a>
        </td></tr>
        <tr><td>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">Or paste this link into your browser:</p>
          <p style="margin:0 0 20px;font-size:13px;color:#1d4ed8;word-break:break-all;">${url}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#b45309;"><strong>This link expires in ${payload.expiresInMinutes} minutes.</strong></p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderPasswordResetText(payload: PasswordResetEmailPayload): string {
  return [
    "Reset your password",
    "",
    "We received a request to reset the password for your PaperHub account.",
    "Open this link to choose a new password:",
    payload.resetUrl,
    "",
    `This link expires in ${payload.expiresInMinutes} minutes.`,
    "",
    "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
  ].join("\n");
}
