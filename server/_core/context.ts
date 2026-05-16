import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk, type AuthResult, PROFILE_LOAD_FAILED } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /**
   * The authenticated user. Non-null when JWT is valid.
   * May be a "minimal user" (id=0) if profile couldn't be loaded from DB.
   */
  user: User | null;
  /**
   * True when the user object was constructed from JWT payload because DB was unavailable.
   * Procedures can check this to provide degraded-but-functional behavior.
   */
  isMinimalUser: boolean;
  /**
   * Set when profile loading failed. Used for logging and client-side error differentiation.
   * When this is set, the user IS authenticated (JWT valid) but profile data is incomplete.
   */
  profileLoadError: string | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  let isMinimalUser = false;
  let profileLoadError: string | null = null;

  try {
    const result: AuthResult = await sdk.authenticateRequest(opts.req);
    user = result.user;
    isMinimalUser = result.isMinimalUser;
    profileLoadError = result.profileLoadError ?? null;
  } catch {
    // authenticateRequest only throws when JWT is missing/expired/invalid.
    // This means the user is NOT authenticated → user stays null.
    // The requireUser middleware will then throw UNAUTHORIZED (correct behavior).
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isMinimalUser,
    profileLoadError,
  };
}
