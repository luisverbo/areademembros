import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, createUser } from "./helpers";

let db: Client;
let drop: () => Promise<void>;

// Dados base
let adminId: string;
let aliceId: string; // aluna da turma A (mentoria)
let bobId: string; // aluno da turma B (perpétua)
let carolId: string; // sem matrícula
let courseId: string;
let lessons: string[]; // 4 aulas publicadas do curso
let draftLessonId: string;
let freeLessonId: string;
let cohortA: string;
let cohortB: string;

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

beforeAll(async () => {
  ({ client: db, drop } = await createTestDatabase());

  adminId = await createUser(db, "admin@lc.test", { full_name: "Luís" }, "admin");
  aliceId = await createUser(db, "alice@lc.test", { full_name: "Alice", whatsapp: "+5511999990000", marketing_consent: true });
  bobId = await createUser(db, "bob@lc.test");
  carolId = await createUser(db, "carol@lc.test");

  [{ id: courseId }] = await q<{ id: string }>(
    "insert into courses (slug, title, is_published) values ('ia-negocios-locais', 'IA para Negócios Locais', true) returning id",
  );
  const [{ id: moduleId }] = await q<{ id: string }>(
    "insert into modules (course_id, title, position) values ($1, 'Módulo 1', 0) returning id",
    [courseId],
  );
  lessons = [];
  for (let i = 0; i < 4; i++) {
    const [{ id }] = await q<{ id: string }>(
      "insert into lessons (module_id, title, position, is_published) values ($1, $2, $3, true) returning id",
      [moduleId, `Aula ${i + 1}`, i],
    );
    await q("insert into lesson_contents (lesson_id, video_provider, video_id) values ($1, 'bunny', $2)", [id, `vid-${i}`]);
    lessons.push(id);
  }
  [{ id: draftLessonId }] = await q<{ id: string }>(
    "insert into lessons (module_id, title, position, is_published) values ($1, 'Rascunho', 9, false) returning id",
    [moduleId],
  );
  [{ id: freeLessonId }] = await q<{ id: string }>(
    "insert into lessons (module_id, title, position, is_published, is_free) values ($1, 'Aula grátis', 10, true, true) returning id",
    [moduleId],
  );
  await q("insert into lesson_contents (lesson_id, video_provider, video_id) values ($1, 'youtube', 'yt-free')", [freeLessonId]);

  // Turma A: tudo liberado, começou há 15 dias.
  [{ id: cohortA }] = await q<{ id: string }>(
    `insert into cohorts (course_id, name, release_mode, release_config, starts_at)
     values ($1, 'Mentoria T1', 'all', '{}', $2) returning id`,
    [courseId, iso(Date.now() - 15 * DAY)],
  );
  // Turma B: só aulas 1 e 2, tudo liberado.
  [{ id: cohortB }] = await q<{ id: string }>(
    "insert into cohorts (course_id, name, release_mode) values ($1, 'Perpétua', 'all') returning id",
    [courseId],
  );
  for (const [i, id] of lessons.entries()) {
    await q("insert into cohort_lessons (cohort_id, lesson_id, position) values ($1, $2, $3)", [cohortA, id, i]);
  }
  await q("insert into cohort_lessons (cohort_id, lesson_id, position) values ($1, $2, 0), ($1, $3, 1)", [cohortB, lessons[0], lessons[1]]);

  await q("insert into enrollments (user_id, cohort_id, origin) values ($1, $2, 'purchase')", [aliceId, cohortA]);
  await q("insert into enrollments (user_id, cohort_id, origin) values ($1, $2, 'purchase')", [bobId, cohortB]);
}, 60_000);

afterAll(async () => {
  await drop?.();
});

