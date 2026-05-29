import type { EmailNotificationPreference, PreferenceChangeSource } from "@prisma/client";

import { prisma } from "../db.js";

export const emailNotificationPreferenceRepository = {
  getByUserId(userId: number): Promise<EmailNotificationPreference | null> {
    return prisma.emailNotificationPreference.findUnique({ where: { userId } });
  },

  upsert(
    userId: number,
    enabled: boolean,
    source: PreferenceChangeSource,
  ): Promise<EmailNotificationPreference> {
    return prisma.emailNotificationPreference.upsert({
      where: { userId },
      update: { enabled, lastChangedVia: source },
      create: { userId, enabled, lastChangedVia: source },
    });
  },

  async existsEnabled(userId: number): Promise<boolean> {
    const pref = await prisma.emailNotificationPreference.findUnique({
      where: { userId },
      select: { enabled: true },
    });
    return pref?.enabled === true;
  },

  /** All userIds with notifications currently enabled. */
  async listEnabledUserIds(): Promise<number[]> {
    const rows = await prisma.emailNotificationPreference.findMany({
      where: { enabled: true },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  },
};
