// Module loader hook: resolves the repo-root alias "@/..." to TypeScript
// sources when the benchmark runs directly under Node's type-stripping mode
// (npm run benchmark). Vitest and Next resolve the alias through tsconfig.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function candidates(aliasPath) {
  const base = path.join(ROOT, aliasPath);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const candidate of candidates(specifier.slice(2))) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  return next(specifier, context);
}
