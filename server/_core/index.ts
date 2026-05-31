import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { adminIndexHtml, adminAssets } from "../admin-assets";
import { createAdaptyWebhookRouter } from "../adapty-webhook";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  // Health endpoint — also checks device status if X-Device-UUID and Authorization are provided.
  // This combines connectivity check + device validation in a single call.
  app.get("/api/health", async (req, res) => {
    const deviceUuid = req.headers["x-device-uuid"] as string | undefined;
    const authHeader = req.headers["authorization"] as string | undefined;

    // Basic health response
    const result: { ok: boolean; timestamp: number; deviceActive?: boolean } = {
      ok: true,
      timestamp: Date.now(),
    };

    // If device UUID and auth are provided, check device status
    if (deviceUuid && authHeader) {
      try {
        const { sdk } = await import("./sdk");
        const authResult = await sdk.authenticateRequest(req);
        const userId = authResult.user?.openId;

        if (userId) {
          const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
          if (url && key) {
            const { createClient } = await import("@supabase/supabase-js");
            const admin = createClient(url, key, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const { data } = await admin
              .from("user_devices")
              .select("status")
              .eq("user_id", userId)
              .eq("device_uuid", deviceUuid)
              .single();

            result.deviceActive = data?.status === "active";
          }
        }
      } catch {
        // Auth or DB failure — don't block health check, just omit device status
      }
    }

    res.json(result);
  });

  // Adapty Webhook endpoint — receives subscription lifecycle events
  app.use("/api/webhooks/adapty", createAdaptyWebhookRouter());

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Serve admin dashboard - embedded assets (no file system dependency)
  // Routes under /api/admin/ so the deploy platform's reverse proxy forwards them to Express
  app.get("/api/admin/assets/:filename", (req, res) => {
    const asset = adminAssets[req.params.filename];
    if (asset) {
      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(asset.content);
    } else {
      res.status(404).send("Not found");
    }
  });
  // Serve admin HTML (SPA fallback for all admin routes)
  app.get("/api/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(adminIndexHtml);
  });
  app.get("/api/admin/*", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(adminIndexHtml);
  });
  // Redirect legacy paths to the official dashboard URL
  app.get("/admin", (_req, res) => res.redirect(301, "/api/admin"));
  app.get("/admin/*", (_req, res) => res.redirect(301, "/api/admin"));
  app.get("/dashboard", (_req, res) => res.redirect(301, "/api/admin"));
  app.get("/dashboard/*", (_req, res) => res.redirect(301, "/api/admin"));
  console.log("[admin] Dashboard served from embedded assets at /api/admin/");

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
