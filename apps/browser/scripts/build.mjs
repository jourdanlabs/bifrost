import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function prepare() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
}

async function buildOnce() {
  prepare();
  await esbuild.build({
    entryPoints: [path.join(root, "src/app.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
    outfile: path.join(dist, "app.js"),
    loader: { ".css": "css" },
    minify: !watch,
    sourcemap: watch,
  });
}

if (watch) {
  await buildOnce();
  const ctx = await esbuild.context({
    entryPoints: [path.join(root, "src/app.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
    outfile: path.join(dist, "app.js"),
    loader: { ".css": "css" },
    sourcemap: true,
  });
  await ctx.watch();
  console.log("[bifrost-browser] watching");
} else {
  await buildOnce();
  console.log("[bifrost-browser] built dist/");
}
