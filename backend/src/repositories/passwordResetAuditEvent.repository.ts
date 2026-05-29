import type { PasswordResetAuditEvent, PasswordResetEventType } from "@prisma/client";

import { prisma } from "../db.js";

export interface RecordAuditInput {
  userId?: number | null;
  eventType: PasswordResetEventType;
  emailAttempted?: string | null;
  ipHash?: string | null;
  detail?: string | null;
}

export const passwordResetAuditEventRepository = {
  record(input: RecordAuditInput): Promise<PasswordResetAuditEvent> {
    return prisma.passwordResetAuditEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        emailAttempted: input.emailAttempted ? input.emailAttempted.toLowerCase() : null,
        ipHash: input.ipHash ?? null,
        detail: input.detail ?? null,
      },
    });
  },
};
