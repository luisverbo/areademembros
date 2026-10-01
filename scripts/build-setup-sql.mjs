// Junta todas as migrações num único arquivo para colar no SQL Editor do Supabase.
// Uso: node scripts/build-setup-sql.mjs  (gera supabase/setup/01-instalar-banco.sql)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const parts = files.map((f) => `-- >>> ${f}\n${readFileSync(path.join(dir, f), "utf8").trim()}\n`);

const header = `-- =============================================================================
-- LC.Academy — instalação completa do banco (gerado automaticamente; não edite)
-- Origem: supabase/migrations/ (${files.length} migrações)
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num projeto novo. Tudo roda numa transação: se algo falhar, nada é aplicado.
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

writeFileSync(path.resolve(import.meta.dirname, "../supabase/setup/01-instalar-banco.sql"), header + parts.join("\n") + footer);
console.log(`ok: ${files.length} migrações`);
