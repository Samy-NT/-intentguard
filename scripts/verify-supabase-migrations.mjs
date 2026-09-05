import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const argIndex = process.argv.indexOf("--dir");
const migrationsDir = resolve(root, argIndex >= 0 ? process.argv[argIndex + 1] ?? "supabase/migrations" : "supabase/migrations");

const files = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  throw new Error(`No SQL migrations found in ${migrationsDir}`);
}

const numbered = [];
const timestamped = [];
for (const file of files) {
  const numberedMatch = /^(\d{3})_[a-z0-9][a-z0-9_]*\.sql$/.exec(file);
  const timestampMatch = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/.exec(file);
  if (!numberedMatch && !timestampMatch) {
    throw new Error(`Invalid migration filename: ${file}`);
  }
  if (numberedMatch) numbered.push({ file, order: Number(numberedMatch[1]) });
  if (timestampMatch) timestamped.push({ file, order: timestampMatch[1] });

  const sql = (await readFile(resolve(migrationsDir, file), "utf8")).trim();
  if (!sql) throw new Error(`Empty migration: ${file}`);
  if (/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m.test(sql)) throw new Error(`Merge conflict marker in migration: ${file}`);
}

numbered.sort((a, b) => a.order - b.order);
for (let index = 0; index < numbered.length; index += 1) {
  const expected = index + 1;
  if (numbered[index].order !== expected) {
    throw new Error(`Numbered migration sequence has a gap: expected ${String(expected).padStart(3, "0")}`);
  }
}
timestamped.sort((a, b) => a.order.localeCompare(b.order));
for (let index = 1; index < timestamped.length; index += 1) {
  if (timestamped[index - 1].order === timestamped[index].order) {
    throw new Error(`Duplicate timestamp in migrations: ${timestamped[index].order}`);
  }
}

const signedMandates = files.find((file) => file.endsWith("_signed_mandates.sql"));
if (!signedMandates) throw new Error("Signed mandates migration is missing");

console.log(`Verified ${files.length} Supabase migrations (${numbered.length} numbered, ${timestamped.length} timestamped)`);
