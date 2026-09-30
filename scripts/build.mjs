import { spawnSync } from "node:child_process";

// Match lib/prisma.ts: the runtime prefers Neon when both URLs are configured.
// Keep connection strings in child-process environments, never command arguments.
const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Build requires NEON_DATABASE_URL or DATABASE_URL.");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
const commands = [
  ["prisma", "generate"],
  // Refuse destructive schema changes instead of silently accepting data loss.
  ["prisma", "db", "push"],
  ["next", "build"],
];

for (const args of commands) {
  const result = spawnSync("npx", ["--no-install", ...args], {
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Unable to run ${args[0]} during build.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}