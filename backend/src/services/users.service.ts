import bcrypt from "bcryptjs";

import { InvalidCredentialsError, NotFoundError } from "../errors.js";
import { userRepository } from "../repositories/user.repository.js";
import type { ChangePasswordInput, UpdateProfileInput } from "../validation/schemas.js";

import { authService, type PublicUser } from "./auth.service.js";

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
    // Delegate the mutation to the shared path so password changes also stamp
    // passwordChangedAt and invalidate outstanding reset links (FR-011).
    await authService.setPassword(userId, input.newPassword);
  },
};
