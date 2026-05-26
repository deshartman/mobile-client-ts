import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Tell Next to trace from the monorepo root so the standalone bundle
  // includes files from packages/* that apps/web imports. Without this,
  // the standalone server at runtime is missing @mobileclient/db and
  // @mobileclient/shared-types.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  transpilePackages: ["@mobileclient/shared-types", "@mobileclient/db"],
  serverExternalPackages: ["better-sqlite3"],
  // Next 15+ warns on cross-origin access to /_next/* in dev. For local
  // ngrok tunnels that's exactly what we want — allow explicit hosts.
  // Add your reserved ngrok subdomain here.
  allowedDevOrigins: ["mobile-client-des.ngrok.dev"],
};

export default nextConfig;
