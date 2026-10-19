/**
 * Treino em Dupla: cria uma sala de teste entre duas contas do BANCO LOCAL, ou prepara contas locais para o módulo.
 * Só fala com o servidor de desenvolvimento desta máquina (127.0.0.1); nunca com o Supabase.
 *
 *   npm run dupla:sala-teste -- --fase setup                    cria a sala já na fase (padrão: roles) e imprime o link e as contas
 *   npm run dupla:sala-teste -- --fase closed --motivo sem_sinal  fase "closed" com o motivo (saiu, convite_recusado, convite_expirado, sem_sinal)
 *   npm run dupla:sala-teste -- --preparar a@x.com b@x.com      deixa as contas prontas (ELITE ativo, aceites, WhatsApp de teste, chave aberta)
 *   --porta 3001                                                porta do servidor local (padrão 3000)
 *
 * Fases: roles, connecting, setup, running, review, result, closed.
 * O servidor local seguro (sem as chaves de produção) precisa estar de pé; veja "Servidor local seguro" no plano.
 */
import { fileURLToPath } from "url";

export interface Opcoes {
  fase: string;
  faseInformada: boolean;
  motivo: string | null;
  preparar: string[] | null;
  porta: number;
}

export function lerArgumentos(argv: string[]): Opcoes {
  const o: Opcoes = { fase: "roles", faseInformada: false, motivo: null, preparar: null, porta: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fase") {
      o.fase = argv[++i] ?? "";
      o.faseInformada = true;
    } else if (a === "--motivo") {
      o.motivo = argv[++i] ?? "";
    } else if (a === "--porta") {
      const porta = Number(argv[++i]);
      if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error("Porta inválida.");
      o.porta = porta;
    } else if (a === "--preparar") {
      o.preparar = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) o.preparar.push(argv[++i]);
      if (!o.preparar.length) throw new Error("Informe os e-mails depois de --preparar.");
    } else {
      throw new Error(`Opção desconhecida: ${a}`);
    }
  }
  return o;
}

type Chamada = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** Executa o pedido e devolve as linhas a imprimir. `chamar` é o fetch (trocável nos testes). */
export async function executar(argv: string[], chamar: Chamada = fetch as unknown as Chamada): Promise<string[]> {
  const o = lerArgumentos(argv);
  const base = `http://127.0.0.1:${o.porta}`;
  const post = async (caminho: string, corpo: unknown) => {
    let r;
    try {
      r = await chamar(`${base}/api/dev-db${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    } catch {
      throw new Error(`Não encontrei o servidor local na porta ${o.porta}. Suba o servidor seguro (banco de desenvolvimento) e tente de novo.`);
    }
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.error?.message ?? `Erro ${r.status}`);
    return json;
  };

  const linhas: string[] = [];
  if (o.preparar) {
    await post("/dupla/preparar", { emails: o.preparar });
    linhas.push(`Contas preparadas (ELITE ativo, aceites, WhatsApp de teste, módulo aberto): ${o.preparar.join(", ")}`);
    if (!o.faseInformada) return linhas;
  }
  const sala = await post("/dupla/sala-teste", { fase: o.fase, ...(o.motivo ? { motivo: o.motivo } : {}) });
  linhas.push(
    `Sala de teste na fase "${o.fase}":`,
    `  ${base}${sala.url}`,
    "Entre com uma conta em cada janela (uma delas anônima):",
    `  candidato: ${sala.candidato.email}  senha: ${sala.candidato.senha}`,
    `  avaliador: ${sala.avaliador.email}  senha: ${sala.avaliador.senha}`,
    "A sala fecha sozinha se ficar 15 minutos parada: rode o comando de novo para uma sala nova."
  );
  return linhas;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  executar(process.argv.slice(2)).then(
    (linhas) => linhas.forEach((l) => console.log(l)),
    (erro) => {
      console.error(erro instanceof Error ? erro.message : String(erro));
      process.exitCode = 1;
    }
  );
}
