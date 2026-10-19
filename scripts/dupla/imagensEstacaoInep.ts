/**
 * Imagens de UMA estação da Montagem do INEP (impressos recortados, sem logos, e a folha do candidato) para a sala da 2ª fase.
 * Primeiro uso (18/10/2026): Revalida 2025/1, estação 7 (inep2025-1-e07), já carregada em produção (pendente, só a equipe).
 *
 * Três passos, cada um separado (nada aqui grava no banco):
 *   1. PREPARAR (montarPacote): lê a pasta da estação, confere cada PNG e o nomeia pelo sha256; a folha do candidato é
 *      desenhada pelo gerador do app a partir da fonte que o banco calcula (dupla_folha_fonte) para o mesmo conteúdo da carga.
 *      Resultado: uma pasta com arquivos/<sha256>.png (o nome não diz a estação), manifest.json e o SQL de ligar.
 *   2. ENVIAR (enviarPacote): sobe os arquivos ao depósito privado content-hub. Nunca troca nem apaga: arquivo que já está lá
 *      com o mesmo conteúdo é pulado; com conteúdo diferente, para tudo.
 *   3. LIGAR (sqlLigarImagens): o SQL que liga cada impresso (ch_worker_dupla_impresso_ligar, 014200) e a folha
 *      (ch_worker_dupla_folha_gravar, 013390). Pode rodar duas vezes; recusa se o conteúdo da folha mudou, se falta arquivo no
 *      depósito ou se o impresso já tem OUTRA imagem (nada é trocado).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ID_ESTACAO_INEP } from "./cargaEstacaoInep";

export const PASTA_IMPRESSOS = "dupla/impressos";
export const PASTA_FOLHAS = "dupla/folhas";
/** Limite por imagem (o depósito aceita até 300 MB; uma folha ou um impresso recortado tem poucas centenas de KB). */
export const MAX_BYTES = 8 * 1024 * 1024;

export interface ImagemDoPacote {
  tipo: "impresso" | "folha";
  /** id verdadeiro do impresso (só para o SQL e para a equipe); null na folha. */
  impresso_id: string | null;
  /** nome do impresso, só para a prévia do dono (não vai ao depósito). */
  nome: string;
  /** de onde veio (caminho relativo à pasta da estação, ou "gerada pelo app"). */
  origem: string;
  arquivo: string;
  storage_path: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  content_type: "image/png";
}

export interface PacoteImagens {
  station_id: string;
  versao_conteudo: string | null;
  preparado_em: string;
  folha: { modelo: string; fonte_hash: string; fonte: unknown } | null;
  imagens: ImagemDoPacote[];
}

export const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");

/** Confere que é um PNG e devolve largura e altura (cabeçalho IHDR). */
export function pngInfo(data: Buffer): { width: number; height: number } {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length < 24 || !data.subarray(0, 8).equals(assinatura) || data.subarray(12, 16).toString("latin1") !== "IHDR") {
    throw new Error("O arquivo não é um PNG.");
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!width || !height) throw new Error("PNG sem tamanho.");
  return { width, height };
}

export function imagemDoArquivo(
  data: Buffer,
  o: { tipo: ImagemDoPacote["tipo"]; impresso_id: string | null; nome: string; origem: string }
): ImagemDoPacote {
  if (data.length > MAX_BYTES) throw new Error(`${o.origem}: imagem grande demais (${data.length} bytes).`);
  const { width, height } = pngInfo(data);
  const sha = sha256(data);
  return {
    ...o,
    arquivo: `arquivos/${sha}.png`,
    storage_path: `${o.tipo === "folha" ? PASTA_FOLHAS : PASTA_IMPRESSOS}/${sha}.png`,
    sha256: sha,
    width,
    height,
    bytes: data.length,
    content_type: "image/png",
  };
}

/**
 * Impressos da estação com imagem: cada impresso do estacao-app.json com image_url aponta para um PNG DENTRO da pasta da
 * estação. Exige a aprovação do dono (aprovacao-dono.md) e id do INEP, como a carga.
 */
export function impressosDaPasta(pasta: string): { station_id: string; versao: string | null; imagens: { imagem: ImagemDoPacote; data: Buffer }[] } {
  const aprovacao = fs.readFileSync(path.join(pasta, "aprovacao-dono.md"), "utf8");
  if (!/aprovado pelo dono/i.test(aprovacao)) throw new Error("A estação não tem a aprovação do dono (aprovacao-dono.md).");
  const raw = JSON.parse(fs.readFileSync(path.join(pasta, "estacao-app.json"), "utf8"));
  const id = String(raw.id ?? "");
  if (!ID_ESTACAO_INEP.test(id)) throw new Error(`Id de estação fora do padrão do INEP: ${id}`);
  const base = path.resolve(pasta);
  const imagens: { imagem: ImagemDoPacote; data: Buffer }[] = [];
  const vistos = new Set<string>();
  for (const p of Array.isArray(raw.pressings) ? raw.pressings : []) {
    if (!p?.image_url) continue;
    const pid = String(p.id ?? "");
    if (!pid || vistos.has(pid)) throw new Error(`Impresso sem id ou repetido: ${pid}`);
    vistos.add(pid);
    const arquivo = path.resolve(base, String(p.image_url));
    if (!arquivo.startsWith(base + path.sep)) throw new Error(`${pid}: a imagem está fora da pasta da estação.`);
    if (!/\.png$/i.test(arquivo)) throw new Error(`${pid}: só PNG.`);
    if (!fs.existsSync(arquivo)) throw new Error(`${pid}: imagem não encontrada (${p.image_url}).`);
    const data = fs.readFileSync(arquivo);
    imagens.push({
      imagem: imagemDoArquivo(data, { tipo: "impresso", impresso_id: pid, nome: String(p.name ?? ""), origem: path.relative(base, arquivo) }),
      data,
    });
  }
  return { station_id: id, versao: null, imagens };
}

