import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../config/env.js";
import { DuplicateEmailError, InvalidCredentialsError } from "../errors.js";
import { userRepository } from "../repositories/user.repository.js";
import type { LoginInput, RegisterInput } from "../validation/schemas.js";

const BCRYPT_COST = 10;

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function signToken(userId: number): string {
  const options: SignOptions = { expiresIn: env.JWT_TTL as SignOptions["expiresIn"] };
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, options);
}

function defaultDisplayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "user";
  return localPart.slice(0, 80) || "user";
}

function isPrismaUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "P2002";
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const displayName = input.displayName ?? defaultDisplayNameFromEmail(input.email);

    try {
      const user = await userRepository.createUser({
        email: input.email,
        passwordHash,
        displayName,
      });
      return { user: toPublicUser(user), token: signToken(user.id) };
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateEmailError();
      }
      throw err;
    }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }
    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new InvalidCredentialsError();
    }
    return { user: toPublicUser(user), token: signToken(user.id) };
  },

  toPublicUser,
};
