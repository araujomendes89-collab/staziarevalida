// "Publicar para os alunos": a prévia do que a publicação vai fazer (aula, pontos-chave, flashcards, travas) e o botão que confirma.
// A prévia não grava nada. Só o administrador chega aqui (o banco confere de novo). Publicação ligada e modo sombra desligado
// são decisões da Configuração; sem isso o botão fica desligado e o motivo aparece.
import React from "react";
import { Badge, Banner, Button, Checkbox } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { Label, Pre, Section, useAction } from "./ui.jsx";

/** publishFn: a tela de Unidades publica por app_ch_unit_publish (exige aprovação médica e editorial; o portão de atualidade segue o modo geral da Vigilância: desligado não exige, "só avisar" avisa, "bloquear" trava). */
export function PublishPanel({ version, onPublished, onClose, publishFn = "app_ch_publish" }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_publish_preview", { p_version_id: version.id, p_options: {} }), [backend, version.id]);
  const [similarOk, setSimilarOk] = React.useState(false);
  const [showAsStudent, setShowAsStudent] = React.useState(false);
  const act = useAction();

  if (error) {
    const faltaSql = /does not exist|could not find|PGRST202|42883/i.test(String(error?.message ?? error));
    return faltaSql ? (
      <Banner tone="warning" title="A publicação nova ainda não está no banco">
        Cole no Supabase os arquivos SQL novos da Central (20261003009860 a 20261003009864, nesta ordem) e abra esta tela de novo.
      </Banner>
    ) : (
      <LoadError error={error} retry={reload} />
    );
  }
  if (!data) return <Loading />;
  const lesson = data.lesson ?? {};
  const similar = data.similar ?? [];
  const cards = data.cards ?? { added: 0, kept: 0, hidden: 0 };
  const problems = data.problems ?? [];
  const needsSimilar = lesson.action === "create" && similar.length > 0;
  const blocked = [
    data.shadow_mode && "O modo sombra está ligado: nada vai ao aluno. Desligue em Configuração e custos.",
    !data.publish_enabled && "A publicação está desligada. Ligue em Configuração e custos (com o motivo) quando quiser publicar.",
    problems.length > 0 && "Ainda há pendências nesta versão (veja a lista acima).",
    needsSimilar && !similarOk && "Marque “Publicar mesmo assim” por causa da aula parecida.",
  ].filter(Boolean);
  const publish = () =>
    act
      .run(() => backend.rpc(publishFn, { p_version_id: version.id, p_options: { confirm_similar: similarOk } }), null)
      .then((r) => r !== undefined && onPublished?.("Publicada. A aula já está em Estudar › Aulas para todos os alunos" + (cards.total ? ", e os flashcards no baralho StaziaMed." : ".") + (r?.portao ? ` Aviso do portão de atualidade (modo "só avisar"): ${(r.portao.motivos ?? []).join(" ")}` : "")));

  return (
    <Section title="Publicar para os alunos" action={<Button variant="ghost" size="sm" icon="x" onClick={onClose}>Fechar</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Veja o que muda para o aluno antes de confirmar. Nada é publicado até você clicar no botão no fim.</p>
        {data.shadow_mode && (
          <Banner tone="warning" icon="eye-off" title="Modo sombra ligado">
            A IA analisa e sugere, mas nada vai ao aluno. Desligue o modo sombra em Configuração e custos (com o motivo) para publicar.
          </Banner>
        )}
        {!data.publish_enabled && (
          <Banner tone="warning" icon="power" title="Publicação desligada">
            Ligue a publicação em Configuração e custos (com o motivo) quando quiser levar conteúdo ao aluno.
          </Banner>
        )}
        {problems.length > 0 && (
          <Banner tone="warning" icon="triangle-alert" title={`O que falta para publicar (${problems.length})`}>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Banner>
        )}

        <div>
          <Label>Aula</Label>
          {lesson.action === "create" ? (
            <p style={{ margin: 0 }}>
              <Badge tone="brand" size="sm">Aula nova</Badge> em Estudar › Aulas: <strong>“{lesson.title}”</strong>
              {lesson.area_label ? ` · ${lesson.area_label}` : ""}
              {lesson.topic ? ` · tema ${lesson.topic}` : ""}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              <Badge tone="info" size="sm">Atualiza a aula</Badge> <strong>“{lesson.title}”</strong>. O progresso e a conclusão dos alunos continuam, e a aula ganha “atualizado em”.
            </p>
          )}
          <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            O aluno vê o texto revisado, {data.key_points ?? 0} ponto(s)-chave, o selo “revisado por médico da área” com a data e as fontes oficiais. Não vê afirmações, apontamentos das conferências, nomes de IA nem arquivos de origem.
          </p>
        </div>

        {needsSimilar && (
          <Banner tone="warning" icon="copy" title="Já existe aula parecida publicada">
            Mesma área e mesmo tema: {similar.map((s) => `“${s.title}”`).join(", ")}. Publicar cria uma segunda aula sobre o mesmo tema.
            <div style={{ marginTop: 8 }}>
              <Checkbox label="Publicar mesmo assim" checked={similarOk} onChange={(e) => setSimilarOk(e.target.checked)} />
            </div>
          </Banner>
        )}

        <div>
          <Label>Flashcards</Label>
          <p style={{ margin: 0 }}>
            {cards.added} novo(s) · {cards.kept} mantido(s) · {cards.hidden} saem do baralho. Entram no baralho StaziaMed de todos os alunos; quem já revisou um cartão que continua não perde a agenda.
          </p>
        </div>

        <div>
          <Label>Questões</Label>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>As questões desta unidade não entram nesta publicação: elas seguem pela fila de Questões inéditas, com revisão médica uma a uma.</p>
        </div>

        <div>
          <Button size="sm" variant="secondary" icon={showAsStudent ? "eye-off" : "eye"} onClick={() => setShowAsStudent((v) => !v)}>
            {showAsStudent ? "Esconder" : "Ver como o aluno vai ver"}
          </Button>
          {showAsStudent && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <Label>Texto da aula</Label>
              <Pre>{data.student_text}</Pre>
              <Label>Pontos-chave para o Revalida</Label>
              {(data.student_key_points ?? []).length === 0 ? (
                <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhum ponto-chave.</p>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {data.student_key_points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {act.feedback}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button icon="globe" disabled={blocked.length > 0} loading={act.busy} onClick={publish}>
            Publicar para os alunos
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {blocked.length > 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{blocked[0]}</span>}
        </div>
      </div>
    </Section>
  );
}