/** Grava a pasta do pacote: arquivos/<sha256>.png e manifest.json. Não apaga nada que já esteja na pasta. */
export function gravarPacote(saida: string, pacote: PacoteImagens, dados: Map<string, Buffer>): void {
  fs.mkdirSync(path.join(saida, "arquivos"), { recursive: true });
  for (const im of pacote.imagens) {
    const data = dados.get(im.sha256);
    if (!data || sha256(data) !== im.sha256) throw new Error(`Arquivo do pacote não confere: ${im.arquivo}`);
    fs.writeFileSync(path.join(saida, im.arquivo), data);
  }
  fs.writeFileSync(path.join(saida, "manifest.json"), JSON.stringify(pacote, null, 2) + "\n");
}

/** Lê o pacote e confere cada arquivo pelo sha256 (o que vai subir é exatamente o que o dono viu na prévia). */
export function lerPacote(pasta: string): { pacote: PacoteImagens; dados: Map<string, Buffer> } {
  const pacote = JSON.parse(fs.readFileSync(path.join(pasta, "manifest.json"), "utf8")) as PacoteImagens;
  if (!ID_ESTACAO_INEP.test(pacote.station_id)) throw new Error(`Id de estação fora do padrão do INEP: ${pacote.station_id}`);
  const dados = new Map<string, Buffer>();
  for (const im of pacote.imagens) {
    const data = fs.readFileSync(path.join(pasta, im.arquivo));
    if (sha256(data) !== im.sha256) throw new Error(`O arquivo ${im.arquivo} mudou depois de preparado (sha256 diferente).`);
    const esperado = `${im.tipo === "folha" ? PASTA_FOLHAS : PASTA_IMPRESSOS}/${im.sha256}.png`;
    if (im.storage_path !== esperado) throw new Error(`Caminho fora do padrão opaco: ${im.storage_path}`);
    pngInfo(data);
    dados.set(im.sha256, data);
  }
  return { pacote, dados };
}

// ---------------------------------------------------------------------------- enviar
/** O mínimo do depósito: existe? baixar; gravar SÓ arquivo novo (nunca sobrescreve). */
export interface DepositoSoNovo {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer>;
  putNovo(key: string, data: Buffer, contentType: string): Promise<void>;
}

export interface ResultadoEnvio {
  enviados: string[];
  iguais: string[];
}

/**
 * Sobe as imagens do pacote. Idempotente: arquivo já no depósito com o mesmo sha256 é pulado. Arquivo com o mesmo nome e
 * conteúdo diferente (não deveria existir: o nome é o sha256) → erro, nada é trocado.
 */
export async function enviarPacote(deposito: DepositoSoNovo, pacote: PacoteImagens, dados: Map<string, Buffer>, log: (m: string) => void = () => {}): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { enviados: [], iguais: [] };
  for (const im of pacote.imagens) {
    const data = dados.get(im.sha256)!;
    if (await deposito.exists(im.storage_path)) {
      const la = await deposito.get(im.storage_path);
      if (sha256(la) !== im.sha256) throw new Error(`${im.storage_path} já existe no depósito com OUTRO conteúdo: nada foi trocado.`);
      r.iguais.push(im.storage_path);
      log(`[imagens] já estava no depósito (igual): ${im.storage_path}`);
      continue;
    }
    await deposito.putNovo(im.storage_path, data, im.content_type);
    const conferido = await deposito.get(im.storage_path);
    if (sha256(conferido) !== im.sha256) throw new Error(`${im.storage_path}: o arquivo no depósito não confere depois de enviar.`);
    r.enviados.push(im.storage_path);
    log(`[imagens] enviado e conferido: ${im.storage_path} (${im.bytes} bytes)`);
  }
  return r;
}

// ---------------------------------------------------------------------------- ligar (SQL)
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * SQL que liga as imagens do pacote à estação. Rodar DEPOIS de enviar os arquivos. Pode rodar duas vezes.
 * Ensaio antes de enviar: `set local fase2_imagens.ensaio = 'sem-arquivos';` no começo da transação pula só a conferência
 * do arquivo no depósito (o resto é conferido igual).
 */
