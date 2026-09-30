import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const origin = "https://courier-trackers.vercel.app";
const oauthSource = ts.transpileModule(
  readFileSync(new URL("../lib/claudeOauth.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function oauthWithEnv(env) {
  const exports = {};
  vm.runInNewContext(oauthSource, {
    exports,
    process: { env },
    URL,
    require: (id) => {
      if (id === "node:crypto") return require(id);
      if (id === "next/server" || id === "@/lib/prisma") return {};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return exports;
}

test("production uses the explicit Vercel origin, not request headers", () => {
  const oauth = oauthWithEnv({ NODE_ENV: "production" });
  const req = { nextUrl: new URL("https://untrusted.example/api/mcp") };
  assert.equal(oauth.getClaudeOrigin(req), origin);
  assert.equal(oauth.claudeResource(req), `${origin}/api/mcp`);
});

test("production permits a canonical HTTPS override but rejects invalid overrides", () => {
  const oauth = oauthWithEnv({
    NODE_ENV: "production",
    CLAUDE_OAUTH_ISSUER: "https://orders.example",
  });
  assert.equal(oauth.getClaudeOrigin({}), "https://orders.example");
  for (const value of ["http://orders.example", `${origin}/api/mcp`, `${origin}?x=1`]) {
    assert.throws(() => oauthWithEnv({
      NODE_ENV: "production",
      CLAUDE_OAUTH_ISSUER: value,
    }).getClaudeOrigin({}), /canonical origin/);
  }
});

test("development still uses its configured issuer or a local origin", () => {
  assert.equal(oauthWithEnv({
    NODE_ENV: "development",
    CLAUDE_OAUTH_ISSUER: "https://preview.example",
  }).getClaudeOrigin({}), "https://preview.example");
  const oauth = oauthWithEnv({ NODE_ENV: "development" });
  assert.equal(oauth.getClaudeOrigin({ nextUrl: new URL("http://localhost:5000") }), "http://localhost:5000");
  assert.throws(() => oauth.getClaudeOrigin({
    nextUrl: new URL("https://untrusted.example"),
  }), /non-local development proxy/);
});

const buildSource = readFileSync(
  new URL("../scripts/build.mjs", import.meta.url), "utf8",
).replace('import { spawnSync } from "node:child_process";', "");

function simulateBuild(env, statuses = []) {
  const calls = [];
  let exitCode = null;
  const stopped = new Error("build stopped");
  try {
    vm.runInNewContext(buildSource, {
      process: {
        env,
        exit: (code) => { exitCode = code; throw stopped; },
      },
      console: { error() {} },
      spawnSync: (command, args, options) => {
        calls.push({ command, args: Array.from(args), env: options.env });
        return { status: statuses[calls.length - 1] ?? 0 };
      },
    });
  } catch (error) {
    if (error !== stopped) throw error;
  }
  return { calls, exitCode };
}

test("build uses the runtime's preferred database and never accepts data loss", () => {
  const { calls, exitCode } = simulateBuild({
    NEON_DATABASE_URL: "mock-neon-url",
    DATABASE_URL: "mock-other-url",
  });
  assert.equal(exitCode, null);
  assert.deepEqual(calls.map(({ args }) => args), [
    ["--no-install", "prisma", "generate"],
    ["--no-install", "prisma", "db", "push"],
    ["--no-install", "next", "build"],
  ]);
  for (const call of calls) {
    assert.equal(call.env.DATABASE_URL, "mock-neon-url");
    assert.ok(!call.args.includes("--accept-data-loss"));
  }
});

test("build supports DATABASE_URL alone and stops on missing config or a failed schema push", () => {
  assert.equal(simulateBuild({ DATABASE_URL: "mock-url" }).calls[0].env.DATABASE_URL, "mock-url");
  const missing = simulateBuild({});
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.calls.length, 0);
  const failed = simulateBuild({ DATABASE_URL: "mock-url" }, [0, 1]);
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.calls.length, 2);
});