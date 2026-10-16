/**
 * TD01: o tradutor de erros em português simples (src/shared/errors/explicarErro.ts).
 * Antes, qualquer erro técnico virava "Não foi possível concluir. Tente de novo." em todas as abas, sem dizer o motivo.
 * Agora: frase pronta do banco passa inteira; erro técnico (banco, servidor, rede, IA) vira o MOTIVO e o que fazer;
 * nunca sai texto técnico cru nem segredo.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { explainError, isReadableMessage, DEFAULT_ERROR_MESSAGE } from "../shared/errors/explicarErro";
import { messageOf } from "../novo/app/admin/common.jsx";

const ROOT = path.resolve(__dirname, "../..");
const e = (message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), extra);

/** Texto que nunca pode aparecer para o dono ou a equipe. */
const TECNICO = /permission denied|violates|row-level|schema cache|PGRST|SQLSTATE|duplicate key|constraint|null value|syntax|Failed to fetch|fetch failed|TypeError|undefined|\bnull\b|ECONN|ETIMEDOUT|JWT|stack|Bearer|sk-[A-Za-z0-9]|eyJ|api[_ -]?key|Unexpected token|\bat \w+\.\w+ \(/i;

describe("TD01: frases prontas do banco passam inteiras", () => {
  it("as mensagens fixas de raise exception das migrações não são trocadas", () => {
    const dir = path.join(ROOT, "supabase/migrations");
    const found = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".sql") || f.startsWith("._")) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(/raise exception '([^']*)'/g)) {
        const text = m[1].replace(/''/g, "'");
        // "Cole antes a migração …" aparece só no editor do Supabase, para quem cola o SQL (cita nomes de tabela); não vai às telas
        if (!text.includes("%") && /[.!?]$/.test(text) && !/^Cole antes a migra/.test(text)) found.add(text);
      }
    }
    expect(found.size).toBeGreaterThan(200);
    const trocadas = [...found].filter((text) => explainError(e(text)) !== text);
    expect(trocadas).toEqual([]);
  });

  it("frase pronta do servidor em português continua igual", () => {
    for (const text of [
      "Entre na sua conta.",
      "Acesso restrito a administradores.",
      "Informe o tema.",
      "A IA do roteiro não respondeu a tempo. Tente de novo em instantes.",
    ]) {
      expect(explainError(e(text))).toBe(text);
      expect(messageOf(e(text))).toBe(text);
    }
  });
});