export function sqlLigarImagens(pacote: PacoteImagens): string {
  const st = pacote.station_id;
  const impressos = pacote.imagens.filter((i) => i.tipo === "impresso");
  const folha = pacote.imagens.find((i) => i.tipo === "folha") ?? null;
  if (folha && !pacote.folha) throw new Error("Pacote com folha sem a marca do conteúdo (fonte_hash).");
  const linhas: string[] = [];
  linhas.push(`-- Liga as imagens da estação ${st} (impressos e folha do candidato) — gerado por scripts/dupla/imagens-estacao-inep.ts`);
  linhas.push(`-- em ${pacote.preparado_em}. Rodar DEPOIS de enviar os arquivos ao depósito content-hub. Pode rodar duas vezes.`);
  linhas.push(`-- Não apaga nem troca imagem já ligada: impresso com OUTRA imagem, ou folha diferente já ligada → erro e nada muda.`);
  linhas.push(`do $$`);
  linhas.push(`declare`);
  linhas.push(`  v_conferir boolean := coalesce(current_setting('fase2_imagens.ensaio', true), '') <> 'sem-arquivos';`);
  linhas.push(`  v_marca text;`);
  linhas.push(`  v_r jsonb;`);
  linhas.push(`begin`);
  linhas.push(`  if to_regprocedure('public.ch_worker_dupla_impresso_ligar(text,text,text,text,integer,integer,integer,boolean)') is null then`);
  linhas.push(`    raise exception 'Imagens da estação: falta a migração 014200 (station_assets). Nada foi gravado.';`);
  linhas.push(`  end if;`);
  linhas.push(`  if not exists (select 1 from public.checklist_station_contents k where k.station_id = ${lit(st)}) then`);
  linhas.push(`    raise exception 'Imagens da estação: a estação ${st} não está carregada. Nada foi gravado.';`);
  linhas.push(`  end if;`);
  for (const im of impressos) {
    linhas.push(`  v_r := public.ch_worker_dupla_impresso_ligar(${lit(st)}, ${lit(im.impresso_id!)}, ${lit(im.storage_path)}, ${lit(im.sha256)}, ${im.width}, ${im.height}, ${im.bytes}, v_conferir);`);
    linhas.push(`  raise notice 'impresso %: %', ${lit(im.impresso_id!)}, v_r ->> 'estado';`);
  }
  if (folha && pacote.folha) {
    const h = pacote.folha.fonte_hash;
    if (!/^[0-9a-f]{32}$/.test(h)) throw new Error("Marca do conteúdo da folha inválida.");
    linhas.push(`  -- folha do candidato (013390): só se o conteúdo da estação é o mesmo que foi desenhado`);
    linhas.push(`  if public.dupla_folha_hash(${lit(st)}) is distinct from ${lit(h)} then`);
    linhas.push(`    raise exception 'Folha do candidato: o conteúdo da estação mudou desde que a imagem foi desenhada (marca %). Gere o pacote de novo. Nada foi gravado.', public.dupla_folha_hash(${lit(st)});`);
    linhas.push(`  end if;`);
    linhas.push(`  if v_conferir and to_regclass('storage.objects') is not null then`);
    linhas.push(`    if not exists (select 1 from storage.objects o where o.bucket_id = 'content-hub' and o.name = ${lit(folha.storage_path)}) then`);
    linhas.push(`      raise exception 'Folha do candidato: o arquivo % ainda não está no depósito content-hub. Nada foi gravado.', ${lit(folha.storage_path)};`);
    linhas.push(`    end if;`);
    linhas.push(`  end if;`);
    linhas.push(`  select k.content #>> '{pressing_assets,candidate_sheet,folha}' into v_marca from public.checklist_station_contents k where k.station_id = ${lit(st)};`);
    linhas.push(`  if v_marca is not null and v_marca <> ${lit(folha.sha256)} then`);
    linhas.push(`    raise exception 'Folha do candidato: a estação já tem OUTRA folha ligada (%): nada foi trocado.', v_marca;`);
    linhas.push(`  end if;`);
    linhas.push(`  if (select s.sha256 = ${lit(folha.sha256)} and s.source_hash = ${lit(h)} and s.status = 'ready' from public.dupla_station_sheets s where s.station_id = ${lit(st)}) is true`);
    linhas.push(`     and v_marca is not null then`);
    linhas.push(`    raise notice 'folha do candidato: ja_ligada';`);
    linhas.push(`  else`);
    linhas.push(`    perform public.ch_worker_dupla_folha_gravar(null, ${lit(st)}, ${lit(h)}, ${lit(folha.storage_path)}, ${lit(folha.sha256)}, ${folha.width}, ${folha.height}, ${folha.bytes}, ${lit(pacote.folha.modelo)});`);
    linhas.push(`    raise notice 'folha do candidato: ligada';`);
    linhas.push(`  end if;`);
  }
  linhas.push(`end`);
  linhas.push(`$$;`);
  return linhas.join("\n") + "\n";
}
