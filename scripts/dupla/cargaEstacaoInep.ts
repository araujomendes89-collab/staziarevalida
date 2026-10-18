/**
 * Carga de UMA estação montada pela Montagem das estações do INEP (pasta .tmp-aulas/estacoes-inep/<edição>/<NN>) no banco.
 * Primeiro uso (18/10/2026): Revalida 2025/1, estação 7 (ureterolitíase), aprovada pelo dono em 17/10, só para a equipe.
 *
 * O que o SQL gerado faz (pode rodar duas vezes; nenhuma IA; não aprova nada):
 *   - grava o cartão em checklist_stations (o da 013420, se já existir) com o conteúdo do estacao-app.json, SEMPRE com
 *     medical_review = 'pending': pendente, a estação só aparece para a equipe (política "estações: catálogo (aprovadas, ou
 *     equipe)", app_dupla_stations e dupla_station_liberada). A aprovação médica fica para a tela Administração › Estações ›
 *     Conferir, com o revisor e o registro (…8000). Se a estação JÁ estiver aprovada e o conteúdo for diferente, recusa (mudar
 *     conteúdo aprovado pede nova revisão); igual, não faz nada;
 *   - grava o conteúdo completo em checklist_station_contents (o gatilho da 013420 marca o cartão como "conteúdo pronto");
 *   - cartões do catálogo SEM conteúdo que nasceram "conteúdo pronto" (as outras 9 da 2025/1 na 013420) passam a "Aguardando
 *     conteúdo", só visível à equipe; quando o conteúdo deles chegar, o gatilho os volta a "conteúdo pronto".
 * O conteúdo é o estacao-app.json como está, passando por normalizeStation/validateStation do app (soma 10, ids, números),
 * com três diferenças: sai o bloco interno "_montagem" e os campos de dificuldade (o grau é definido pelo revisor médico na
 * tela, 013410); image_url dos impressos vira nulo (era o caminho do arquivo no Mac; a imagem só entra pelo depósito e pela
 * tabela station_assets, que ainda não existe em produção: sem ela o impresso aparece em TEXTO, que é a transcrição conferida);
 * "version" passa a ser o código do arquivo (sha256 curto), para saber qual conteúdo foi avaliado.
 * conduct_notes ("o que mudou desde a prova") entram só se o estacao-app.json as tiver; nada é escrito aqui.
 */
import { createHash } from "node:crypto";
import { loadStations, toLite } from "../../src/shared/checklistBank/catalog";
import type { Station } from "../../src/shared/checklistBank/types";

/** Ids aceitos: os da Montagem do INEP (inep2025-1-e07, inep2021r-e03…). Nunca os de teste (teste-…). */
export const ID_ESTACAO_INEP = /^inep\d{4}(-[12])?(r)?-e\d{2}$/;

