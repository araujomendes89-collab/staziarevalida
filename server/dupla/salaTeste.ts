/**
 * Treino em Dupla: apoio das rotas de teste do BANCO LOCAL (`POST /api/dev-db/dupla/preparar` e `/dupla/sala-teste`).
 * Só existem no servidor de desenvolvimento (createDevDbRouter nunca é montado em produção) e só falam com o banco local.
 *
 *  - prepararContas: deixa contas do banco local prontas para o módulo (plano Pro ativo, aceites vigentes, WhatsApp de teste e
 *    chave do módulo aberta).
 *  - criarSalaTeste: cria (se faltarem) a conta do candidato e a do avaliador, e uma sala entre elas na estação de teste
 *    `teste-inep2020-e01` já na fase pedida, com o que cada fase precisa (papéis, confirmações, prontidão, cronômetro, marcações e
 *    avaliação). Tudo é dado de teste; nada disso existe no Supabase.
 */
import crypto from "crypto";
import { BackendError } from "../../src/novo/data/backend";
import type { DevDatabase } from "../devDb/devDatabase";

export const SENHA_TESTE = "dupla-local-123";
export const ESTACAO_TESTE = "teste-inep2020-e01";
export const CANDIDATO = { email: "candidato@dupla.local", nome: "Candidato de teste" } as const;
export const AVALIADOR = { email: "avaliador@dupla.local", nome: "Avaliador de teste" } as const;
export const FASES = ["roles", "connecting", "setup", "running", "review", "result", "closed"] as const;
export type Fase = (typeof FASES)[number];
export const MOTIVOS = ["saiu", "convite_recusado", "convite_expirado", "sem_sinal"] as const;
export type Motivo = (typeof MOTIVOS)[number];

/** Link de chamada só de teste (a sala exige https); não leva a lugar nenhum. */
const LINK_TESTE = "https://chamada.exemplo.dev/sala-de-teste";

export interface SalaTesteResultado {
  room_id: string;
  url: string;
  candidato: { email: string; senha: string };
  avaliador: { email: string; senha: string };
}

function assertLocal() {
  if (process.env.NODE_ENV === "production") throw new Error("As rotas de teste do Treino em Dupla não existem em produção.");
}

const normalizarEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

async function idDaConta(dev: DevDatabase, email: string): Promise<string | null> {
  const r = await dev.db.query<{ id: string }>(`select id from auth.users where lower(email) = $1`, [email]);
  return r.rows[0]?.id ?? null;
}

/**
 * Prepara as contas (pelo e-mail) para usar o módulo no banco local: plano Pro ativo por 30 dias, aceites vigentes (mesmo SQL de
 * src/__tests__/helpers/aceites.ts), WhatsApp de teste quando vazio (+5511999990001, +5511999990002, … pela ordem da lista) e a
 * chave do módulo aberta para Pro e Elite.
 */
export async function prepararContas(dev: DevDatabase, emails: unknown): Promise<void> {
  assertLocal();
  const lista = Array.isArray(emails) ? emails.map(normalizarEmail).filter(Boolean) : [];
  if (!lista.length) throw new BackendError("unknown", "Informe os e-mails das contas.");
  const ids: string[] = [];
  for (const email of lista) {
    const id = await idDaConta(dev, email);
    if (!id) throw new BackendError("unknown", `Conta não encontrada: ${email}. Crie a conta antes.`);
    ids.push(id);
  }
  await dev.db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.query(
        `insert into public.subscriptions (user_id, plan, status, current_period_end) values ($1, 'pro', 'active', now() + interval '30 days')
         on conflict (user_id) do update set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days'`,
        [id]
      );
      await tx.query(
        `insert into public.legal_acceptances (user_id, document, version, origin, email_hash)
         select $1::uuid, v.document, v.version, case v.document when 'termo_uso' then 'cadastro' else 'tutor' end,
                public.legal_email_hash(coalesce((select u.email from auth.users u where u.id = $1::uuid), ''))
         from public.legal_versions v
         on conflict (user_id, document, version) do nothing`,
        [id]
      );
      await tx.query(`update public.profiles set phone = $2 where id = $1 and phone is null`, [id, `+551199999${String(i + 1).padStart(4, "0")}`]);
    }
    await tx.query(
      `insert into public.app_settings (key, value) values ('treino_dupla', '{"aberto": true, "planos": ["pro", "elite"]}'::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`
    );
  });
}

