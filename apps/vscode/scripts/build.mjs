// Bundle the VS Code extension with esbuild.
import { build, context } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const opts = {
  entryPoints: [path.join(root, "src/extension.ts")],
  outfile: path.join(dist, "extension.js"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  // VS Code provides `vscode` at runtime — must not be bundled.
  external: ["vscode"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
  console.log(`[bifrost-vscode] built -> ${dist}`);
}