export interface CargaEstacao {
  station: Station & { version: string; conduct_notes?: { item_order: number | null; text: string }[] };
  sql: string;
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const arr = (vs: string[]) => `array[${vs.map(lit).join(", ")}]::text[]`;

/**
 * Monta o SQL da carga a partir do texto do estacao-app.json e do texto de aprovacao-dono.md (que precisa dizer "aprovado
 * pelo dono"). Lança erro se a estação não estiver aprovada pelo dono, se o id não for do INEP ou se o conteúdo for inválido.
 */
export function buildCargaEstacao(estacaoAppJson: string, aprovacaoDono: string): CargaEstacao {
  if (!/aprovado pelo dono/i.test(aprovacaoDono)) throw new Error("A estação não tem a aprovação do dono (aprovacao-dono.md).");
  const raw = JSON.parse(estacaoAppJson);
  if (!ID_ESTACAO_INEP.test(String(raw?.id ?? ""))) throw new Error(`Id de estação fora do padrão da Montagem: ${raw?.id}`);
  if (raw?._montagem?.pep_situacao && raw._montagem.pep_situacao !== "DEFINITIVO") {
    throw new Error("PEP preliminar: esta carga só aceita estação com PEP definitivo.");
  }
  const version = `${raw.id}@${createHash("sha256").update(estacaoAppJson).digest("hex").slice(0, 12)}`;
  const [station] = loadStations([{ ...raw, medical_review: "pending", pressings: (raw.pressings ?? []).map((p: any) => ({ ...p, image_url: null })) }]);
  const conduct = Array.isArray(raw.conduct_notes) && raw.conduct_notes.length ? { conduct_notes: raw.conduct_notes } : {};
  const content = { ...station, version, ...conduct };
  const lite = toLite(station);

  const id = lit(station.id);
  const json = JSON.stringify(content);
  const tag = "$estacao_inep$";
  if (json.includes(tag)) throw new Error("O conteúdo contém o marcador do SQL.");

  const sql = `-- Carga da estação ${station.id} (${station.area}) · ${version}
-- Gerado por scripts/dupla/cargaEstacaoInep.ts. Pode rodar duas vezes. Não aprova nada: a estação fica PENDENTE (só a equipe vê).
do ${tag}
declare
  v_id constant text := ${id};
  v_content constant jsonb := ${lit(json)}::jsonb;
  v_review text;
  v_atual jsonb;
begin
  if to_regclass('public.checklist_station_difficulty') is null or not exists (
       select 1 from information_schema.columns where table_schema = 'public' and table_name = 'checklist_stations' and column_name = 'content_status') then
    raise exception 'Carga da estação: faltam as migrações da 2ª fase (013410/013420). Nada foi gravado.';
  end if;
  select s.medical_review into v_review from public.checklist_stations s where s.id = v_id;
  select c.content into v_atual from public.checklist_station_contents c where c.station_id = v_id;
  if v_review = 'approved' then
    if v_atual is distinct from v_content then
      raise exception 'A estação % já está aprovada e o conteúdo é diferente: mudar conteúdo aprovado pede nova revisão. Nada foi gravado.', v_id;
    end if;
    return;
  end if;

  insert into public.checklist_stations (id, name, topic, area, setting, taxonomy_path, goal, institution, year, styles, is_pro_only,
                                         medical_review, max_score, duration_ms, created_at)
  values (v_id, ${lit(lite.name)}, ${lit(lite.topic)}, ${lit(lite.area)}, ${lite.setting === null ? "null" : lit(lite.setting)},
          ${arr(lite.taxonomy_path)}, ${lit(lite.goal)}, ${lite.institution === null ? "null" : lit(lite.institution)},
          ${lite.year === null ? "null" : lit(lite.year)}, ${arr(lite.styles)}, ${lite.is_pro_only}, 'pending', ${lite.max_score},
          ${lite.duration_ms}, ${lit(lite.created_at)})
  on conflict (id) do update set
    name = excluded.name, topic = excluded.topic, area = excluded.area, setting = excluded.setting,
    taxonomy_path = excluded.taxonomy_path, goal = excluded.goal, institution = excluded.institution, year = excluded.year,
    styles = excluded.styles, is_pro_only = excluded.is_pro_only, max_score = excluded.max_score, duration_ms = excluded.duration_ms
  where (checklist_stations.name, checklist_stations.topic, checklist_stations.area, checklist_stations.setting,
         checklist_stations.taxonomy_path, checklist_stations.goal, checklist_stations.institution, checklist_stations.year,
         checklist_stations.styles, checklist_stations.is_pro_only, checklist_stations.max_score, checklist_stations.duration_ms)
        is distinct from
        (excluded.name, excluded.topic, excluded.area, excluded.setting, excluded.taxonomy_path, excluded.goal,
         excluded.institution, excluded.year, excluded.styles, excluded.is_pro_only, excluded.max_score, excluded.duration_ms);

  insert into public.checklist_station_contents (station_id, content) values (v_id, v_content)
  on conflict (station_id) do update set content = excluded.content
  where checklist_station_contents.content is distinct from excluded.content;
end
${tag};

-- Cartões do catálogo sem conteúdo ficam "Aguardando conteúdo" (só a equipe vê; o gatilho da 013420 desfaz quando o conteúdo chegar)
update public.checklist_stations s set content_status = 'awaiting_content'
 where s.catalog_edition is not null and s.content_status = 'content_ready' and s.medical_review = 'pending'
   and not exists (select 1 from public.checklist_station_contents c where c.station_id = s.id);

select jsonb_build_object(
  'estacao', ${id},
  'situacao', (select medical_review from public.checklist_stations where id = ${id}),
  'conteudo', (select content_status from public.checklist_stations where id = ${id}),
  'versao', (select content ->> 'version' from public.checklist_station_contents where station_id = ${id}),
  'itens_pep', (select jsonb_array_length(content -> 'checklist_items') from public.checklist_station_contents where station_id = ${id}),
  'impressos', (select jsonb_array_length(content -> 'pressings') from public.checklist_station_contents where station_id = ${id}),
  'cartoes_aguardando', (select count(*) from public.checklist_stations where catalog_edition is not null and content_status = 'awaiting_content')
) as carga;
`;
  return { station: content, sql };
}
