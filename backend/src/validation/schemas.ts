import { z } from "zod";

import { env } from "../config/env.js";
import { isKnownSourceFilter } from "../config/sources.js";

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

const bioSchema = z.string().trim().max(500, "Bio is too long.");

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

// ---------------------------------------------------------------------------
// Tracked topics (002-topic-subscription)
// ---------------------------------------------------------------------------

const topicNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(env.MAX_TOPIC_NAME_LENGTH, `Name must be at most ${env.MAX_TOPIC_NAME_LENGTH} characters.`);

const keywordSchema = z
  .string()
  .trim()
  .min(1, "Keyword must be non-empty.")
  .max(env.MAX_KEYWORD_LENGTH, `Keyword must be at most ${env.MAX_KEYWORD_LENGTH} characters.`);

const keywordsArraySchema = z
  .array(keywordSchema)
  .min(1, "At least one keyword is required.")
  .max(env.MAX_KEYWORDS_PER_TOPIC, `At most ${env.MAX_KEYWORDS_PER_TOPIC} keywords allowed.`);

const sourceFilterSchema = z
  .string()
  .trim()
  .min(1, "Source filter is required.")
  .refine(isKnownSourceFilter, {
    message: "Source filter is not recognized.",
  });

const sourceFiltersArraySchema = z
  .array(sourceFilterSchema)
  .min(1, "At least one source filter is required.")
  .max(env.MAX_FILTERS_PER_TOPIC, `At most ${env.MAX_FILTERS_PER_TOPIC} source filters allowed.`);

export const createTopicSchema = z.object({
  name: topicNameSchema,
  keywords: keywordsArraySchema,
  sourceFilters: sourceFiltersArraySchema,
});

export const updateTopicSchema = z
  .object({
    name: topicNameSchema.optional(),
    keywords: keywordsArraySchema.optional(),
    sourceFilters: sourceFiltersArraySchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.keywords !== undefined ||
      value.sourceFilters !== undefined,
    { message: "At least one field is required." },
  );

export const listTopicsQuerySchema = z.object({
  sort: z.enum(["createdAt", "updatedAt", "name"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50),
  cursor: z.string().min(1).max(200).optional(),
});

export const topicIdParamSchema = z.object({
  id: z.string().min(1, "Topic id is required."),
});

export const topicPapersQuerySchema = z.object({
  sort: z.enum(["publishedAt", "fetchedAt"]).optional().default("publishedAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().min(1).max(200).optional(),
});

export const topicPapersParamSchema = z.object({
  topicId: z.string().min(1, "Topic id is required."),
});

// ---------------------------------------------------------------------------
// Paper reading experience (003-paper-summary-search)
// ---------------------------------------------------------------------------

const isoDateString = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be a valid ISO-8601 date.");

export const searchPapersQuerySchema = z.object({
  q: z.string().trim().min(1, "Query is required.").max(200, "Query is too long."),
  sort: z.enum(["relevance", "publishedAt", "matchedAt"]).optional().default("relevance"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(env.SEARCH_MAX_LIMIT)
    .optional()
    .default(env.SEARCH_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(200).optional(),
  topicId: z.string().min(1).max(64).optional(),
  publishedFrom: isoDateString.optional(),
  publishedTo: isoDateString.optional(),
  author: z.string().trim().min(1).max(100).optional(),
});

export const paperRouteIdSchema = z.object({
  id: z.string().min(1, "Paper id is required.").max(64),
});

export const paperRelatedQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(env.RECOMMENDATIONS_MAX_LIMIT)
    .optional()
    .default(env.RECOMMENDATIONS_DEFAULT_LIMIT),
});

export const favoritesPapersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().min(1).max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type ListTopicsQuery = z.infer<typeof listTopicsQuerySchema>;
export type TopicPapersQuery = z.infer<typeof topicPapersQuerySchema>;
export type SearchPapersQuery = z.infer<typeof searchPapersQuerySchema>;
export type PaperRelatedQuery = z.infer<typeof paperRelatedQuerySchema>;
export type FavoritesPapersQuery = z.infer<typeof favoritesPapersQuerySchema>;
