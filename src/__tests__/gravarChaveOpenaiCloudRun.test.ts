// @vitest-environment node
/**
 * CC32 (2026-10-10): o processamento da Central (tarefa stazia-pdf-worker no Cloud Run) não tinha a chave da OpenAI. O script
 * scripts/cloudrun/gravar-chave-openai.sh (o dono roda no Terminal, direto da pasta do projeto)
 * lê OPENAI_API_KEY do .env SEM mostrar o valor, grava no Secret Manager (stazia-openai-api-key) e liga o segredo à tarefa com
 * --update-secrets (as outras chaves da tarefa ficam como estão).
 *
 * Aqui o script roda numa pasta temporária, com um .env de mentira e um "gcloud" falso que só anota o que foi pedido: nada
 * vai ao Google e o .env de verdade nunca é lido. A chave abaixo é inventada. As comparações com a chave são feitas por
 * verdadeiro/falso, para que nenhum valor apareça na saída do teste.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(__dirname, "../../scripts/cloudrun/gravar-chave-openai.sh");
const KEY = `sk-proj-${"Ab12Cd34_Ef-56Gh".repeat(9)}`;
const roots: string[] = [];
afterAll(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

const FAKE_GCLOUD = `#!/bin/bash
# gcloud falso: anota cada chamada (sem a entrada padrão) e guarda o segredo numa pasta temporária
echo "$*" >> "$FAKE_DIR/chamadas.log"
ARGS=" $* "
case "$ARGS" in
  *" auth list "*) [ -f "$FAKE_DIR/sem-login" ] || echo "dono@exemplo.invalid" ;;
  *" secrets describe "*) [ -f "$FAKE_DIR/segredo-existe" ] || exit 1 ;;
  *" secrets create "*) touch "$FAKE_DIR/segredo-existe" ;;
  *" secrets versions access "*) [ -f "$FAKE_DIR/segredo" ] && cat "$FAKE_DIR/segredo" || exit 1 ;;
  *" secrets versions add "*) cat > "$FAKE_DIR/segredo"; echo x >> "$FAKE_DIR/versoes" ;;
  *" secrets add-iam-policy-binding "*) ;;
  *" run jobs describe "*)
    [ -f "$FAKE_DIR/sem-tarefa" ] && exit 1
    if [ -f "$FAKE_DIR/tarefa-atualizada" ]; then
      echo '{"spec":{"template":{"spec":{"template":{"spec":{"containers":[{"env":[{"name":"NODE_ENV","value":"production"},{"name":"ANTHROPIC_API_KEY","valueFrom":{"secretKeyRef":{"key":"latest","name":"stazia-anthropic-api-key"}}},{"name":"OPENAI_API_KEY","valueFrom":{"secretKeyRef":{"key":"latest","name":"stazia-openai-api-key"}}}]}]}}}}}}'
    else
      echo '{"spec":{"template":{"spec":{"template":{"spec":{"containers":[{"env":[{"name":"NODE_ENV","value":"production"}]}]}}}}}}'
    fi ;;
  *" run jobs update "*) touch "$FAKE_DIR/tarefa-atualizada" ;;
  *) echo "gcloud falso: chamada inesperada: $*" >&2; exit 9 ;;
esac
`;

function setup(env: string, flags: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chave-openai-"));
  roots.push(root);
  const app = path.join(root, "app");
  const bin = path.join(root, "bin");
  const fake = path.join(root, "fake");
  for (const d of [app, bin, fake]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(app, ".env"), env);
  fs.writeFileSync(path.join(bin, "gcloud"), FAKE_GCLOUD, { mode: 0o755 });
  for (const f of flags) fs.writeFileSync(path.join(fake, f), "");
  // semPergunta: o teste automático pula a confirmação (STAZIA_SEM_PERGUNTA=1); com `input`, a pergunta é feita e respondida
  const run = (opts: { input?: string } = {}) => {
    const r = spawnSync("/bin/bash", [SCRIPT], {
      encoding: "utf8",
      input: opts.input ?? "",
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: root, STAZIA_DIR: app, FAKE_DIR: fake, ...(opts.input === undefined ? { STAZIA_SEM_PERGUNTA: "1" } : {}) },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const read = (f: string) => (fs.existsSync(path.join(fake, f)) ? fs.readFileSync(path.join(fake, f), "utf8") : "");
  return { run, calls: () => read("chamadas.log"), secretIsKey: () => read("segredo") === KEY, versions: () => read("versoes").split("\n").filter(Boolean).length };
}

const ENV_OK = `SUPABASE_URL=https://exemplo.invalid\nOPENAI_API_KEY="${KEY}"\nOUTRA=1\n`;

describe("CC32: script que grava a chave da OpenAI no processamento (Cloud Run)", () => {
  it("o script existe, usa o projeto, a região, a tarefa e o segredo certos e lê o .env da StaziaMed", () => {
    const text = fs.readFileSync(SCRIPT, "utf8");
    expect(text).toMatch(/^#!\/bin\/bash\n/);
    for (const s of ["staziamed-revalida-prod", "southamerica-east1", "stazia-pdf-worker", "stazia-openai-api-key", "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida", "/Volumes/Samsung/STAZIAMED REVALIDA/StaziaMed Revalida"]) expect(text).toContain(s);
    // nunca liga o modo que mostra os comandos (e a chave) na tela
    expect(text).not.toMatch(/set\s+-[a-z]*x/);
  });

  it("grava a chave no segredo e liga o segredo à tarefa, sem mostrar a chave e sem trocar as outras chaves", () => {
    const t = setup(ENV_OK);
    const r = t.run();
    expect(r.status, r.out).toBe(0);
    expect(r.out.includes(KEY)).toBe(false);
    expect(r.out.includes(KEY.slice(8, 30))).toBe(false);
    expect(r.out).toContain(`${KEY.length} caracteres`);
    expect(t.secretIsKey()).toBe(true);
    const calls = t.calls();
    // a chave nunca vai na linha de comando (entra pela entrada padrão)
    expect(calls.includes(KEY)).toBe(false);
    expect(calls).toMatch(/--project=staziamed-revalida-prod .*secrets create stazia-openai-api-key --replication-policy=automatic/);
    expect(calls).toMatch(/secrets versions add stazia-openai-api-key --data-file=-/);
    expect(calls).toMatch(/secrets add-iam-policy-binding stazia-openai-api-key --member=serviceAccount:stazia-pdf-worker@staziamed-revalida-prod\.iam\.gserviceaccount\.com --role=roles\/secretmanager\.secretAccessor/);
    expect(calls).toMatch(/--project=staziamed-revalida-prod .*run jobs update stazia-pdf-worker --region=southamerica-east1 --update-secrets=OPENAI_API_KEY=stazia-openai-api-key:latest/);
    expect(calls).not.toMatch(/--set-secrets|--clear-secrets|--remove-secrets/);
    expect(r.out).toMatch(/OPENAI_API_KEY vem do segredo stazia-openai-api-key:latest/);
    expect(r.out).toMatch(/Pronto/);
  });

  it("rodar de novo com a mesma chave não cria outra versão do segredo", () => {
    const t = setup(ENV_OK);
    expect(t.run().status).toBe(0);
    const r = t.run();
    expect(r.status, r.out).toBe(0);
    expect(t.versions()).toBe(1);
    expect(r.out).toMatch(/sem mudança/);
  });

  const recusas: [string, string, RegExp][] = [
    ["sem a linha", "SUPABASE_URL=x\n", /Não achei a linha OPENAI_API_KEY no \.env/],
    ["vazia", 'OPENAI_API_KEY=""\n', /não parece uma chave da OpenAI/],
    ["texto de exemplo", "OPENAI_API_KEY=sk-...\n", /não parece uma chave da OpenAI/],
    ["exemplo comprido", `OPENAI_API_KEY=sk-your-key-here-${"x".repeat(40)}\n`, /não parece uma chave da OpenAI/],
    ["curta", "OPENAI_API_KEY=sk-abc123\n", /não parece uma chave da OpenAI/],
    ["sem o começo sk-", `OPENAI_API_KEY=${"A".repeat(60)}\n`, /não parece uma chave da OpenAI/],
    ["com espaço no meio", `OPENAI_API_KEY="${KEY.slice(0, 40)} ${KEY.slice(40)}"\n`, /não parece uma chave da OpenAI/],
    ["colada duas vezes", `OPENAI_API_KEY=${KEY}${KEY}\n`, /colada duas vezes/],
    ["duas linhas", `OPENAI_API_KEY=${KEY}\nOPENAI_API_KEY=${KEY}\n`, /mais de uma linha OPENAI_API_KEY/],
  ];
  for (const [name, env, why] of recusas) {
    it(`chave ${name}: para sem mudar nada no Google`, () => {
      const t = setup(env);
      const r = t.run();
      expect(r.status).toBe(1);
      expect(r.out).toMatch(why);
      expect(r.out).toMatch(/Nada foi mudado/);
      expect(r.out.includes(KEY)).toBe(false);
      expect(t.calls()).not.toMatch(/secrets (create|versions add)|run jobs update/);
    });
  }

  it("gcloud sem login: para antes de ler a chave", () => {
    const t = setup(ENV_OK, ["sem-login"]);
    const r = t.run();
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/gcloud auth login/);
    expect(t.calls()).not.toMatch(/secrets|run jobs/);
  });

  it("tarefa não encontrada: para ANTES de criar o segredo ou gravar a chave, e diz que nada foi mudado", () => {
    const t = setup(ENV_OK, ["sem-tarefa"]);
    const r = t.run();
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Não achei a tarefa stazia-pdf-worker.*Nada foi mudado/);
    expect(t.calls()).not.toMatch(/secrets (create|versions add|add-iam-policy-binding)|run jobs update/);
    expect(t.secretIsKey()).toBe(false);
  });

  describe("confirmação antes de gravar", () => {
    it("sem STAZIA_SEM_PERGUNTA, mostra o resumo (sem a chave) e só grava com a resposta sim", () => {
      const t = setup(ENV_OK);
      const r = t.run({ input: "sim\n" });
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(/projeto: staziamed-revalida-prod/);
      expect(r.out).toMatch(/tarefa:\s+stazia-pdf-worker/);
      expect(r.out).toMatch(/segredo: stazia-openai-api-key/);
      expect(r.out).toContain(`${KEY.length} caracteres (não é mostrada)`);
      expect(r.out).toMatch(/Digite sim/);
      expect(r.out.includes(KEY)).toBe(false);
      expect(t.secretIsKey()).toBe(true);
    });
    for (const [name, input] of [["resposta não", "não\n"], ["Enter vazio", "\n"], ["sem resposta", ""], ["S maiúsculo", "Sim\n"]] as const) {
      it(`${name}: cancela sem mudar nada`, () => {
        const t = setup(ENV_OK);
        const r = t.run({ input });
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/Cancelado\. Nada foi mudado/);
        expect(t.calls()).not.toMatch(/secrets (create|versions add|add-iam-policy-binding)|run jobs update/);
        expect(t.secretIsKey()).toBe(false);
      });
    }
  });
});
