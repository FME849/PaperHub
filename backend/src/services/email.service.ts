import { emailClient, type EmailSendResult } from "../external/email.client.js";

import {
  digestSubject,
  renderDigestHtml,
  renderDigestText,
  type DigestPayload,
} from "./email-templates/digest.js";
import {
  passwordResetSubject,
  renderPasswordResetHtml,
  renderPasswordResetText,
} from "./email-templates/password-reset.js";

export const emailService = {
  /**
   * Compose and send one digest. Eligibility, idempotency and bookkeeping are
   * the orchestrator's job (notifications.service); this service only renders
   * and hands off to the provider-agnostic client.
   */
  async sendDigest(args: {
    recipientEmail: string;
    payload: DigestPayload;
  }): Promise<EmailSendResult> {
    const subject = digestSubject(args.payload.candidatePaperCount);
    const html = renderDigestHtml(args.payload);
    const text = renderDigestText(args.payload);
    return emailClient.send({
      to: args.recipientEmail,
      subject,
      html,
      text,
    });
  },

  /**
   * Compose and send one password-reset email. Token generation, persistence,
   * and retry bookkeeping are the orchestrator's job (passwordReset.service).
   */
  async sendPasswordReset(args: {
    recipientEmail: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): Promise<EmailSendResult> {
    const payload = { resetUrl: args.resetUrl, expiresInMinutes: args.expiresInMinutes };
    return emailClient.send({
      to: args.recipientEmail,
      subject: passwordResetSubject(),
      html: renderPasswordResetHtml(payload),
      text: renderPasswordResetText(payload),
    });
  },
};
