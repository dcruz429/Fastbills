/**
 * Explicit offline entry point. It CANNOT connect, collect catalogs, apply SQL,
 * read .env or import Drizzle/app configuration. It only compares JSON files
 * within dedicated metadata directories, after --offline-review is supplied.
 */
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareCatalog } from "./catalog-compare";

function metadataFile(filename: string, suffix: string): unknown {
  const base = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const allowed = ["preflight/rcm/review-inputs", "generated-artifacts/rcm-preflight"].map(p => path.join(base, p) + path.sep);
  const candidate = path.resolve(filename);
  if (!candidate.endsWith(suffix) || !allowed.some(root => candidate.startsWith(root)))
    throw new Error("Only explicitly supplied metadata files in dedicated review directories are accepted");
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000 ||
      !allowed.some(root => realpathSync(candidate).startsWith(root)))
    throw new Error("Unsafe metadata file");
  return JSON.parse(readFileSync(candidate, "utf8"));
}
export function main(args: string[]): number {
  // Deliberately no implicit scan, environment fallback, stdin or execution mode.
  if (args.length !== 5 || args[0] !== "--offline-review" || args[1] !== "--identity" || args[3] !== "--snapshot") {
    console.error("INERT: explicit offline review only. Usage: --offline-review --identity <file.identity.json> --snapshot <file.catalog.json>");
    return 2;
  }
  try {
    const result = compareCatalog(metadataFile(args[2], ".identity.json"), metadataFile(args[4], ".catalog.json"));
    console.log(JSON.stringify(result, null, 2));
    // Exact structure is NOT authority; 0 means offline comparison only.
    return result.status === "exact" ? 0 : result.status === "missing" ? 3 : 4;
  } catch {
    console.error("BLOCKED: invalid or unsafe metadata input; no file contents or credentials are displayed");
    return 4;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