describe("profiles", () => {
  it("cria o perfil a partir do cadastro no Auth", async () => {
    const [p] = await q("select email, full_name, whatsapp, role, marketing_consent, marketing_consent_at from profiles where id = $1", [
      aliceId,
    ]);
    expect(p).toMatchObject({
      email: "alice@lc.test",
      full_name: "Alice",
      whatsapp: "+5511999990000",
      role: "student",
      marketing_consent: true,
    });
    expect(p.marketing_consent_at).not.toBeNull();
  });

  it("aluno edita o próprio nome mas não consegue virar admin", async () => {
    await as(db, aliceId, async () => {
      await db.query("update profiles set full_name = 'Alice B' where id = $1", [aliceId]);
      await expect(db.query("update profiles set role = 'admin' where id = $1", [aliceId])).rejects.toThrow(/Somente admin/);
    });
  });

  it("aluno não vê o perfil dos outros; admin vê todos", async () => {
    const asAlice = await as(db, aliceId, () => q("select id from profiles"));
    expect(asAlice.map((r) => r.id)).toEqual([aliceId]);
    const asAdmin = await as(db, adminId, () => q("select id from profiles"));
    expect(asAdmin.length).toBe(4);
  });

  it("admin promove outro usuário", async () => {
    await as(db, adminId, async () => {
      const r = await db.query("update profiles set role = 'admin' where id = $1", [carolId]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("vitrine pública", () => {
  it("visitante vê cursos e aulas publicados, mas não o conteúdo nem os produtos", async () => {
    await as(db, null, async () => {
      expect((await q("select id from courses")).length).toBe(1);
      const titles = (await q<{ title: string }>("select title from lessons")).map((r) => r.title);
      expect(titles).not.toContain("Rascunho");
      expect(titles).toContain("Aula 1");
      await expect(db.query("select * from lesson_contents")).rejects.toThrow(/permission denied/);
    });
    await as(db, null, async () => {
      await expect(db.query("select * from cohort_products")).rejects.toThrow(/permission denied/);
    });
  });

  it("curso não publicado some da vitrine", async () => {
    await q("insert into courses (slug, title) values ('rascunho', 'Rascunho')");
    const rows = await as(db, carolId, () => q("select slug from courses"));
    expect(rows.map((r) => r.slug)).toEqual(["ia-negocios-locais"]);
    await q("delete from courses where slug = 'rascunho'");
  });
});

describe("acesso às aulas", () => {
  const canAccess = (userId: string, lessonId: string) =>
    as(db, userId, async () => (await q<{ ok: boolean }>("select can_access_lesson($1) as ok", [lessonId]))[0].ok);

  it("aluno matriculado acessa as aulas da turma; não matriculado não", async () => {
    expect(await canAccess(aliceId, lessons[3])).toBe(true);
    expect(await canAccess(carolId, lessons[0])).toBe(false);
  });

  it("turma só dá acesso às aulas escolhidas para ela", async () => {
    expect(await canAccess(bobId, lessons[1])).toBe(true);
    expect(await canAccess(bobId, lessons[2])).toBe(false);
  });

  it("conteúdo (ID do vídeo) segue a mesma regra via RLS", async () => {
    const rows = await as(db, bobId, () => q<{ video_id: string }>("select video_id from lesson_contents order by video_id"));
    expect(rows.map((r) => r.video_id)).toEqual(["vid-0", "vid-1", "yt-free"]);
  });

  it("aula grátis: qualquer usuário logado; visitante não", async () => {
    expect(await canAccess(carolId, freeLessonId)).toBe(true);
    const anon = await as(db, null, async () => {
      // visitante nem tem permissão de chamar a função
      try {
        await db.query("select can_access_lesson($1)", [freeLessonId]);
        return "allowed";
      } catch {
        return "denied";
      }
    });
    expect(anon).toBe("denied");
  });

  it("aula não publicada: só admin", async () => {
    await q("insert into cohort_lessons (cohort_id, lesson_id, position) values ($1, $2, 99)", [cohortA, draftLessonId]);
    expect(await canAccess(aliceId, draftLessonId)).toBe(false);
    expect(await canAccess(adminId, draftLessonId)).toBe(true);
    await q("delete from cohort_lessons where lesson_id = $1", [draftLessonId]);
  });

  it("reembolso remove o acesso na hora", async () => {
    await q("update enrollments set status = 'refunded' where user_id = $1", [bobId]);
    expect(await canAccess(bobId, lessons[0])).toBe(false);
    await q("update enrollments set status = 'active' where user_id = $1", [bobId]);
    expect(await canAccess(bobId, lessons[0])).toBe(true);
  });

  it("acesso expirado bloqueia, mesmo com status ativo", async () => {
    await q("update enrollments set expires_at = now() - interval '1 minute' where user_id = $1", [bobId]);
    expect(await canAccess(bobId, lessons[0])).toBe(false);
    await q("update enrollments set expires_at = null where user_id = $1", [bobId]);
  });

  it("liberação individual pelo admin", async () => {
    expect(await canAccess(bobId, lessons[3])).toBe(false);
    await q("insert into lesson_unlocks (user_id, lesson_id, created_by) values ($1, $2, $3)", [bobId, lessons[3], adminId]);
    expect(await canAccess(bobId, lessons[3])).toBe(true);
    await q("delete from lesson_unlocks where user_id = $1", [bobId]);
  });

  it("turma não aceita aula de outro curso", async () => {
    const [{ id: otherCourse }] = await q<{ id: string }>("insert into courses (slug, title) values ('outro', 'Outro') returning id");
    const [{ id: m }] = await q<{ id: string }>("insert into modules (course_id, title) values ($1, 'M') returning id", [otherCourse]);
    const [{ id: l }] = await q<{ id: string }>("insert into lessons (module_id, title) values ($1, 'L') returning id", [m]);
    await expect(db.query("insert into cohort_lessons (cohort_id, lesson_id) values ($1, $2)", [cohortA, l])).rejects.toThrow(
      /não pertence ao curso/,
    );
    await q("delete from courses where id = $1", [otherCourse]);
  });

  it("aluno não grava progresso em aula travada", async () => {
    await as(db, bobId, () =>
      db.query("insert into lesson_progress (user_id, lesson_id, percent) values ($1, $2, 50)", [bobId, lessons[0]]),
    );
    await as(db, bobId, async () => {
      await expect(
        db.query("insert into lesson_progress (user_id, lesson_id, percent) values ($1, $2, 50)", [bobId, lessons[2]]),
      ).rejects.toThrow(/row-level security/);
    });
    await as(db, bobId, async () => {
      await expect(
        db.query("insert into lesson_progress (user_id, lesson_id, percent) values ($1, $2, 50)", [aliceId, lessons[0]]),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("cálculo da liberação (America/Sao_Paulo)", () => {
  async function cohortWith(mode: string, config: object, startsAt: string | null, lessonCount = 3) {
    const [{ id }] = await q<{ id: string }>(
      "insert into cohorts (course_id, name, release_mode, release_config, starts_at) values ($1, 'T', $2, $3, $4) returning id",
      [courseId, mode, config, startsAt],
    );
    for (let i = 0; i < lessonCount; i++) {
      await q("insert into cohort_lessons (cohort_id, lesson_id, position) values ($1, $2, $3)", [id, lessons[i], i]);
    }
    return id;
  }
  const releaseAt = async (cohortId: string, lessonId: string, enrolledAt: string | null = null) =>
    (await q<{ r: Date | null }>("select lesson_release_at($1, $2, $3) as r", [cohortId, lessonId, enrolledAt]))[0].r?.toISOString() ??
    null;

  it("semanal: toda segunda 19h a partir do início", async () => {
    // Quinta 01/10/2026 10h (BRT) -> segunda 05/10 19h BRT = 22h UTC
    const c = await cohortWith("weekly", { weekday: 1, time: "19:00" }, "2026-10-01T13:00:00Z");
    expect(await releaseAt(c, lessons[0])).toBe("2026-10-05T22:00:00.000Z");
    expect(await releaseAt(c, lessons[1])).toBe("2026-10-12T22:00:00.000Z");
    expect(await releaseAt(c, lessons[2])).toBe("2026-10-19T22:00:00.000Z");
  });

  it("semanal: se a turma começa exatamente no horário, a 1ª aula libera no início", async () => {
    const c = await cohortWith("weekly", { weekday: 1, time: "19:00" }, "2026-10-05T22:00:00Z");
    expect(await releaseAt(c, lessons[0])).toBe("2026-10-05T22:00:00.000Z");
  });

  it("semanal: início depois do horário do dia pula para a semana seguinte", async () => {
    const c = await cohortWith("weekly", { weekday: 1, time: "19:00" }, "2026-10-05T23:00:00Z");
    expect(await releaseAt(c, lessons[0])).toBe("2026-10-12T22:00:00.000Z");
  });

  it("semanal: data manual na aula vence a recorrência", async () => {
    const c = await cohortWith("weekly", { weekday: 1, time: "19:00" }, "2026-10-01T13:00:00Z");
    await q("update cohort_lessons set release_at = '2026-10-02T12:00:00Z' where cohort_id = $1 and lesson_id = $2", [c, lessons[1]]);
    expect(await releaseAt(c, lessons[1])).toBe("2026-10-02T12:00:00.000Z");
  });

  it("semanal: configuração inválida é recusada", async () => {
    await expect(cohortWith("weekly", { weekday: 8, time: "19:00" }, null)).rejects.toThrow(/check constraint/);
  });

  it("data fixa: cada aula tem a sua; sem data fica travada", async () => {
    const c = await cohortWith("fixed_date", {}, null);
    await q("update cohort_lessons set release_at = '2026-11-01T12:00:00Z' where cohort_id = $1 and lesson_id = $2", [c, lessons[0]]);
    expect(await releaseAt(c, lessons[0])).toBe("2026-11-01T12:00:00.000Z");
    expect(await releaseAt(c, lessons[1])).toBeNull();
  });

  it("dias após a entrada: intervalo padrão e exceção por aula", async () => {
    const c = await cohortWith("days_after_join", { interval_days: 7 }, null);
    const joined = "2026-10-10T15:00:00.000Z";
    expect(await releaseAt(c, lessons[0], joined)).toBe(joined);
    expect(await releaseAt(c, lessons[2], joined)).toBe("2026-10-24T15:00:00.000Z");
    await q("update cohort_lessons set release_offset_days = 1 where cohort_id = $1 and lesson_id = $2", [c, lessons[2]]);
    expect(await releaseAt(c, lessons[2], joined)).toBe("2026-10-11T15:00:00.000Z");
  });

  it("dias após a entrada: nunca antes do início da turma", async () => {
    const c = await cohortWith("days_after_join", { interval_days: 0 }, "2026-12-01T12:00:00Z");
    expect(await releaseAt(c, lessons[0], "2026-10-10T15:00:00Z")).toBe("2026-12-01T12:00:00.000Z");
  });

  it("tudo liberado com início no futuro: trava até o início", async () => {
    const c = await cohortWith("all", {}, iso(Date.now() + 3 * DAY));
    await q("insert into enrollments (user_id, cohort_id, origin) values ($1, $2, 'manual')", [carolId, c]);
    const rows = await as(db, carolId, () =>
      q<{ is_released: boolean; release_at: Date }>("select * from cohort_lessons_for_user($1)", [c]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.is_released)).toBe(true);
    await q("delete from enrollments where user_id = $1 and cohort_id = $2", [carolId, c]);
  });

  it("lista da turma para o aluno mostra liberadas e futuras", async () => {
    const c = await cohortWith("days_after_join", { interval_days: 7 }, null);
    await q("insert into enrollments (user_id, cohort_id, origin, started_at) values ($1, $2, 'manual', $3)", [
      carolId,
      c,
      iso(Date.now() - 8 * DAY),
    ]);
    const rows = await as(db, carolId, () =>
      q<{ lesson_id: string; is_released: boolean }>("select * from cohort_lessons_for_user($1)", [c]),
    );
    expect(rows.map((r) => r.is_released)).toEqual([true, true, false]);
    // Outro aluno não consulta a lista de Carol
    await as(db, bobId, async () => {
      await expect(db.query("select * from cohort_lessons_for_user($1, $2)", [c, carolId])).rejects.toThrow(/forbidden/);
    });
    await q("delete from enrollments where user_id = $1 and cohort_id = $2", [carolId, c]);
  });
});

describe("comentários por turma", () => {
  it("cada turma só vê os próprios comentários", async () => {
    await as(db, aliceId, () =>
      db.query("insert into comments (lesson_id, cohort_id, user_id, content) values ($1, $2, $3, 'Dúvida da turma A')", [
        lessons[0],
        cohortA,
        aliceId,
      ]),
    );
    // as() desfaz a transação; grava de verdade como superusuário para o teste de leitura
    await q("insert into comments (lesson_id, cohort_id, user_id, content) values ($1, $2, $3, 'Dúvida da turma A')", [
      lessons[0],
      cohortA,
      aliceId,
    ]);
    const bobSees = await as(db, bobId, () => q("select content from comments"));
    expect(bobSees).toHaveLength(0);
    const aliceSees = await as(db, aliceId, () => q("select content from comments"));
    expect(aliceSees).toHaveLength(1);
  });

  it("aluno não comenta em turma alheia", async () => {
    await as(db, bobId, async () => {
      await expect(
        db.query("insert into comments (lesson_id, cohort_id, user_id, content) values ($1, $2, $3, 'oi')", [lessons[0], cohortA, bobId]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("aluno não preenche nem altera os campos da IA", async () => {
    const [row] = await as(db, aliceId, () =>
      q<{ ai_category: string | null }>(
        "insert into comments (lesson_id, cohort_id, user_id, content, ai_category) values ($1, $2, $3, 'oi', 'praise') returning ai_category",
        [lessons[0], cohortA, aliceId],
      ),
    ).catch(() => [{ ai_category: "blocked" }]);
    // Ou a coluna é negada pelo privilégio, ou o trigger zera o valor.
    expect(row.ai_category === null || row.ai_category === "blocked").toBe(true);
  });
});

describe("webhooks", () => {
  it("evento repetido do mesmo provedor é recusado (idempotência)", async () => {
    await q("insert into webhook_events (provider, idempotency_key, payload) values ('kiwify', 'ord-1', '{}')");
    await expect(
      db.query("insert into webhook_events (provider, idempotency_key, payload) values ('kiwify', 'ord-1', '{}')"),
    ).rejects.toThrow(/duplicate key/);
    await q("insert into webhook_events (provider, idempotency_key, payload) values ('hotmart', 'ord-1', '{}')");
  });

  it("aluno não lê eventos de webhook", async () => {
    const rows = await as(db, aliceId, () => q("select * from webhook_events"));
    expect(rows).toHaveLength(0);
  });
});

describe("funções de matrícula e turma", () => {
  it("aluno não chama funções de admin", async () => {
    await as(db, aliceId, async () => {
      await expect(db.query("select enroll_user($1, $2, 'manual')", [aliceId, cohortB])).rejects.toThrow(/forbidden/);
    });
    await as(db, aliceId, async () => {
      await expect(db.query("select duplicate_cohort($1)", [cohortA])).rejects.toThrow(/forbidden/);
    });
    await as(db, aliceId, async () => {
      await expect(db.query("select set_cohort_lessons($1, '[]')", [cohortA])).rejects.toThrow(/forbidden/);
    });
  });

  it("matricula com prazo de acesso e reativa sem reiniciar quem já está ativo", async () => {
    const [{ id: c }] = await q<{ id: string }>(
      "insert into cohorts (course_id, name, access_months) values ($1, 'Anual', 12) returning id",
      [courseId],
    );
    const [first] = await as(db, adminId, () =>
      q<{ expires_at: Date; started_at: Date; status: string }>("select * from enroll_user($1, $2, 'manual')", [carolId, c]),
    );
    expect(first.status).toBe("active");
    const months = (first.expires_at.getTime() - first.started_at.getTime()) / DAY;
    expect(months).toBeGreaterThan(364);
    expect(months).toBeLessThan(367);

    // Grava de verdade (fora do rollback) e simula reembolso + nova compra
    await q("select enroll_user($1, $2, 'purchase', 'kiwify', 'tx-1')", [carolId, c]);
    await q("update enrollments set status = 'refunded', started_at = now() - interval '30 days' where user_id = $1 and cohort_id = $2", [
      carolId,
      c,
    ]);
    const [again] = await q<{ status: string; external_transaction_id: string; started_at: Date }>(
      "select * from enroll_user($1, $2, 'purchase', 'hotmart', 'tx-2')",
      [carolId, c],
    );
    expect(again.status).toBe("active");
    expect(again.external_transaction_id).toBe("tx-2");
    // started_at preservado (o progresso de liberação não volta ao zero)
    expect(Date.now() - again.started_at.getTime()).toBeGreaterThan(29 * DAY);
  });

  it("duplica a turma com as aulas, inativa e sem produtos", async () => {
    await q("insert into cohort_products (cohort_id, provider, external_product_id) values ($1, 'kiwify', 'prod-A')", [cohortA]);
    const [{ id }] = await q<{ id: string }>("select duplicate_cohort($1) as id", [cohortA]);
    const [copy] = await q<{ name: string; is_active: boolean }>("select name, is_active from cohorts where id = $1", [id]);
    expect(copy).toEqual({ name: "Mentoria T1 (cópia)", is_active: false });
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from cohort_lessons where cohort_id = $1", [id]);
    expect(n).toBe(4);
    const [{ p }] = await q<{ p: number }>("select count(*)::int as p from cohort_products where cohort_id = $1", [id]);
    expect(p).toBe(0);
  });

  it("define aulas, ordem e datas da turma de uma vez", async () => {
    const [{ id: c }] = await q<{ id: string }>(
      "insert into cohorts (course_id, name, release_mode) values ($1, 'Datas', 'fixed_date') returning id",
      [courseId],
    );
    await q("insert into cohort_lessons (cohort_id, lesson_id, position) values ($1, $2, 0)", [c, lessons[0]]);
    const items = [
      { lesson_id: lessons[2], release_at: "2026-11-02T22:00:00Z", release_offset_days: null },
      { lesson_id: lessons[1], release_at: null, release_offset_days: null },
    ];
    await as(db, adminId, () => db.query("select set_cohort_lessons($1, $2)", [c, JSON.stringify(items)]));
    // as() desfaz; aplica de verdade para conferir
    await q("select set_cohort_lessons($1, $2)", [c, JSON.stringify(items)]);
    const rows = await q<{ lesson_id: string; position: number; release_at: Date | null }>(
      "select lesson_id, position, release_at from cohort_lessons where cohort_id = $1 order by position",
      [c],
    );
    expect(rows.map((r) => r.lesson_id)).toEqual([lessons[2], lessons[1]]);
    expect(rows[0].release_at?.toISOString()).toBe("2026-11-02T22:00:00.000Z");
  });
});

describe("regras de acesso (decisões de 01/10)", () => {
  it("aluno não fica ativo em duas turmas do mesmo curso", async () => {
    // Alice está ativa na turma A; tentar a turma B do mesmo curso falha
    await expect(q("select enroll_user($1, $2, 'manual')", [aliceId, cohortB])).rejects.toThrow(/outra turma deste curso/);
  });

  it("pode entrar em outra turma do curso depois que a anterior deixa de valer", async () => {
    await q("update enrollments set status = 'refunded' where user_id = $1 and cohort_id = $2", [aliceId, cohortA]);
    await q("select enroll_user($1, $2, 'manual')", [aliceId, cohortB]);
    // Reativar a A agora conflita com a B ativa
    await expect(q("update enrollments set status = 'active' where user_id = $1 and cohort_id = $2", [aliceId, cohortA])).rejects.toThrow(
      /outra turma deste curso/,
    );
    // Volta ao estado original
    await q("delete from enrollments where user_id = $1 and cohort_id = $2", [aliceId, cohortB]);
    await q("update enrollments set status = 'active' where user_id = $1 and cohort_id = $2", [aliceId, cohortA]);
  });

  it("cursos diferentes: pode ter várias matrículas ativas", async () => {
    const [{ id: other }] = await q<{ id: string }>("insert into courses (slug, title) values ('minicurso-ig', 'Minicurso') returning id");
    const [{ id: oc }] = await q<{ id: string }>("insert into cohorts (course_id, name) values ($1, 'Perpétua') returning id", [other]);
    await q("select enroll_user($1, $2, 'purchase')", [aliceId, oc]);
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from enrollments where user_id = $1 and status = 'active'", [
      aliceId,
    ]);
    expect(n).toBe(2);
    await q("delete from courses where id = $1", [other]);
  });

  it("prazo de acesso pode contar do início da turma", async () => {
    const start = "2026-12-01T12:00:00.000Z";
    const [{ id: c }] = await q<{ id: string }>(
      "insert into cohorts (course_id, name, access_months, access_starts_from, starts_at) values ($1, 'Mentoria T2', 6, 'cohort_start', $2) returning id",
      [courseId, start],
    );
    const dave = await createUser(db, "dave@lc.test");
    const [e] = await q<{ expires_at: Date }>("select * from enroll_user($1, $2, 'purchase')", [dave, c]);
    expect(e.expires_at.toISOString()).toBe("2027-06-01T12:00:00.000Z");
    // duplicar preserva a escolha
    const [{ id }] = await q<{ id: string }>("select duplicate_cohort($1) as id", [c]);
    const [copy] = await q<{ access_starts_from: string }>("select access_starts_from from cohorts where id = $1", [id]);
    expect(copy.access_starts_from).toBe("cohort_start");
  });
});

describe("progresso das aulas", () => {
  it("registra posição, só sobe o percentual e conclui aos 90%", async () => {
    await as(db, aliceId, async () => {
      await q("select record_lesson_progress($1, 300, 1000)", [lessons[0]]);
      await q("select record_lesson_progress($1, 100, 1000)", [lessons[0]]);
      const [p] = await q<{ percent: string; last_position_seconds: number; completed_at: Date | null }>(
        "select * from lesson_progress where user_id = $1 and lesson_id = $2",
        [aliceId, lessons[0]],
      );
      expect(Number(p.percent)).toBe(30);
      expect(p.last_position_seconds).toBe(100);
      expect(p.completed_at).toBeNull();
      await q("select record_lesson_progress($1, 920, 1000)", [lessons[0]]);
      const [done] = await q<{ completed_at: Date | null }>(
        "select completed_at from lesson_progress where user_id = $1 and lesson_id = $2",
        [aliceId, lessons[0]],
      );
      expect(done.completed_at).not.toBeNull();
    });
  });

  it("marcar e desmarcar como concluída", async () => {
    await as(db, aliceId, async () => {
      const [a] = await q<{ completed_at: Date | null; percent: string }>("select * from set_lesson_completed($1, true)", [lessons[1]]);
      expect(a.completed_at).not.toBeNull();
      expect(Number(a.percent)).toBe(100);
      const [b] = await q<{ completed_at: Date | null }>("select * from set_lesson_completed($1, false)", [lessons[1]]);
      expect(b.completed_at).toBeNull();
    });
  });

  it("não grava progresso em aula sem acesso", async () => {
    await as(db, carolId, async () => {
      await expect(db.query("select record_lesson_progress($1, 10, 100)", [lessons[0]])).rejects.toThrow(/row-level security/);
    });
  });

  it("visitante não chama as funções de progresso", async () => {
    await as(db, null, async () => {
      await expect(db.query("select record_lesson_progress($1, 10, 100)", [lessons[0]])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("comentários com nome do autor", () => {
  it("mostra nome curto, nunca o e-mail, e respeita a turma", async () => {
    await q("update profiles set full_name = 'Alice Maria Souza' where id = $1", [aliceId]);
    const rows = await as(db, aliceId, () =>
      q<{ author_name: string; author_is_admin: boolean }>("select * from lesson_comments($1, $2)", [lessons[0], cohortA]),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].author_name).toBe("Alice S.");
    expect(JSON.stringify(rows)).not.toContain("@");
    // Bob (turma B) não lê comentários da turma A
    const bob = await as(db, bobId, () => q("select * from lesson_comments($1, $2)", [lessons[0], cohortA]));
    expect(bob).toHaveLength(0);
  });
});

describe("leads e webhooks de saída (1C)", () => {
  it("curso tem estratégia de captação padrão", async () => {
    const [c] = await q<{ lead_fields: string; lead_access: string }>("select lead_fields, lead_access from courses where id = $1", [
      courseId,
    ]);
    expect(c).toEqual({ lead_fields: "name_email_whatsapp", lead_access: "direct" });
  });

  it("só admin vê leads e webhooks; segredo gerado sozinho", async () => {
    await q("insert into leads (user_id, course_id, source) values ($1, $2, 'gratis')", [carolId, courseId]);
    const [w] = await q<{ secret: string }>(
      "insert into outgoing_webhooks (name, url) values ('FunilPro', 'https://funil.test/hook') returning secret",
    );
    expect(w.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(await as(db, carolId, () => q("select * from leads"))).toHaveLength(0);
    expect(await as(db, carolId, () => q("select * from outgoing_webhooks"))).toHaveLength(0);
    expect((await as(db, adminId, () => q("select * from leads"))).length).toBeGreaterThan(0);
  });

  it("evento desconhecido é recusado", async () => {
    await expect(q("insert into outgoing_webhooks (name, url, events) values ('x', 'https://x.test', array['coisa'])")).rejects.toThrow(
      /check constraint/,
    );
  });
});

describe("limite de e-mails de acesso", () => {
  it("segura reenvio em menos de 1 minuto", async () => {
    const [a] = await q<{ ok: boolean }>("select claim_auth_email('X@lc.test', 'login') as ok");
    const [b] = await q<{ ok: boolean }>("select claim_auth_email('x@lc.test ', 'login') as ok");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });

  it("aluno não chama a função", async () => {
    await as(db, aliceId, async () => {
      await expect(db.query("select claim_auth_email('x@lc.test', 'login')")).rejects.toThrow(/permission denied/);
    });
  });
});

describe("transcrição, Professor IA e busca (2A)", () => {
  it("busca em português só nas aulas liberadas para o aluno", async () => {
    await q(
      `insert into lesson_transcript_segments (lesson_id, start_seconds, text) values
       ($1, 65, 'Agora vamos conectar o WhatsApp na ferramenta de automação'),
       ($2, 10, 'Nesta aula conectamos o WhatsApp Business ao CRM')`,
      [lessons[0], lessons[3]],
    );
    // Bob (turma B) só tem as aulas 1 e 2
    const bob = await as(db, bobId, () =>
      q<{ lesson_id: string; start_seconds: number }>("select * from search_lesson_segments('como conecto o whatsapp')"),
    );
    expect(bob.map((r) => r.lesson_id)).toEqual([lessons[0]]);
    expect(bob[0].start_seconds).toBe(65);
    // Alice (turma A) vê as duas
    const alice = await as(db, aliceId, () => q("select * from search_lesson_segments('whatsapp')"));
    expect(alice).toHaveLength(2);
    // Carol (sem matrícula) não vê nada
    expect(await as(db, carolId, () => q("select * from search_lesson_segments('whatsapp')"))).toHaveLength(0);
  });

  it("aluno não lê transcrição de aula travada", async () => {
    const rows = await as(db, bobId, () => q("select lesson_id from lesson_transcript_segments"));
    expect(rows.every((r) => r.lesson_id !== lessons[3])).toBe(true);
  });

  it("conversa com o Professor IA é privada e exige acesso à aula", async () => {
    const [conv] = await as(db, aliceId, async () => {
      const rows = await q<{ id: string }>("insert into ai_conversations (user_id, lesson_id) values ($1, $2) returning id", [
        aliceId,
        lessons[0],
      ]);
      await q("insert into ai_messages (conversation_id, role, content) values ($1, 'user', 'Dúvida')", [rows[0].id]);
      return rows;
    });
    expect(conv.id).toBeTruthy();
    // Carol não cria conversa numa aula que não pode ver
    await as(db, carolId, async () => {
      await expect(db.query("insert into ai_conversations (user_id, lesson_id) values ($1, $2)", [carolId, lessons[0]])).rejects.toThrow(
        /row-level security/,
      );
    });
    // Grava de verdade e confere privacidade
    const [{ id }] = await q<{ id: string }>("insert into ai_conversations (user_id, lesson_id) values ($1, $2) returning id", [
      aliceId,
      lessons[1],
    ]);
    await q("insert into ai_messages (conversation_id, role, content) values ($1, 'user', 'Pergunta da Alice')", [id]);
    expect(await as(db, bobId, () => q("select * from ai_messages"))).toHaveLength(0);
    expect((await as(db, adminId, () => q("select * from ai_messages"))).length).toBeGreaterThan(0);
  });
});