type Item = { id: string; grades: { correct: number; partial?: number | null; incorrect?: number | null }; subitems?: { id: string }[] };
type Nota = "correct" | "partial" | "incorrect";

/** Nota de cada item, alternando acerto, parcial (só nos itens que têm) e erro. */
function notasDeTeste(itens: Item[]): { item: Item; grade: Nota; subitems: string[] }[] {
  return itens.map((item, i) => {
    const ordem: Nota[] = item.grades.partial == null ? ["correct", "incorrect"] : ["correct", "partial", "incorrect"];
    const grade = ordem[i % ordem.length];
    const subs = (item.subitems ?? []).map((s) => s.id);
    return { item, grade, subitems: grade === "correct" ? subs : grade === "partial" ? subs.slice(0, 1) : [] };
  });
}

const pontos = (item: Item, grade: Nota) => Number(item.grades[grade] ?? 0);
const CAPITAL: Record<Nota, string> = { correct: "Correct", partial: "Partial", incorrect: "Incorrect" };

/** Cria (se faltarem) as duas contas de teste, prepara as duas e cria a sala já na fase pedida. */
export async function criarSalaTeste(dev: DevDatabase, fase: unknown, motivo: unknown = "saiu"): Promise<SalaTesteResultado> {
  assertLocal();
  if (typeof fase !== "string" || !(FASES as readonly string[]).includes(fase)) throw new BackendError("unknown", "Fase inválida.");
  if (typeof motivo !== "string" || !(MOTIVOS as readonly string[]).includes(motivo)) throw new BackendError("unknown", "Motivo inválido.");
  const phase = fase as Fase;

  const estacao = await dev.db.query<{ content: { checklist_items?: Item[]; pressings?: { id: string }[]; version?: string } | null; duration_ms: number; max_score: number }>(
    `select k.content, s.duration_ms, s.max_score from public.checklist_stations s
       left join public.checklist_station_contents k on k.station_id = s.id where s.id = $1`,
    [ESTACAO_TESTE]
  );
  if (!estacao.rows[0]?.content) throw new BackendError("unknown", `A estação de teste ${ESTACAO_TESTE} não está neste banco local.`);
  const { content, duration_ms: duracao, max_score: maxScore } = estacao.rows[0];
  const itens = content!.checklist_items ?? [];
  const impressos = content!.pressings ?? [];
  const liberavel = impressos.find((p: any) => !p.initially_visible);

  const contas: Record<"candidato" | "avaliador", string> = { candidato: "", avaliador: "" };
  for (const [papel, conta] of [["candidato", CANDIDATO], ["avaliador", AVALIADOR]] as const) {
    let id = await idDaConta(dev, conta.email);
    if (!id) id = (await dev.core.createAccount(conta.nome, conta.email, SENHA_TESTE)).id;
    contas[papel] = id;
  }
  await prepararContas(dev, [CANDIDATO.email, AVALIADOR.email]);

  const agora = Date.now();
  const iso = (deltaMs: number) => new Date(agora + deltaMs).toISOString();
  const { candidato, avaliador } = contas;
  const notas = notasDeTeste(itens);
  const viva = phase !== "closed";

  return dev.db.transaction(async (tx) => {
    // sem perfil de estudo o sinal não grava e a sala fecharia em 15 min; o sinal fica fresco
    for (const [id, nome] of [[candidato, CANDIDATO.nome], [avaliador, AVALIADOR.nome]] as const) {
      await tx.query(
        `insert into public.study_profiles (user_id, public_name, status, last_seen_at) values ($1, $2, $3, now())
         on conflict (user_id) do update set status = excluded.status, last_seen_at = now()`,
        [id, nome, viva ? "em_estacao" : "livre"]
      );
    }
    // uma sala aberta por dupla: as de testes anteriores entre estas duas contas fecham
    await tx.query(
      `update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu', call_link = null, rev = rev + 1
        where phase <> 'closed' and member_ids @> array[$1::uuid, $2::uuid]`,
      [candidato, avaliador]
    );

    const dois = [candidato, avaliador];
    const confirmados = phase === "roles" || phase === "closed" ? [] : dois;
    const conectados = ["setup", "running", "review", "result"].includes(phase) ? dois : [];
    const prontos = phase === "setup" ? [avaliador] : ["running", "review", "result"].includes(phase) ? dois : [];
    const comRelogio = ["running", "review", "result"].includes(phase);
    const terminada = phase === "review" || phase === "result";
    const sala: Record<string, unknown> = {
      member_ids: dois,
      phase,
      station_id: ESTACAO_TESTE,
      round: 1,
      candidate_id: candidato,
      evaluator_id: avaliador,
      confirmed_ids: confirmados,
      connected_ids: conectados,
      ready_ids: prontos,
      call_link: ["setup", "running", "review", "result"].includes(phase) ? LINK_TESTE : null,
      duration_ms: duracao,
      started_at: comRelogio ? iso(terminada ? -7 * 60_000 : -2 * 60_000) : null,
      ends_at: comRelogio ? iso(terminada ? duracao - 7 * 60_000 : duracao - 2 * 60_000) : null,
      finished_at: terminada ? iso(-60_000) : null,
      // Impresso inicial (relato) nunca entra na lista de liberados (Etapa P): libera o 1º liberável.
      released_pressings: phase === "running" && liberavel ? [liberavel.id] : [],
      closed_reason: phase === "closed" ? motivo : null,
      updated_by: phase === "closed" && (motivo === "saiu" || motivo === "convite_recusado") ? avaliador : null,
      rev: 1,
    };
    const colunas = Object.keys(sala);
    const criada = await tx.query<{ id: string }>(
      `insert into public.checklist_rooms (${colunas.join(", ")}) values (${colunas.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      colunas.map((c) => sala[c])
    );
    const roomId = criada.rows[0].id;

    // marcações do PEP: poucas durante a estação, todas na conferência e no resultado
    const marcadas = phase === "running" ? notas.slice(0, 3) : terminada ? notas : [];
    for (const m of marcadas) {
      await tx.query(
        `insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade, subitems_checked) values ($1, 1, $2, $3, $4, $5)`,
        [roomId, m.item.id, avaliador, m.grade, m.subitems]
      );
    }

    if (phase === "result") {
      const score = notas.reduce((soma, m) => soma + pontos(m.item, m.grade), 0);
      await tx.query(
        `insert into public.checklist_study_sessions
           (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness, used_ms,
            checklist_answers, feedback_pos, feedback_neg, feedback_gen, station_version)
         values ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)`,
        [
          `sess-${crypto.randomBytes(6).toString("hex")}`, ESTACAO_TESTE, roomId, avaliador, candidato, iso(-7 * 60_000), iso(-60_000),
          score, maxScore, maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0, 6 * 60_000,
          JSON.stringify(notas.map((m) => ({ id: m.item.id, grade: CAPITAL[m.grade], subitems: m.subitems }))),
          "Feedback de teste: pontos positivos.", "Feedback de teste: pontos a melhorar.", "Feedback de teste: comentário geral.",
          content!.version ?? null,
        ]
      );
    }

    return {
      room_id: roomId,
      url: `/novo/dupla/sala/${roomId}`,
      candidato: { email: CANDIDATO.email, senha: SENHA_TESTE },
      avaliador: { email: AVALIADOR.email, senha: SENHA_TESTE },
    };
  });
}
