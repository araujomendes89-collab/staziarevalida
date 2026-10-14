// Vigilância científica (proposta do dono de 2026-10-12, seção 2): textos, rótulos e peças comuns do painel.
// O banco é do ramo vigilancia-cientifica (funções app_admin_vigilance_*, app_admin_source_quality e _override).
// Tudo que aparece na tela está em português simples; código interno do banco nunca aparece.
import React from "react";
import { Banner, Button } from "../../../../ds";
import { isMissingFunction } from "../AiRequests.jsx";
import { when } from "../ui.jsx";

/** Banco sem a função nova (SQL ainda não aplicado): aviso amigável, sem texto técnico. */
export const FALTA_BANCO = "Falta aplicar a atualização do banco desta função. Avise quem cuida do sistema; o resto da Central de Conteúdo funciona normalmente.";

/** A regra que o dono pediu, sempre à vista no painel. */
export const REGRA_DO_DONO = "Mudanças clínicas (justificativa, conduta, gabarito) nunca são publicadas automaticamente; gabarito oficial do Inep só muda por retificação oficial.";

export const ANALISE_DESLIGADA = "A função “Análise do que mudou” está desligada na Central de IAs. Para pedir a análise, ligue a função lá.";

/** Nota obrigatória (bloquear, sobrepor a quarentena): mínimo de caracteres, como nas outras decisões da Central. */
export const NOTA_MINIMA = 10;

export const FILTROS = [
  { value: "pendentes", label: "Pendentes" },
  { value: "mudancas", label: "Mudanças" },
  { value: "novas_versoes", label: "Novas versões" },
  { value: "retratadas", label: "Retratadas" },
  { value: "quarentena", label: "Quarentena" },
  { value: "fora_do_ar", label: "Fora do ar" },
  { value: "todas", label: "Todas" },
];

/** O que a vigilância encontrou: [rótulo, tom, ícone]. */
export const TIPO = {
  mudanca: ["Mudança no documento", "warning", "file-diff"],
  nova_versao: ["Nova versão", "info", "file-clock"],
  retratada: ["Retratada", "danger", "ban"],
  quarentena: ["Quarentena", "warning", "shield-alert"],
  fora_do_ar: ["Link fora do ar", "danger", "link-2-off"],
  fonte_nova: ["Fonte nova", "brand", "file-plus"],
};

/** Situação do item na fila. */
export const SITUACAO = {
  pendente: ["Pendente", "warning"],
  vista: ["Vista", "info"],
  bloqueada: ["Bloqueada", "danger"],
  resolvida: ["Resolvida", "success"],
};

/**
 * Situação da fonte. Vale para os dois jeitos que o banco pode mandar: o do catálogo conferido (verificado, revogado…) e o da
 * biblioteca da Central (current, superseded, withdrawn). Valor desconhecido não aparece (nada de palavra crua na tela).
 */
export const STATUS_FONTE = {
  verificado: ["Conferida", "success"],
  versao_a_confirmar: ["Versão a confirmar", "warning"],
  nao_encontrado: ["Não encontrada", "danger"],
  revogado: ["Substituída ou revogada", "warning"],
  current: ["Vigente", "success"],
  superseded: ["Substituída", "warning"],
  withdrawn: ["Retirada", "danger"],
};

/** Nível do catálogo conferido (1 a 4, texto do dono) e nível de autoridade da biblioteca (A a E). */
const NIVEL_NUMERO = {
  1: ["referência oficial estruturante", "Referência oficial estruturante (Matriz do Inep, DCNs, editais)"],
  2: ["citada pelo Inep", "Referência expressamente citada pelo Inep (padrão oficial de resposta, PEP, documento de correção)"],
  3: ["diretriz nacional", "Diretriz nacional vigente (Ministério da Saúde, Conitec, órgão regulador)"],
  4: ["científica complementar", "Referência científica complementar (sociedades médicas, internacionais)"],
};
const NIVEL_LETRA = {
  A: "Oficial (Ministério da Saúde, Inep, Conitec, Anvisa, legislação)",
  B: "Sociedade médica reconhecida",
  C: "Organização internacional (OMS, OPAS, CDC, NICE…)",
  D: "Revisão sistemática, metanálise, periódico de alto nível",
  E: "Livro, apostila ou curso (fonte complementar)",
};

