import type { ApiUser } from "@/src/lib/api-types";
import type { User } from "@/src/types";

export function apiUserToUser(apiUser: ApiUser): User {
  return {
    id: String(apiUser.id),
    name: apiUser.displayName,
    email: apiUser.email,
    bio: apiUser.bio ?? undefined,
  };
}
