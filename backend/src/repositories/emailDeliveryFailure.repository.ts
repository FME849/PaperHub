import type { EmailDeliveryFailure, EmailFailureClass } from "@prisma/client";

import { prisma } from "../db.js";

export interface RecordFailureInput {
  recipientEmail: string;
  userId?: number | null;
  failureClass: EmailFailureClass;
  smtpResponseCode?: number | null;
  message?: string | null;
  digestSendRecordId?: string | null;
}

export const emailDeliveryFailureRepository = {
  record(input: RecordFailureInput): Promise<EmailDeliveryFailure> {
    return prisma.emailDeliveryFailure.create({
      data: {
        recipientEmail: input.recipientEmail.toLowerCase(),
        userId: input.userId ?? null,
        failureClass: input.failureClass,
        smtpResponseCode: input.smtpResponseCode ?? null,
        message: input.message ?? null,
        digestSendRecordId: input.digestSendRecordId ?? null,
      },
    });
  },

  /**
   * Count HARD_BOUNCE failures recorded for this address since the most recent
   * successful (SENT) digest to the same user. Drives the bounce-quarantine
   * threshold (FR-016). A successful send resets the count.
   */
  async consecutiveHardBouncesSinceLastSent(
    recipientEmail: string,
    userId: number,
  ): Promise<number> {
    const email = recipientEmail.toLowerCase();

    const lastSent = await prisma.digestSendRecord.findFirst({
      where: { userId, outcome: "SENT" },
      orderBy: { attemptedAt: "desc" },
      select: { completedAt: true, attemptedAt: true },
    });
    const since = lastSent?.completedAt ?? lastSent?.attemptedAt ?? null;

    return prisma.emailDeliveryFailure.count({
      where: {
        recipientEmail: email,
        failureClass: "HARD_BOUNCE",
        ...(since ? { reportedAt: { gt: since } } : {}),
      },
    });
  },
};
