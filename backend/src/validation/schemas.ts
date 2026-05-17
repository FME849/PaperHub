import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Email is not valid.")
  .transform((value) => value.toLowerCase());

const passwordStrengthSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((value) => /[A-Za-z]/.test(value), "Password must contain a letter.")
  .refine((value) => /[0-9]/.test(value), "Password must contain a digit.");

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(80, "Display name is too long.");

const bioSchema = z
  .string()
  .trim()
  .max(500, "Bio is too long.");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordStrengthSchema,
  displayName: displayNameSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.nullable().optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.bio !== undefined,
    { message: "At least one field is required." },
  );

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: passwordStrengthSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "New password must differ from current password.",
  });

const paperIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9.\-/]{3,64}$/, "Paper id is not valid.");

export const addFavoriteSchema = z.object({
  paperId: paperIdSchema,
});

export const paperIdParamSchema = z.object({
  paperId: paperIdSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;
