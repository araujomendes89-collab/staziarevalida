import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";
import { TopicTaxonomyService } from "../src/services/topicTaxonomyService";
import { ALL_GRANDES_TEMAS } from "../src/data/grandesTemas";
import { MedicalArea } from "../src/types";

const app = initializeApp(firebaseConfigJson);
const db = getFirestore(app, "staziamed-revalida-prod");

async function auditRealQuestions() {
  console.log("============================================================");
  console.log("ETAPA 1.14F — AUDITORIA DO DATASET REAL DE QUESTÕES");
  console.log("============================================================");
  console.log("Lendo coleção 'questions' do Firestore (staziamed-revalida-prod)...");

  const startTime = Date.now();
  const qSnap = await getDocs(collection(db, "questions"));
  const readDuration = Date.now() - startTime;

  console.log(`Leitura concluída em ${readDuration}ms. Total de documentos: ${qSnap.size}`);

  const questions = qSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as any[];

  const totalQuestions = questions.length;
  if (totalQuestions === 0) {
    console.error("ERRO: Nenhuma questão encontrada no Firestore!");
    return;
  }

  // 1. Audit by Edition
  const byEdition: Record<string, { total: number; mapped: number; unmapped: number; ambiguous: number; mismatch: number }> = {};
  // 2. Audit by Medical Area
  const byArea: Record<string, { total: number; mapped: number; unmapped: number; ambiguous: number; mismatch: number }> = {};
  // 3. Match Types Distribution
  const matchTypes: Record<string, number> = {
    DIRECT_ID: 0,
    CANONICAL_NAME: 0,
    EXPLICIT_ALIAS: 0,
    SUBTOPIC_ALIAS: 0,
    AREA_MISMATCH: 0,
    AMBIGUOUS: 0,
    UNMAPPED: 0,
  };

  // 4. Topic Coverage
  const topicQuestionCount = new Map<string, number>();
  ALL_GRANDES_TEMAS.forEach((t) => topicQuestionCount.set(t.id, 0));

  const unmappedList: any[] = [];
  const ambiguousList: any[] = [];
  const mismatchList: any[] = [];

  const resolveStart = Date.now();

  for (const q of questions) {
    const editionKey = q.examEdition || "Edição Desconhecida";
    if (!byEdition[editionKey]) {
      byEdition[editionKey] = { total: 0, mapped: 0, unmapped: 0, ambiguous: 0, mismatch: 0 };
    }
    byEdition[editionKey].total++;

    const areaKey = q.area || "Área Desconhecida";
    if (!byArea[areaKey]) {
      byArea[areaKey] = { total: 0, mapped: 0, unmapped: 0, ambiguous: 0, mismatch: 0 };
    }
    byArea[areaKey].total++;

    const resolution = TopicTaxonomyService.resolveCanonicalTopic({
      id: q.id,
      area: q.area as MedicalArea,
      topic: q.topic,
      subtopic: q.subtopic,
      canonicalTopicId: q.canonicalTopicId,
    });

    const mType = resolution.matchType;
    if (matchTypes[mType] !== undefined) {
      matchTypes[mType]++;
    }

    if (resolution.canonicalTopicId && (mType === "DIRECT_ID" || mType === "CANONICAL_NAME" || mType === "EXPLICIT_ALIAS")) {
      byEdition[editionKey].mapped++;
      byArea[areaKey].mapped++;
      topicQuestionCount.set(
        resolution.canonicalTopicId,
        (topicQuestionCount.get(resolution.canonicalTopicId) || 0) + 1
      );
    } else if (mType === "AREA_MISMATCH") {
      byEdition[editionKey].mismatch++;
      byArea[areaKey].mismatch++;
      mismatchList.push({
        id: q.id,
        area: q.area,
        topic: q.topic,
        subtopic: q.subtopic,
        resolvedTopicId: resolution.canonicalTopicId,
        resolvedArea: resolution.area,
      });
    } else if (mType === "AMBIGUOUS") {
      byEdition[editionKey].ambiguous++;
      byArea[areaKey].ambiguous++;
      ambiguousList.push({
        id: q.id,
        edition: q.examEdition,
        area: q.area,
        topic: q.topic,
        subtopic: q.subtopic,
        notes: resolution.notes,
      });
    } else {
      byEdition[editionKey].unmapped++;
      byArea[areaKey].unmapped++;
      unmappedList.push({
        id: q.id,
        edition: q.examEdition,
        area: q.area,
        topic: q.topic,
        subtopic: q.subtopic,
        clinicalCasePreview: (q.clinicalCase || "").slice(0, 80) + "...",
      });
    }
  }

  const resolveDuration = Date.now() - resolveStart;
  const mappedQuestions = matchTypes.DIRECT_ID + matchTypes.CANONICAL_NAME + matchTypes.EXPLICIT_ALIAS + matchTypes.SUBTOPIC_ALIAS;
  const coveragePct = (mappedQuestions / totalQuestions) * 100;

  console.log("\n============================================================");
  console.log("RESULTADOS GERAIS DO DATASET REAL");
  console.log("============================================================");
  console.log(`TOTAL_REAL_QUESTIONS: ${totalQuestions}`);
  console.log(`MAPPED_REAL_QUESTIONS: ${mappedQuestions} (${coveragePct.toFixed(2)}%)`);
  console.log(`UNMAPPED_REAL_QUESTIONS: ${matchTypes.UNMAPPED}`);
  console.log(`AMBIGUOUS_REAL_QUESTIONS: ${matchTypes.AMBIGUOUS}`);
  console.log(`AREA_MISMATCH_REAL_COUNT: ${matchTypes.AREA_MISMATCH}`);
  console.log(`Tempo de resolução de ${totalQuestions} questões: ${resolveDuration}ms (${(resolveDuration / totalQuestions).toFixed(3)}ms/questão)`);

  console.log("\n--- DISTRIBUIÇÃO DOS MATCH TYPES ---");
  console.log(`DIRECT_ID:       ${matchTypes.DIRECT_ID} (${((matchTypes.DIRECT_ID / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`CANONICAL_NAME:  ${matchTypes.CANONICAL_NAME} (${((matchTypes.CANONICAL_NAME / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`EXPLICIT_ALIAS:  ${matchTypes.EXPLICIT_ALIAS} (${((matchTypes.EXPLICIT_ALIAS / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`SUBTOPIC_ALIAS:  ${matchTypes.SUBTOPIC_ALIAS} (${((matchTypes.SUBTOPIC_ALIAS / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`AREA_MISMATCH:   ${matchTypes.AREA_MISMATCH} (${((matchTypes.AREA_MISMATCH / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`AMBIGUOUS:       ${matchTypes.AMBIGUOUS} (${((matchTypes.AMBIGUOUS / totalQuestions) * 100).toFixed(2)}%)`);
  console.log(`UNMAPPED:        ${matchTypes.UNMAPPED} (${((matchTypes.UNMAPPED / totalQuestions) * 100).toFixed(2)}%)`);

  console.log("\n--- COBERTURA POR EDIÇÃO ---");
  for (const [ed, stats] of Object.entries(byEdition)) {
    const edCoverage = ((stats.mapped / stats.total) * 100).toFixed(1);
    console.log(`• ${ed}: ${stats.mapped}/${stats.total} mapeadas (${edCoverage}%) [unmapped: ${stats.unmapped}, amb: ${stats.ambiguous}, mismatch: ${stats.mismatch}]`);
  }

  console.log("\n--- COBERTURA POR GRANDE ÁREA ---");
  for (const [ar, stats] of Object.entries(byArea)) {
    const arCoverage = ((stats.mapped / stats.total) * 100).toFixed(1);
    console.log(`• ${ar}: ${stats.mapped}/${stats.total} mapeadas (${arCoverage}%) [unmapped: ${stats.unmapped}, amb: ${stats.ambiguous}, mismatch: ${stats.mismatch}]`);
  }

  let topicsWithQuestions = 0;
  let topicsWithZeroQuestions = 0;
  topicQuestionCount.forEach((count) => {
    if (count > 0) topicsWithQuestions++;
    else topicsWithZeroQuestions++;
  });

  console.log("\n--- DISTRIBUIÇÃO NOS 75 GRANDES TEMAS ---");
  console.log(`TOPICS_WITH_REAL_QUESTIONS: ${topicsWithQuestions} / 75 (${((topicsWithQuestions / 75) * 100).toFixed(1)}%)`);
  console.log(`TOPICS_WITH_ZERO_REAL_QUESTIONS: ${topicsWithZeroQuestions} / 75 (${((topicsWithZeroQuestions / 75) * 100).toFixed(1)}%)`);

  if (unmappedList.length > 0) {
    console.log("\n--- DETALHE DAS QUESTÕES UNMAPPED ---");
    unmappedList.slice(0, 15).forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.id}] (${item.area}) Topic: "${item.topic}", Subtopic: "${item.subtopic}"`);
    });
  }

  if (mismatchList.length > 0) {
    console.log("\n--- DETALHE DAS QUESTÕES AREA_MISMATCH ---");
    mismatchList.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.id}] Question.area=${item.area} vs Resolved.area=${item.resolvedArea} (Topic: "${item.topic}", Resolved: ${item.resolvedTopicId})`);
    });
  }

  if (ambiguousList.length > 0) {
    console.log("\n--- DETALHE DAS QUESTÕES AMBIGUOUS ---");
    ambiguousList.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.id}] (${item.area}) Topic: "${item.topic}", Subtopic: "${item.subtopic}" -> ${item.notes}`);
    });
  }
}

auditRealQuestions();
