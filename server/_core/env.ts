export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  masterUserId: process.env.MASTER_USER_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

/**
 * Check if a given userId is the owner/master user.
 * Matches against both OWNER_OPEN_ID (Manus OAuth) and MASTER_USER_ID (Supabase email).
 */
export function isOwnerUser(userId: string): boolean {
  if (!userId) return false;
  return userId === ENV.ownerOpenId || userId === ENV.masterUserId;
}
