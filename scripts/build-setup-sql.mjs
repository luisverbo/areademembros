// Junta as migrações num arquivo para colar no SQL Editor do Supabase.
//   node scripts/build-setup-sql.mjs                         -> supabase/setup/01-instalar-banco.sql (instalação completa)
//   node scripts/build-setup-sql.mjs --since 20261001120300 --out supabase/setup/03-x.sql
//                                                            -> só as migrações DEPOIS dessa versão (atualização)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : null;
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "supabase/setup/01-instalar-banco.sql";

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => !since || f.split("_")[0] > since);
if (!files.length) {
  console.error("Nenhuma migração nova.");
  process.exit(1);
}

const parts = files.map((f) => `-- >>> ${f}\n${readFileSync(path.join(dir, f), "utf8").trim()}\n`);

const header = `-- =============================================================================
-- LC.Academy — ${since ? "ATUALIZAÇÃO do banco" : "instalação completa do banco"} (gerado automaticamente; não edite)
-- Migrações: ${files.map((f) => f.split("_")[0]).join(", ")}
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- ${since ? "Rode UMA vez, num banco que já tem a instalação anterior." : "Rode UMA vez, num projeto novo."}
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

`;

const footer = `
-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
${files.map((f) => `  ('${f.split("_")[0]}', '${f.replace(/^\d+_/, "").replace(/\.sql$/, "")}')`).join(",\n")}
on conflict (version) do nothing;

commit;
`;

writeFileSync(path.resolve(import.meta.dirname, "..", out), header + parts.join("\n") + footer);
console.log(`ok: ${out} (${files.length} migrações)`);
