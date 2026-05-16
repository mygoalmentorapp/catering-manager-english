import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

/**
 * Authentication result from authenticateRequest.
 *
 * Separation of concerns:
 * - Identity verification: JWT valid → user is authenticated (openId is trusted)
 * - Profile loading: DB lookup → user profile/record exists
 *
 * When JWT is valid but profile can't be loaded (DB down, user not in DB + upsert fails),
 * a minimal user is returned with id=0. This allows the request to proceed as authenticated
 * without triggering UNAUTHORIZED/sign-out on the client.
 */
export type AuthResult = {
  user: User;
  /** True when the user object was constructed from JWT payload (DB unavailable) */
  isMinimalUser: boolean;
  /** Set when profile loading failed — for logging/monitoring */
  profileLoadError?: string;
};

/** Constant for PROFILE_LOAD_FAILED error identification */
export const PROFILE_LOAD_FAILED = "PROFILE_LOAD_FAILED";

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.",
      );
    }
  }

  private decodeState(state: string): string {
    const redirectUri = atob(state);
    return redirectUri;
  }

  async getTokenByCode(code: string, state: string): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(EXCHANGE_TOKEN_PATH, payload);

    return data;
  }

  async getUserInfoByToken(token: ExchangeTokenResponse): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined,
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(platforms.filter((p): p is string => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code: string, state: string): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null,
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {},
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
      },
      options,
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null,
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload,
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null,
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  /**
   * Build a minimal User object from verified JWT payload.
   * Used as a fallback when DB is unavailable but identity is confirmed.
   * id=-1 signals this is a synthetic record (not from DB).
   * Using -1 (truthy) instead of 0 (falsy) to avoid `if (user.id)` bugs.
   * The real identifier is `openId` (from JWT) — used for all DB queries.
   */
  private buildMinimalUser(session: { openId: string; name: string }): User {
    const now = new Date();
    return {
      id: -1,
      openId: session.openId,
      name: session.name || null,
      email: null,
      loginMethod: "supabase_email",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
  }

  /**
   * Authenticate a request by verifying the JWT and loading the user profile.
   *
   * DESIGN PRINCIPLE — Separation of identity from profile:
   *
   * 1. IDENTITY VERIFICATION (JWT):
   *    - JWT missing/expired/invalid → throws ForbiddenError → UNAUTHORIZED on client → sign out
   *    - JWT valid → identity is confirmed, openId is trusted
   *
   * 2. PROFILE LOADING (DB):
   *    - User found in DB → return full user (happy path)
   *    - User not in DB → upsert from JWT payload → return user
   *    - DB unavailable / upsert fails → return minimal user from JWT (id=0)
   *    - NEVER throws on profile-loading failure when JWT is valid
   *
   * This ensures that temporary DB issues do NOT cause UNAUTHORIZED responses
   * and do NOT trigger sign-out on the client.
   *
   * @returns AuthResult with user (full or minimal) and metadata
   * @throws ForbiddenError ONLY when JWT is missing, expired, or invalid
   */
  async authenticateRequest(req: Request): Promise<AuthResult> {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: IDENTITY VERIFICATION — JWT must be valid
    // This is the ONLY step that can result in UNAUTHORIZED/sign-out
    // ═══════════════════════════════════════════════════════════════
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token: string | undefined;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    }

    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = token || cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      // JWT is missing, expired, or invalid → this IS an auth failure
      throw ForbiddenError("Invalid session cookie");
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: PROFILE LOADING — DB lookup, never throws
    // JWT is valid at this point → user is authenticated regardless
    // of whether we can load their profile from DB
    // ═══════════════════════════════════════════════════════════════
    const signedInAt = new Date();

    // Attempt 1: Look up existing user in DB
    let user: User | undefined;
    try {
      user = await db.getUserByOpenId(session.openId);
    } catch (dbErr) {
      console.warn(
        `[Auth] [PROFILE_LOAD_FAILED] getUserByOpenId failed for openId=${session.openId}:`,
        String(dbErr),
      );
    }

    // If found, update lastSignedIn and return
    if (user) {
      // Best-effort update of lastSignedIn — don't fail the request if this fails
      try {
        await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
      } catch (updateErr) {
        console.warn(
          `[Auth] [PROFILE_LOAD_FAILED] lastSignedIn update failed for openId=${session.openId}:`,
          String(updateErr),
        );
      }
      return { user, isMinimalUser: false };
    }

    // Attempt 2: User not in DB — try to create from OAuth server (legacy OAuth users)
    try {
      const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(userInfo.openId);
      if (user) {
        return { user, isMinimalUser: false };
      }
    } catch {
      // getUserInfoWithJwt fails for Supabase-bridged users (expected).
      // Fall through to JWT-based upsert.
    }

    // Attempt 3: Create user from verified JWT payload (Supabase-bridged users)
    try {
      await db.upsertUser({
        openId: session.openId,
        name: session.name || null,
        email: null,
        loginMethod: "supabase_email",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(session.openId);
      if (user) {
        console.info(
          `[Auth] [PROFILE_LOAD_FAILED] Recovered: created user from JWT payload for openId=${session.openId}`,
        );
        return { user, isMinimalUser: false };
      }
    } catch (dbErr) {
      console.warn(
        `[Auth] [PROFILE_LOAD_FAILED] JWT-based upsert failed for openId=${session.openId}:`,
        String(dbErr),
      );
    }

    // Attempt 4: All DB operations failed — return minimal user from JWT
    // The user IS authenticated (JWT is valid), we just can't load their profile.
    // This prevents UNAUTHORIZED → sign-out for temporary DB issues.
    console.warn(
      `[Auth] [PROFILE_LOAD_FAILED] All DB attempts failed for openId=${session.openId}. ` +
        `Returning minimal user from JWT payload. Session will proceed with limited profile data.`,
    );
    return {
      user: this.buildMinimalUser(session),
      isMinimalUser: true,
      profileLoadError: "All DB operations failed — using JWT payload as identity source",
    };
  }
}

export const sdk = new SDKServer();
