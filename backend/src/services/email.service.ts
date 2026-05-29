import { emailClient, type EmailSendResult } from "../external/email.client.js";

import {
  digestSubject,
  renderDigestHtml,
  renderDigestText,
  type DigestPayload,
} from "./email-templates/digest.js";

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
};
