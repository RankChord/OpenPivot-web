import type { IdentityDisclosure, ParticipantKind, UserProfile } from "../domain/models";

const PROFILE_KEY = "pivot.web.userProfile";

export const defaultUserProfile: UserProfile = {
  displayName: "",
  avatarUrl: "",
  bio: "",
  region: "",
  identity: "private"
};

export function loadUserProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultUserProfile;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return sanitizeUserProfile(parsed);
  } catch {
    return defaultUserProfile;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(sanitizeUserProfile(profile)));
}

export function sanitizeUserProfile(profile: Partial<UserProfile>): UserProfile {
  const identity: IdentityDisclosure =
    profile.identity === "human" || profile.identity === "agent" || profile.identity === "private"
      ? profile.identity
      : "private";

  return {
    displayName: (profile.displayName || "").trim(),
    avatarUrl: (profile.avatarUrl || "").trim(),
    bio: (profile.bio || "").trim(),
    region: (profile.region || "").trim(),
    identity
  };
}

export function profileIdentityKind(identity: IdentityDisclosure): ParticipantKind {
  if (identity === "human") return "human";
  if (identity === "agent") return "agent";
  return "unknown";
}
