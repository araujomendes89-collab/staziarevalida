import React, { useState, useEffect, useContext, createContext, useMemo } from "react";
import { AREAS, calcularPorContagem, EXEMPLO_ESPECIFICACAO } from "../../src/novo/app/nivelamento/calculo.js";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);

  // We are creating a simple simulated backend
  const backend = useMemo(() => {
    let situacao = "novo";
    let respostasBloco1 = {};
    let respostasBloco2 = {};
    let sessao = null;
    let resultado = null;

    // To handle URL parameters easily for testing
    const params = new URLSearchParams(window.location.search);
    const estadoInicial = params.get("estado");
    const isConvite = params.get("tela") === "convite";

    if (estadoInicial === "parcial" || estadoInicial === "concluido") {
      situacao = estadoInicial;
      // conta de verdade (calculo.js): parcial = 15 questões (3 por área); concluído = exemplo da especificação (18 de 30)
      resultado = calcularPorContagem(
        estadoInicial === "parcial"
          ? [
              { area: "CLINICA_MEDICA", acertos: 3, total: 3 },
              { area: "CIRURGIA_GERAL", acertos: 1, total: 3 },
              { area: "PEDIATRIA", acertos: 2, total: 3 },
              { area: "GINECOLOGIA_OBSTETRICIA", acertos: 1, total: 3 },
              { area: "MEDICINA_FAMILIA_COMUNIDADE", acertos: 2, total: 3 },
            ]
          : EXEMPLO_ESPECIFICACAO
      );
    }

    let questoesBase = [];
    try {
      // dados.json vem em blocos de 6 por área, na ordem de AREAS (como o banco devolve: a questão traz a área)
      fetch("/dados.json").then(r => r.json()).then(d => { questoesBase = d.map((q, i) => ({ ...q, area: q.area ?? AREAS[Math.floor(i / 6)]?.id })); });
    } catch(e) {}

    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    const artificialDelay = 300;

    return {
      async rpc(fn, args) {
        await delay(artificialDelay);
        
        if (fn === "app_bootstrap") {
          return {
            profile: { name: "Aluno Teste" },
            nivelamento: {
              aplicavel: true,
              primeira_tela: !isConvite,
              convite: isConvite,
              situacao,
              adiado: situacao === "adiado",
              bloco: situacao === "bloco1" ? 1 : situacao === "bloco2" ? 2 : null,
              respondidas: situacao === "bloco1" ? Object.keys(respostasBloco1).length : situacao === "bloco2" ? Object.keys(respostasBloco2).length : 0,
              total_bloco: 15,
              questoes_feitas: situacao === "parcial" ? 15 : situacao === "concluido" ? 30 : 0,
              resultado
            }
          };
        }
        
        if (fn === "app_nivelamento_estado") {
          return {
            aplicavel: true,
            primeira_tela: !isConvite,
            convite: isConvite,
            situacao,
            adiado: situacao === "adiado",
            bloco: situacao === "bloco1" ? 1 : situacao === "bloco2" ? 2 : null,
            respondidas: situacao === "bloco1" ? Object.keys(respostasBloco1).length : situacao === "bloco2" ? Object.keys(respostasBloco2).length : 0,
            total_bloco: 15,
            questoes_feitas: situacao === "parcial" ? 15 : situacao === "concluido" ? 30 : 0,
            resultado
          };
        }
        
        if (fn === "app_nivelamento_adiar") {
          situacao = "adiado";
          return {};
        }
        
        if (fn === "app_nivelamento_iniciar") {
          situacao = "bloco1";
          const itens = questoesBase.slice(0, 15).map((q, i) => ({
            ordem: i + 1,
            posicao: i + 1,
            resposta: respostasBloco1[i + 1] || null,
            questao: q
          }));
          sessao = { situacao: "bloco1", bloco: 1, total: 15, respondidas: Object.keys(respostasBloco1).length, itens };
          return sessao;
        }

        if (fn === "app_nivelamento_continuar") {
          situacao = "bloco2";
          const itens = questoesBase.slice(15, 30).map((q, i) => ({
            ordem: i + 16,
            posicao: i + 1,
            resposta: respostasBloco2[i + 16] || null,
            questao: q
          }));
          sessao = { situacao: "bloco2", bloco: 2, total: 15, respondidas: Object.keys(respostasBloco2).length, itens };
          return sessao;
        }
        
        if (fn === "app_nivelamento_responder") {
          if (situacao === "bloco1") {
            respostasBloco1[args.p_ordem] = args.p_resposta;
          } else if (situacao === "bloco2") {
            respostasBloco2[args.p_ordem] = args.p_resposta;
          }
          return {};
        }
        
        if (fn === "app_nivelamento_finalizar") {
          if (situacao === "bloco1") {
            situacao = "parcial";
          } else if (situacao === "bloco2") {
            situacao = "concluido";
          }
          
          const resps = [...Object.entries(respostasBloco1), ...Object.entries(respostasBloco2)].map(([ordem, resp]) => {
            const index = Number(ordem) - 1;
            const q = questoesBase[index];
            return { area: q.area, correta: q.gabarito === resp };
          });
          
          const modulo = await import("../../src/novo/app/nivelamento/calculo.js");
          resultado = modulo.calcularNivelamento(resps);

          return {
            aplicavel: true,
            primeira_tela: !isConvite,
            convite: isConvite,
            situacao,
            adiado: false,
            bloco: null,
            respondidas: 0,
            total_bloco: 15,
            questoes_feitas: situacao === "parcial" ? 15 : 30,
            resultado
          };
        }

        if (fn === "app_nivelamento_correcao") {
          let inicio = 0; let fim = 15; let bk = 1; let resp = respostasBloco1;
          if (situacao === "concluido") {
             fim = 30;
          }
          // prévia aberta direto no resultado (?estado=...): respostas de mentira coerentes com a conta (acertos por área do resultado)
          const simulada = estadoInicial && !Object.keys(respostasBloco1).length;
          const base = simulada && fim === 15 ? AREAS.flatMap((_, k) => questoesBase.slice(k * 6, k * 6 + 3)) : questoesBase.slice(0, fim);
          const vistos = {};
          const itens = base.map((q, i) => {
            const ordem = i + 1;
            const b = ordem <= 15 ? 1 : 2;
            let resposta = b === 1 ? respostasBloco1[ordem] : respostasBloco2[ordem];
            if (simulada && resultado) {
              const j = (vistos[q.area] = (vistos[q.area] ?? -1) + 1);
              const acertos = resultado.perfil.find((p) => p.area === q.area)?.acertos ?? 0;
              resposta = j < acertos ? q.gabarito : ["A", "B", "C", "D"].find((l) => l !== q.gabarito);
            }
            return {
              ordem,
              bloco: b,
              posicao: b === 1 ? ordem : ordem - 15,
              resposta,
              correta: resposta === q.gabarito,
              gabarito: q.gabarito,
              comentario: q.comentario,
              questao: q
            };
          });
          return { itens };
        }

        if (fn === "app_report_problem") {
          return {};
        }

        throw new Error(`rpc não simulada: ${fn}`);
      }
    };
  }, []);

  useEffect(() => {
    backend.rpc("app_bootstrap").then(b => {
      setBoot(b);
      setLoading(false);
    });
  }, [backend]);

  const refresh = async () => {
    const b = await backend.rpc("app_bootstrap");
    setBoot(b);
    if (!b.nivelamento.primeira_tela || b.nivelamento.adiado) {
       alert("Prévia: aqui o aluno entra no app");
    }
  };

  const value = useMemo(() => ({ backend, boot, refresh, user: { id: "teste" } }), [backend, boot]);

  if (loading) return null;

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession precisa estar dentro de <SessionProvider>.");
  return ctx;
}

export function useOptionalSession() {
  return useContext(SessionContext);
}
