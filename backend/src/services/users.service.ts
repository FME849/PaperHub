import bcrypt from "bcryptjs";

import { InvalidCredentialsError, NotFoundError } from "../errors.js";
import { userRepository } from "../repositories/user.repository.js";
import type { ChangePasswordInput, UpdateProfileInput } from "../validation/schemas.js";

import { authService, type PublicUser } from "./auth.service.js";

const BCRYPT_COST = 10;

export const usersService = {
  async getMe(userId: number): Promise<PublicUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    return authService.toPublicUser(user);
  },

  async updateMe(userId: number, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await userRepository.updateProfile(userId, {
      displayName: input.displayName,
      bio: input.bio,
    });
    return authService.toPublicUser(user);
  },

  async changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found.");
    }
    const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!matches) {
      throw new InvalidCredentialsError("Invalid current password.");
    }
    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    await userRepository.updatePasswordHash(userId, newHash);
  },
};
