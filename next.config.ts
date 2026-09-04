import type { NextConfig } from "next";

const replitDomain = process.env.REPLIT_DEV_DOMAIN;

const allowedDevOrigins = [
  "*.replit.dev",
  "*.repl.co",
  "*.replit.app",
];

if (replitDomain) {
  allowedDevOrigins.push(replitDomain);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
