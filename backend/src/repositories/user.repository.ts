import type { User } from "@prisma/client";

import { prisma } from "../db.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
}

export const userRepository = {
  createUser({ email, passwordHash, displayName }: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
      },
    });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findById(id: number): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  updateProfile(id: number, input: UpdateProfileInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
      },
    });
  },

  updatePasswordHash(id: number, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  },
};
