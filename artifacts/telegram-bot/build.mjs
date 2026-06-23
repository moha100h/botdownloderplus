import { build } from "esbuild";
import { rmSync, mkdirSync } from "fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/index.cjs",
  sourcemap: true,
  packages: "external",
  define: {
    "import.meta.url": '"file:///dist/index.cjs"',
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log("Build complete → dist/index.cjs");
