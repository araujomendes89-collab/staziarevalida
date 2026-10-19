/**
 * Apoio dos testes do Treino em Dupla no banco: abre um Postgres em memória (PGlite) com o ambiente mínimo do Supabase,
 * todas as migrações em ordem (o que está em produção mais a do Treino) e as contas de teste.
 * Nada daqui toca em Supabase, rede ou chaves reais.
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../../..");
export const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");

/** Contas de teste (uuids fixos). `admin` ganha o papel de administrador. */
export const U = {
  ana: "00000000-0000-4000-8000-00000000000a",
  bruno: "00000000-0000-4000-8000-00000000000b",
  carla: "00000000-0000-4000-8000-00000000000c",
  diego: "00000000-0000-4000-8000-00000000000d",
  eva: "00000000-0000-4000-8000-00000000000e",
  fabio: "00000000-0000-4000-8000-00000000000f",
  gil: "00000000-0000-4000-8000-000000000010",
  admin: "00000000-0000-4000-8000-0000000000ad",
} as const satisfies Record<"ana" | "bruno" | "carla" | "diego" | "eva" | "fabio" | "gil" | "admin", string>;

export type Phase = "roles" | "connecting" | "setup" | "running" | "review" | "result" | "closed";

/** Linhas devolvidas; `affectedRows` (escondida) diz quantas linhas um update/insert/delete mexeu. */
export type Linhas = any[] & { affectedRows: number };

export interface DuplaDb {
  db: PGlite;
  /** Chama uma função do esquema public como a pessoa `uid` (papel authenticated) ou, com `null`, como visitante (anon). */
  rpc<T = any>(uid: string | null, fn: string, args?: Record<string, unknown>): Promise<T>;
  /**
   * Roda um SQL como a pessoa `uid` (papel authenticated, com as claims do JWT), numa transação. `settings` fixa variáveis da
   * transação antes do comando (ex.: `{ "realtime.topic": "dupla:online" }`).
   */
  asUser(uid: string, sql: string, params?: unknown[], settings?: Record<string, string>): Promise<Linhas>;
  /** Roda um SQL como dono do banco (sem RLS), para montar e conferir dados. */
  sql<T = any>(q: string, p?: unknown[]): Promise<T[]>;
}

// Esquema `realtime` falso, criado ANTES das migrações e igual ao do Supabase no que as políticas usam.
const REALTIME_FALSO = `
  create schema realtime;
  grant usage on schema realtime to anon, authenticated, service_role;
  create table realtime.messages (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean,
    inserted_at timestamptz not null default now()
  );
  alter table realtime.messages enable row level security;
  grant select, insert on realtime.messages to authenticated;
  create function realtime.topic() returns text language sql stable
    as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  grant execute on function realtime.topic() to anon, authenticated, service_role;
`;

/** Arquivos de migração em ordem; `ate` (opcional) corta antes de um nome de arquivo (exclusivo). */
export function migrationFiles(opts: { semTreino?: boolean } = {}): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !(opts.semTreino && f.includes("treino_dupla")))
    .sort();
}

export async function openDuplaDb(opts: { realtime?: boolean; semTreino?: boolean } = {}): Promise<DuplaDb> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  if (opts.realtime) await db.exec(REALTIME_FALSO);
  for (const file of migrationFiles({ semTreino: opts.semTreino })) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  for (const [nome, id] of Object.entries(U)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${nome}@teste.dev`, { name: nome.toUpperCase() }]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [U.admin]);

  const claims = (uid: string | null) => JSON.stringify(uid ? { sub: uid, role: "authenticated" } : {});
  const asJson = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);

  return {
    db,
    async rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const keys = Object.keys(args);
      return db.transaction(async (tx) => {
        await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims(uid)]);
        const r = await tx.query<{ result: T }>(
          `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
          keys.map((k) => asJson(args[k]))
        );
        return r.rows[0].result;
      });
    },
    async asUser(uid: string, sql: string, params: unknown[] = [], settings: Record<string, string> = {}): Promise<Linhas> {
      return db.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims(uid)]);
        for (const [k, v] of Object.entries(settings)) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        const r = await tx.query<any>(sql, params);
        // As linhas afetadas por update/insert/delete ficam em `affectedRows` (propriedade escondida, para o toEqual das linhas não ver).
        return Object.defineProperty(r.rows, "affectedRows", { value: r.affectedRows, enumerable: false }) as Linhas;
      });
    },
    async sql<T = any>(q: string, p: unknown[] = []): Promise<T[]> {
      return (await db.query<T>(q, p)).rows;
    },
  };
}

