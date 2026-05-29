import type { PasswordResetInvalidationReason, PasswordResetRequest } from "@prisma/client";

import { prisma } from "../db.js";

export const passwordResetRequestRepository = {
  create(input: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRequest> {
    return prisma.passwordResetRequest.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  },

  /** A request usable right now: unconsumed, non-invalidated, unexpired. */
  findValidByTokenHash(tokenHash: string): Promise<PasswordResetRequest | null> {
    return prisma.passwordResetRequest.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  },

  markConsumed(id: string): Promise<PasswordResetRequest> {
    return prisma.passwordResetRequest.update({
      where: { id },
      data: { consumedAt: new Date(), invalidationReason: "USED" },
    });
  },

  /** Invalidate every still-active request for a user (supersede / password-changed). */
  async invalidateActiveForUser(
    userId: number,
    reason: PasswordResetInvalidationReason,
  ): Promise<number> {
    const result = await prisma.passwordResetRequest.updateMany({
      where: { userId, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date(), invalidationReason: reason },
    });
    return result.count;
  },

  recordSendOutcome(id: string, sendAttempts: number, lastSendOutcome: string): Promise<PasswordResetRequest> {
    return prisma.passwordResetRequest.update({
      where: { id },
      data: { sendAttempts, lastSendOutcome },
    });
  },
};
