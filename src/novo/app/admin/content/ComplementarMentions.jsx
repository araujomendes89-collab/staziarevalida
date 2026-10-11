// Aba Fontes › "Textos que citam fontes complementares" (só administrador).
// Regra do dono: a apostila vale como fonte para a IA e para a equipe, mas nada que a identifique chega ao aluno. O banco barra o
// texto NOVO que cita a apostila (ao salvar); esta lista mostra o texto que JÁ estava gravado, achado por app_ch_complementar_mentions
// (tabela, id, campo e um trecho), e diz em que aba editar. "Conferir de novo" roda a varredura outra vez depois de corrigir.
import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { Badge, Banner, Button, EmptyState } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { Section } from "./ui.jsx";

const LIMITE = 600; // a varredura devolve no máximo 600 itens

/** Onde a equipe edita cada tipo de texto: nome da tela e endereço (a aba do painel). null = não há tela de edição. */
export function whereToEdit(item) {
  switch (item.aba) {
    case "questoes":
      return { label: "Questões", search: "?aba=questoes" };
    case "aulas":
      return { label: "Aulas", search: "?aba=aulas" };
    case "atualizacoes":
      return { label: "Atualizações", search: "?aba=atualizacoes" };
    case "podcasts":
      return { label: "Podcasts", search: item.item ? `?aba=podcasts&ep=${encodeURIComponent(item.item)}` : "?aba=podcasts" };
    case "central":
      return { label: "Central de Conteúdo › Análises das questões", search: "?aba=conteudo&secao=analises" };
    case "estacoes":
      return { label: "Estações", search: "?aba=estacoes" };
    case "configuracoes":
      return { label: "Configurações › Aviso geral", search: "?aba=config" };
    default:
      return null;
  }
}

function EditLink({ target }) {
  const inRouter = useInRouterContext();
  const text = `Abrir em ${target.label}`;
  return inRouter ? (
    <Link to={{ search: target.search }} style={{ font: "var(--type-body-sm)", color: "var(--text-brand)" }}>
      {text}
    </Link>
  ) : (
    <a href={target.search} style={{ font: "var(--type-body-sm)", color: "var(--text-brand)" }}>
      {text}
    </a>
  );
}

function Row({ item }) {
  const target = whereToEdit(item);
  return (
    <li style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 0", listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{item.onde}</strong>
        <Badge size="sm">{item.campo}</Badge>
        {item.publicado === false && <Badge size="sm" tone="warning">Rascunho</Badge>}
      </div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>“…{item.trecho}…”</div>
      <div>
        {target ? (
          <EditLink target={target} />
        ) : (
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Conversa de aluno com o Tutor: não há tela de edição; o Tutor deixa de citar a apostila nas respostas novas.</span>
        )}
      </div>
    </li>
  );
}

export function ComplementarMentions({ isAdmin }) {
  const { backend } = useSession();
  const { data, error, loading, reload } = useLoad(() => Promise.resolve().then(() => backend.rpc("app_ch_complementar_mentions")), [backend]);
  if (!isAdmin) return null;
  const items = Array.isArray(data) ? data : [];
  return (
    <Section
      title="Textos que citam fontes complementares"
      action={
        <Button size="sm" variant="secondary" icon="refresh-cw" loading={loading} onClick={reload}>
          Conferir de novo
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          O aluno não pode ver a apostila nem o nome do material. O sistema já barra texto novo que cita uma fonte complementar. Aqui estão os textos que já estavam
          gravados antes da regra: abra cada um, reescreva sem citar a apostila e depois toque em “Conferir de novo”. Pode aparecer texto legítimo que só usa a palavra “apostila”: nesse caso, basta reescrever.
        </div>
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data && items.length === 0 && <EmptyState icon="circle-check" title="Nenhum texto cita fonte complementar" description="Nada do que está gravado cita a apostila nem o nome do material." />}
        {items.length >= LIMITE && <Banner tone="warning">A lista mostra os primeiros {LIMITE} textos. Corrija estes e toque em “Conferir de novo” para ver os próximos.</Banner>}
        {items.length > 0 && (
          <ul style={{ margin: 0, padding: 0 }} aria-label="Textos que citam fontes complementares">
            {items.map((item) => (
              <Row key={`${item.tabela}:${item.id}:${item.campo}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
