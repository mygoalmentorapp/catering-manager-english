import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

/**
 * Known sandbox dev domains where we need cross-subdomain cookie sharing.
 * e.g., "3000-xxx.sg1.manus.computer" and "8081-xxx.sg1.manus.computer"
 * need to share cookies via ".sg1.manus.computer".
 *
 * For production domains like "caterapp-xxx.manus.space", we must NOT set
 * a parent domain because "manus.space" may be on the Public Suffix List,
 * causing browsers to silently reject the Set-Cookie header.
 */
const DEV_SANDBOX_PATTERNS = [
  ".manus.computer",  // sandbox dev domains
  ".manuspre.computer",
];

/**
 * Extract parent domain for cookie sharing across subdomains.
 * Only applies to known dev sandbox domains where port-based subdomains
 * need to share cookies. For production, returns undefined so the cookie
 * is scoped to the exact hostname (safest approach).
 */
function getParentDomain(hostname: string): string | undefined {
  // Don't set domain for localhost or IP addresses
  if (LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return undefined;
  }

  // Only set parent domain for known dev sandbox patterns
  for (const pattern of DEV_SANDBOX_PATTERNS) {
    if (hostname.endsWith(pattern)) {
      // For "3000-xxx.sg1.manus.computer" -> ".sg1.manus.computer"
      const parts = hostname.split(".");
      if (parts.length >= 4) {
        // e.g., ["3000-xxx", "sg1", "manus", "computer"] -> ".sg1.manus.computer"
        return "." + parts.slice(1).join(".");
      }
      if (parts.length >= 3) {
        return "." + parts.slice(-2).join(".");
      }
    }
  }

  // For all other domains (production), don't set domain
  // This scopes the cookie to the exact hostname, which is safest
  return undefined;
}

export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname;
  const domain = getParentDomain(hostname);

  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
