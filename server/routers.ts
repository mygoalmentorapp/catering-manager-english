import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { handleSignupAlert } from "./signup-alert";
import { cloudDataRouter } from "./cloud-data-router";
import { experienceRouter } from "./experience-router";
import { deviceRouter } from "./device-router";
import { configRouter } from "./config-router";
import { onboardingRouter } from "./onboarding-router";
import { paywallRouter } from "./paywall-router";
import { adminRouter } from "./admin-router";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Cloud data: all business data CRUD (products, orders, shopping lists, units, categories, settings)
  cloudData: cloudDataRouter,

  // Experience: event logging, user state, campaign state (server-side, bypasses RLS)
  experience: experienceRouter,

  // Device binding: one active device per user, email OTP verification for transfer
  device: deviceRouter,

  // Config: remote_config served via service_role (bypasses RLS)
  config: configRouter,

  // Onboarding: dynamic onboarding flows served via service_role (bypasses RLS)
  onboarding: onboardingRouter,

  // Paywall: placements, rules, feature gates (served via service_role)
  paywall: paywallRouter,

  // Admin: read-only dashboard endpoints (Phase 4A)
  admin: adminRouter,

  // Signup alert: check for verified email re-registration.
  // Returns same response regardless of email status — no leak of email existence.
  signup: router({
    checkAlert: publicProcedure
      .input(z.object({ email: z.string().email(), lang: z.enum(["he", "en"]).default("he") }))
      .mutation(async ({ input }) => {
        // Await the handler so it completes before the response is sent.
        // The client doesn't care about the result — we always return { ok: true }.
        try {
          await handleSignupAlert(input.email, input.lang);
        } catch (err) {
          console.error("[signup-alert] handleSignupAlert error:", err);
        }
        // Always return the same response regardless of email status
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