describe("TD01: erros técnicos viram o motivo e o que fazer", () => {
  const casos: Array<[string, unknown, RegExp]> = [
    ["falta de permissão no banco", e("permission denied for function app_admin_list_users", { code: "42501" }), /não tem permissão/i],
    ["regra de segurança de linha", e('new row violates row-level security policy for table "questions"'), /não tem permissão/i],
    ["registro repetido", e('duplicate key value violates unique constraint "questions_code_key"', { code: "23505" }), /já existe/i],
    ["item ligado a outros", e('update or delete on table "areas" violates foreign key constraint "q_area_fk"', { code: "23503" }), /ligado a outr/i],
    ["campo obrigatório vazio", e('null value in column "title" of relation "lessons" violates not-null constraint', { code: "23502" }), /preencher|obrigatório/i],
    ["valor fora da regra", e('new row for relation "x" violates check constraint "x_check"', { code: "23514" }), /não é aceito|confira/i],
    ["formato inválido", e('invalid input syntax for type uuid: "abc"', { code: "22P02" }), /formato inválido/i],
    ["texto longo demais", e("value too long for type character varying(200)", { code: "22001" }), /grande demais|longo demais/i],
    ["conflito de gravação", e("deadlock detected", { code: "40P01" }), /ao mesmo tempo/i],
    ["demorou demais no banco", e("canceling statement due to statement timeout", { code: "57014" }), /demorou demais/i],
    ["função do banco ainda não instalada", e("Could not find the function public.app_admin_x(p_a) in the schema cache", { code: "PGRST202" }), /atualização.*(banco|servidor)|ainda não foi/i],
    ["tabela inexistente", e('relation "public.podcasts" does not exist', { code: "42P01" }), /atualização.*(banco|servidor)|ainda não foi/i],
    ["coluna inexistente", e('column "foo" does not exist', { code: "42703" }), /atualização.*(banco|servidor)|ainda não foi/i],
    ["sessão vencida", e("JWT expired", { code: "PGRST301" }), /sessão.*(venceu|expirou)|entre de novo/i],
    ["token inválido", e("invalid JWT: unable to parse or verify signature"), /sessão|entre de novo/i],
    ["item não encontrado (uma linha esperada)", e("JSON object requested, multiple (or no) rows returned", { code: "PGRST116" }), /não encontr/i],
    ["sem internet", new TypeError("Failed to fetch"), /conexão|internet/i],
    ["servidor fora (fetch failed)", e("fetch failed"), /conexão|internet/i],
    ["Safari sem rede", new TypeError("Load failed"), /conexão|internet/i],
    ["rede caiu no servidor", e("connect ECONNREFUSED 127.0.0.1:5432"), /conexão|servidor/i],
    ["tempo esgotado", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), /demorou/i],
    ["resposta não era JSON", new SyntaxError('Unexpected token < in JSON at position 0'), /resposta inesperada/i],
    ["arquivo grande demais", e("request entity too large", { status: 413 }), /grande demais/i],
    ["IA com muitos pedidos", e("429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric"), /muitos pedidos|limite/i],
    ["IA sobrecarregada", e("overloaded_error: Overloaded"), /sobrecarregad|muitos pedidos/i],
    ["chave da IA", e("401 invalid x-api-key"), /chave/i],
    ["chave do Google", e("API key not valid. Please pass a valid API key."), /chave/i],
    ["erro 500 do servidor", e("Erro 500."), /servidor.*(problema|falhou|erro)|tente de novo/i],
    ["erro 404 do servidor", e("Erro 404."), /não encontr/i],
    ["erro 401 do servidor", e("Erro 401."), /entre de novo|sessão/i],
    ["erro 403 do servidor", e("Erro 403."), /não tem permissão/i],
    ["erro 502/503/504", e("Erro 503."), /fora do ar|indispon|instantes/i],
    ["status no objeto", e("Bad Gateway", { status: 502 }), /fora do ar|indispon|instantes/i],
    ["login errado", e("Invalid login credentials"), /e-mail ou senha/i],
    ["e-mail não confirmado", e("Email not confirmed"), /confirm/i],
    ["arquivo não está no depósito", e("Object not found"), /arquivo.*não foi encontrado/i],
    ["pasta do depósito inexistente", e("Bucket not found"), /armazenamento|depósito/i],
    ["objeto sem message (string solta)", "TypeError: x is not a function", /não foi possível/i],
    ["sem mensagem nenhuma", {}, /não foi possível/i],
    ["erro inglês qualquer", e("Request failed with status code 418."), /não foi possível/i],
  ];

  for (const [nome, erro, esperado] of casos) {
    it(nome, () => {
      const texto = explainError(erro);
      expect(texto).toMatch(esperado);
      expect(texto, "não pode vazar texto técnico").not.toMatch(TECNICO);
      expect(texto.length).toBeLessThanOrEqual(240);
      expect(messageOf(erro)).toBe(texto);
    });
  }

  it("a mesma tradução vale quando o erro vem como texto solto", () => {
    expect(explainError("permission denied for table users")).toMatch(/não tem permissão/i);
  });
});

describe("TD01: nunca expõe segredo", () => {
  it("chave, token e cabeçalho dentro do erro não saem", () => {
    for (const msg of [
      "Incorrect API key provided: sk-proj-abcdefghijklmnop1234567890",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc",
      "Falha ao chamar https://x.supabase.co/rest/v1/rpc/app_x?apikey=abc123SECRET456 agora.",
      "Chave sk-ant-api03-ABCDEFGHIJKLMNOP usada sem permissão para este modelo.",
    ]) {
      const texto = explainError(e(msg));
      expect(texto).not.toMatch(/sk-|eyJ|Bearer|apikey|abc123SECRET|supabase\.co/i);
    }
  });

  it("frase em português com texto técnico dentro é trocada, não repassada", () => {
    const texto = explainError(e("A IA do roteiro falhou: TypeError: Cannot read properties of undefined (reading 'text')."));
    expect(texto).not.toMatch(/TypeError|undefined|properties/);
  });
});

describe("TD01: o que é considerado frase pronta", () => {
  it("reconhece frases em português e recusa texto técnico", () => {
    expect(isReadableMessage("Informe o tema.")).toBe(true);
    expect(isReadableMessage("Escolha um tema ou cole o texto")).toBe(true);
    expect(isReadableMessage("permission denied for table x")).toBe(false);
    expect(isReadableMessage("Request failed with status code 500.")).toBe(false);
    expect(isReadableMessage("")).toBe(false);
    expect(isReadableMessage("a".repeat(300))).toBe(false);
  });

  it("sem nada reconhecível, devolve o texto padrão (ou o dado pelo chamador)", () => {
    expect(explainError(null)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(explainError(e("zzz qqq"), "Não foi possível carregar. Tente de novo.")).toBe("Não foi possível carregar. Tente de novo.");
  });
});