/** Plano da pessoa direto no banco. Pro/Elite ganham "plano pago até" daqui a 30 dias; `trialEndsAt` é uma data ISO. */
export async function setPlan(db: PGlite, uid: string, plan: "trial" | "pro" | "elite", status: string, trialEndsAt?: string): Promise<void> {
  await db.query(
    `update public.subscriptions
        set plan = $2::public.plan_code, status = $3::public.subscription_status,
            trial_ends_at = coalesce($4::timestamptz, trial_ends_at),
            current_period_end = case when $2 in ('pro', 'elite') then now() + interval '30 days' else null end
      where user_id = $1`,
    [uid, plan, status, trialEndsAt ?? null]
  );
}

/** Chave do módulo (`app_settings.treino_dupla`) direto no banco. */
export async function setDupla(db: PGlite, value: { aberto: boolean; planos: string[] }): Promise<void> {
  await db.query(
    `insert into public.app_settings (key, value) values ('treino_dupla', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(value)]
  );
}

/**
 * Estação de TESTE no formato publicado (id começa com "teste-"): nada daqui é conteúdo real nem entra na carga do Supabase.
 * Itens somam 10,00: i1 (2,5 / 1,25 / 0), i2 (2,5 / sem parcial / 0), i3 (5 / 2,5 / 0, com subitens s1 e s2).
 */
export const STATION = {
  id: "teste-dupla-e01",
  name: "Estação de teste do Treino em Dupla",
  topic: "Estação de teste",
  area: "Clínica Médica",
  setting: null,
  taxonomy_path: ["Clínica Médica", "Estação de teste"],
  goal: "Revalida",
  institution: null,
  year: null,
  styles: [],
  is_pro_only: false,
  medical_review: "approved",
  max_score: 10,
  duration_ms: 600000,
  version: "1.0",
  actor_script: "Dados pessoais:\nPaciente de teste, 40 anos.\n\nSó se perguntado:\nNenhuma alergia conhecida.",
  doctor_scene: "Cenário de teste, bloco um.\n\nCenário de teste, bloco dois.",
  doctor_tasks: "1. Fazer a anamnese.\n2. Pedir exames.",
  pressings: [
    { id: "p1", name: "Hemograma", content: "Hb 9,0 g/dL\n\nLiberação: quando o candidato pedir o hemograma.", image_url: null },
    { id: "p2", name: "Imagem de tórax", content: "Radiografia de tórax.", image_url: null },
  ],
  pressing_assets: { p2: { path: "teste/p2.png" } },
  checklist_items: [
    {
      id: "i1", order: 1, phase: "PEP", content: "Item um", tip: "Dica um",
      grades: { correct: 2.5, partial: 1.25, incorrect: 0 },
      criteria: { correct: "Adequado um", partial: "Parcial um", incorrect: "Inadequado um" },
      subitems: [], auto_grade_rule: null,
    },
    {
      id: "i2", order: 2, phase: "PEP", content: "Item dois", tip: "",
      grades: { correct: 2.5, partial: null, incorrect: 0 },
      criteria: { correct: "Adequado dois", incorrect: "Inadequado dois" },
      subitems: [], auto_grade_rule: null,
    },
    {
      id: "i3", order: 3, phase: "PEP", content: "Item três", tip: "Dica três",
      grades: { correct: 5, partial: 2.5, incorrect: 0 },
      criteria: { correct: "Adequado três", partial: "Parcial três", incorrect: "Inadequado três" },
      subitems: [{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }], auto_grade_rule: "all/half/none",
    },
  ],
  summary: [],
} as const;

/** Grava a estação (catálogo + conteúdo completo). `extra` muda só a coluna do catálogo (Pro, revisão médica). */
export async function addStation(
  db: PGlite,
  station: Record<string, any> = STATION,
  extra: { is_pro_only?: boolean; medical_review?: string } = {}
): Promise<void> {
  const s = station;
  const pro = extra.is_pro_only ?? s.is_pro_only ?? false;
  const review = extra.medical_review ?? s.medical_review ?? "approved";
  await db.query(
    `insert into public.checklist_stations (id, name, topic, area, setting, taxonomy_path, goal, institution, year, styles, is_pro_only, medical_review, max_score, duration_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (id) do update set name = excluded.name, topic = excluded.topic, area = excluded.area, is_pro_only = excluded.is_pro_only,
       medical_review = excluded.medical_review, duration_ms = excluded.duration_ms`,
    [s.id, s.name, s.topic, s.area, s.setting ?? null, s.taxonomy_path ?? [], s.goal ?? "Revalida", s.institution ?? null, s.year ?? null, s.styles ?? [], pro, review, s.max_score ?? 10, s.duration_ms ?? 600000]
  );
  await db.query(
    `insert into public.checklist_station_contents (station_id, content) values ($1, $2::jsonb)
     on conflict (station_id) do update set content = excluded.content`,
    [s.id, JSON.stringify({ ...s, is_pro_only: pro, medical_review: review })]
  );
}

/** Perfil de estudo com valores neutros; `p` troca os campos que o teste precisa. */
export async function addProfile(db: PGlite, uid: string, p: Record<string, unknown> = {}): Promise<void> {
  const row: Record<string, unknown> = { public_name: "Pessoa de teste", ...p, user_id: uid };
  const cols = Object.keys(row);
  await db.query(
    `insert into public.study_profiles (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
    cols.map((c) => row[c])
  );
}

/** Sala direto no banco (sem passar pelas regras); devolve o id. */
export async function makeRoom(
  db: PGlite,
  o: { members: [string, string]; phase: Phase; candidate?: string; evaluator?: string; station?: string | null; round?: number; extra?: Record<string, unknown> }
): Promise<string> {
  const row: Record<string, unknown> = {
    member_ids: o.members,
    phase: o.phase,
    candidate_id: o.candidate ?? null,
    evaluator_id: o.evaluator ?? null,
    station_id: o.station === undefined ? STATION.id : o.station,
    round: o.round ?? 1,
    ...(o.extra ?? {}),
  };
  // Uma pessoa, uma sala aberta (014040, garantido no banco): a sala de teste nova fecha as abertas das mesmas pessoas, como a
  // pessoa que sai de uma sala antes de entrar em outra.
  if (o.phase !== "closed") {
    await db.query(`update public.checklist_rooms set phase = 'closed' where phase <> 'closed' and member_ids && $1::uuid[]`, [o.members]);
  }
  const cols = Object.keys(row);
  const r = await db.query<{ id: string }>(
    `insert into public.checklist_rooms (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    cols.map((c) => row[c])
  );
  return r.rows[0].id;
}

/**
 * Avaliação de uma rodada direto no banco (sem passar pelas regras); devolve o id.
 * Nota de teste: `score` = correctness / 10 sobre `max_score` 10. `finishedAt` (ISO) manda na ordem das avaliações;
 * `answers` é o `checklist_answers` no formato publicado: `[{ id, grade: "Correct"|"Partial"|"Incorrect", subitems }]`.
 */
export async function addSession(
  db: PGlite,
  o: {
    room: string; round: number; doctor: string | null; actor: string | null; station: string; correctness: number;
    finishedAt?: string; usedMs?: number; answers?: unknown[]; feedback?: { pos?: string; neg?: string; gen?: string };
  }
): Promise<string> {
  const id = `sess-${Math.random().toString(36).slice(2, 12)}`;
  const fim = o.finishedAt ?? new Date().toISOString();
  await db.query(
    `insert into public.checklist_study_sessions
       (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness,
        used_ms, checklist_answers, feedback_pos, feedback_neg, feedback_gen)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz - interval '10 minutes', $7::timestamptz, $8, 10, $9, $10, $11::jsonb, $12, $13, $14)`,
    [
      id, o.station, o.room, o.round, o.actor, o.doctor, fim, o.correctness / 10, o.correctness, o.usedMs ?? 540000,
      JSON.stringify(o.answers ?? []), o.feedback?.pos ?? "", o.feedback?.neg ?? "", o.feedback?.gen ?? "",
    ]
  );
  return id;
}

/**
 * Sinal da pessoa (hora e situação do perfil de estudo) direto no banco: visto há `agoSeconds` segundos, na situação dada.
 * O perfil tem de existir. "Online" para o baralho = sinal há menos de 2 minutos e situação diferente de "fora".
 */
export async function seen(db: PGlite, uid: string, agoSeconds = 0, status: "livre" | "em_estacao" | "fora" = "livre"): Promise<void> {
  await db.query(
    `update public.study_profiles set last_seen_at = now() - ($2 || ' seconds')::interval, status = $3 where user_id = $1`,
    [uid, String(agoSeconds), status]
  );
}

/**
 * Arquivos de imagem das estações (`public.station_assets`, da Montagem de estações, migração 6000 de outro ramo). Sem a
 * tabela no banco, cria uma de teste só com o que o Treino lê (`id uuid`, `storage_path text`); depois grava as linhas.
 */
export async function stationAssets(db: PGlite, rows: { id: string; storage_path: string }[]): Promise<void> {
  const existe = (await db.query<{ t: string | null }>(`select to_regclass('public.station_assets')::text as t`)).rows[0].t;
  if (!existe) await db.exec(`create table public.station_assets (id uuid primary key, storage_path text not null)`);
  for (const r of rows) {
    await db.query(
      `insert into public.station_assets (id, storage_path) values ($1, $2) on conflict (id) do update set storage_path = excluded.storage_path`,
      [r.id, r.storage_path]
    );
  }
}
