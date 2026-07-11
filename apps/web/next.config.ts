import type { NextConfig } from "next";

// Same-origin API proxy: the browser talks to /api/* on the web origin, and Next
// forwards to the Go API. This lets the API set httpOnly auth cookies that the
// browser will actually send (cross-origin cookies don't flow over plain HTTP),
// keeping tokens out of JavaScript. Point API_PROXY_TARGET at the API in prod.
const API_TARGET = process.env.API_PROXY_TARGET || "http://localhost:8080";

// Baseline security headers. (A full nonce-based script/style CSP is a follow-up;
// frame-ancestors 'none' already blocks clickjacking without risking app breakage.)
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@russkiy/shared"],
  // Never ship client-side source maps to production — they'd expose readable source.
  // (Next.js already defaults this to false; set explicitly so it can't regress.)
  productionBrowserSourceMaps: false,
  // Don't leak the framework/version in the Server header.
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_TARGET}/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
