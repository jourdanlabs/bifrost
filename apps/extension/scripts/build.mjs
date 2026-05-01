// Bundle the extension with esbuild and copy static assets.
import { build, context } from "esbuild";
import { mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

async function clean() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
}

async function copyStatic() {
  const pub = path.join(root, "public");
  await cp(pub, dist, { recursive: true });
  // icons may not exist yet; tolerate.
  const icons = path.join(root, "icons");
  await cp(icons, path.join(dist, "icons"), { recursive: true }).catch(() => {});
}

const entries = {
  background: "src/background.ts",
  content: "src/content.ts",
  "content-generic": "src/content-generic.ts",
  popup: "src/popup.ts",
  options: "src/options.ts",
};

const common = {
  bundle: true,
  format: "iife",
  target: "chrome110",
  platform: "browser",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

async function run() {
  await clean();
  await copyStatic();

  const tasks = Object.entries(entries).map(async ([name, file]) => {
    const opts = {
      ...common,
      entryPoints: [path.join(root, file)],
      outfile: path.join(dist, `${name}.js`),
    };
    if (watch) {
      const ctx = await context(opts);
      await ctx.watch();
    } else {
      await build(opts);
    }
  });

  await Promise.all(tasks);
  if (!watch) console.log(`[bifrost-edge] built -> ${dist}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
