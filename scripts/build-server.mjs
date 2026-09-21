// Bundles the server into dist/server/index.js. Packages in node_modules stay
// external and are installed in the container with `npm ci --omit=dev`.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