/** Rótulo curto do nível (no selo) e o texto completo (ao passar o mouse). Sem nível reconhecido: null. */
export function nivelDaFonte(nivel) {
  if (nivel == null || nivel === "") return null;
  const numero = Number(nivel);
  if (Number.isInteger(numero) && NIVEL_NUMERO[numero]) return { curto: `nível ${numero} · ${NIVEL_NUMERO[numero][0]}`, longo: NIVEL_NUMERO[numero][1] };
  const letra = String(nivel).trim().toUpperCase();
  if (NIVEL_LETRA[letra]) return { curto: `nível ${letra}`, longo: NIVEL_LETRA[letra] };
  return null;
}

/** As cinco dimensões da confiabilidade, na ordem da proposta do dono. */
export const DIMENSOES = [
  ["autenticidade", "Autenticidade"],
  ["situacao_normativa", "Situação normativa"],
  ["metodologia", "Qualidade metodológica"],
  ["correspondencia_clinica", "Correspondência clínica"],
  ["rastreabilidade", "Rastreabilidade"],
];

/** Pesos da proposta do dono (proposta inicial, não validada). Valem só se o banco não mandar os dele. */
export const PESOS_PROPOSTA = { autenticidade: 25, situacao_normativa: 25, metodologia: 20, correspondencia_clinica: 20, rastreabilidade: 10 };

export const legenda = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
export const texto = { font: "var(--type-body-sm)", color: "var(--text-secondary)" };

export const escolher = (mapa, valor) => mapa[valor] ?? null;
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : v == null ? "—" : String(v));
export const quando = (iso, vazio = "—") => (iso ? when(iso) : vazio);

/** Data que vem do banco: "AAAA-MM-DD" vira dd/mm/aaaa sem passar pelo fuso; data com hora usa o horário local; texto solto (ex.: "2022") fica como veio. */
export function dia(valor) {
  if (valor == null || valor === "") return null;
  const s = String(valor).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) return when(s);
  return s;
}

/** Só endereço http(s) vira link (o que vem do banco nunca vira "javascript:"). */
export const linkSeguro = (url) => (typeof url === "string" && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : null);

/** DOI no formato 10.xxxx/… vira link pelo resolvedor oficial (doi.org). */
export const linkDoi = (doi) => (typeof doi === "string" && /^10\.\d{4,9}\/\S+$/.test(doi.trim()) ? `https://doi.org/${encodeURI(doi.trim())}` : null);

/** Chama o banco; se a função ainda não existir lá, o erro vira o aviso amigável. */
export async function chamar(backend, fn, args) {
  try {
    return await backend.rpc(fn, args);
  } catch (error) {
    if (isMissingFunction(error)) throw new Error(FALTA_BANCO);
    throw error;
  }
}

/** Roda pela `useAction` e diz se deu certo (a resposta do banco pode vir vazia). */
export async function tentar(acao, fn) {
  let ok = false;
  let resultado;
  await acao.run(async () => {
    resultado = await fn();
    ok = true;
    return resultado;
  }, null);
  return { ok, resultado };
}

export function AvisoFaltaBanco({ titulo }) {
  return (
    <Banner tone="warning" icon="triangle-alert" title={titulo}>
      {FALTA_BANCO}
    </Banner>
  );
}

/** Caixa de confirmação: nada é mandado ao banco antes do "Sim". */
export function Confirmacao({ titulo, rotulo, icone, ocupado, bloqueado, aoConfirmar, aoCancelar, children }) {
  return (
    <div
      role="group"
      aria-label={titulo}
      style={{ border: "1px solid var(--warning-border)", background: "var(--warning-bg)", borderRadius: "var(--radius-md)", padding: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}
    >
      <strong style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>{titulo}</strong>
      {children}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" icon={icone} loading={ocupado} disabled={bloqueado} onClick={aoConfirmar}>
          {rotulo}
        </Button>
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
