import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";

export interface EmailSendPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailFailureClass =
  | "HARD_BOUNCE"
  | "SOFT_BOUNCE"
  | "CONNECTION_ERROR"
  | "TIMEOUT"
  | "OTHER";

export type EmailSendResult =
  | { status: "ok" }
  | {
      status: "smtp_failure";
      failureClass: EmailFailureClass;
      smtpResponseCode?: number;
      message: string;
    };

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER !== ""
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
    });
  }
  return cachedTransporter;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Map a Nodemailer/SMTP error into our typed failure shape. We never let a raw
// SDK error escape this boundary (Constitution Principle IV).
function classifyError(err: unknown): EmailSendResult {
  const responseCode = numberOrUndefined((err as { responseCode?: unknown }).responseCode);
  const code = stringOrEmpty((err as { code?: unknown }).code);
  const message = err instanceof Error ? err.message : String(err);

  // Permanent SMTP rejections (5xx) -> hard bounce.
  if (responseCode !== undefined && responseCode >= 500 && responseCode < 600) {
    return { status: "smtp_failure", failureClass: "HARD_BOUNCE", smtpResponseCode: responseCode, message };
  }
  // Transient SMTP rejections (4xx) -> soft bounce.
  if (responseCode !== undefined && responseCode >= 400 && responseCode < 500) {
    return { status: "smtp_failure", failureClass: "SOFT_BOUNCE", smtpResponseCode: responseCode, message };
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || /timed? ?out/i.test(message)) {
    return { status: "smtp_failure", failureClass: "TIMEOUT", message };
  }
  if (code === "ECONNECTION" || code === "ECONNREFUSED" || code === "EDNS" || code === "EAUTH") {
    return { status: "smtp_failure", failureClass: "CONNECTION_ERROR", message };
  }
  return { status: "smtp_failure", failureClass: "OTHER", message };
}

export interface EmailClient {
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
}

export const emailClient: EmailClient = {
  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    try {
      await getTransporter().sendMail({
        from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM },
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
      return { status: "ok" };
    } catch (err) {
      return classifyError(err);
    }
  },
};
