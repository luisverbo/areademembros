import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Banco de teste: um Postgres comum com o stub do Supabase + as migrações.
// Configure TEST_DATABASE_URL apontando para um servidor onde o usuário pode criar bancos.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

const root = path.resolve(__dirname, "../..");

export async function createTestDatabase(): Promise<{ client: Client; drop: () => Promise<void> }> {
  const dbName = `am_test_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  const files = [
    path.join(root, "supabase/tests/supabase-stub.sql"),
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(root, "supabase/migrations", f)),
  ];
  for (const file of files) {
    await client.query(readFileSync(file, "utf8"));
  }

  return {
    client,
    drop: async () => {
      await client.end();
      await admin.query(`drop database if exists ${dbName} with (force)`);
      await admin.end();
    },
  };
}

/** Executa `fn` como um usuário logado (ou visitante, se userId for null), dentro de uma transação desfeita no fim. */
export async function as<T>(client: Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

export async function createUser(
  client: Client,
  email: string,
  meta: Record<string, unknown> = {},
  role: "student" | "admin" = "student",
): Promise<string> {
  const { rows } = await client.query(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, meta],
  );
  const id = rows[0].id as string;
  if (role === "admin") {
    await client.query("update public.profiles set role = 'admin' where id = $1", [id]);
  }
  return id;
}
