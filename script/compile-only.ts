/**
 * Source compilation only. Never imports script/build.ts or executes app/server
 * modules. No copying of attachments/public directories or private workbooks.
 * Output is intentionally NOT a deployable medical-history package.
 */
import { build as bundle } from "esbuild";
import { build as viteBuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const root = process.cwd();
const out = path.resolve(root, "generated-artifacts/compile-only");
const logo = path.resolve(root, "attached_assets/FastBills_Logo_1771803683003.jpg");
function checkAsset(file: string) {
  const clean = file.split("?")[0];
  if (/\.(xlsx?|csv|pdf|docx?)$/i.test(clean) ||
      (clean.includes("/attached_assets/") && clean !== logo))
    throw new Error("Compile-only validation blocked a non-allowlisted data asset");
}
const safeAssets: Plugin = {
  name: "compile-only-data-guard", enforce: "pre",
  load(id) { checkAsset(id); return null; },
};
await mkdir(out, { recursive: true });
await viteBuild({
  configFile: false, root: path.resolve(root, "client"), publicDir: false,
  plugins: [safeAssets, react()],
  resolve: { alias: {
    "@": path.resolve(root, "client/src"), "@shared": path.resolve(root, "shared"),
    "@assets": path.resolve(root, "attached_assets"),
  } },
  build: { outDir: path.join(out, "client"), emptyOutDir: false, manifest: true },
});
const result = await bundle({
  entryPoints: ["server/index.ts"], platform: "node", bundle: true,
  packages: "external", format: "cjs", outfile: path.join(out, "server/index.cjs"),
  define: { "process.env.NODE_ENV": '"production"' }, minify: true, metafile: true,
  plugins: [{ name: "no-private-data", setup(build) {
    build.onLoad({ filter: /\.(xlsx?|csv|pdf|docx?)$/i }, () => {
      throw new Error("Private data asset forbidden in compile-only validation");
    });
  } }],
});
await writeFile(path.join(out, "server-inputs.json"), JSON.stringify(Object.keys(result.metafile!.inputs), null, 2));
console.log("PASS: client production compilation and server source bundle; no workbook copy or server execution.");
console.log("NOT a full deployment package: public favicon/private medical-history workbook intentionally omitted; dependencies external.");
