import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../server/firebaseAdmin";
import {
  ReverseQuestion,
  resolvePackageRoot,
  validateReverseEnginePackage,
} from "./reverseEnginePackage";

const QUESTIONS_COLLECTION = "questions_v2";
const EDITIONS_COLLECTION = "editions_v2";
const BATCH_SIZE = 400;

function mapArea(area: string | undefined): string {
  const areas: Record<string, string> = {
    CLINICAL_MEDICINE: "CLINICA_MEDICA",
    GENERAL_SURGERY: "CIRURGIA_GERAL",
    OBSTETRICS_GYNECOLOGY: "GINECOLOGIA_OBSTETRICIA",
    PEDIATRICS: "PEDIATRIA",
    FAMILY_COMMUNITY_PUBLIC_HEALTH: "MEDICINA_FAMILIA_COMUNIDADE",
  };
  return areas[area ?? ""] ?? "CLINICA_MEDICA";
}

function toQuestionDocument(question: ReverseQuestion) {
  const answer = ["A", "B", "C", "D"].includes(question.official_answer)
    ? question.official_answer
    : null;
  const explanation = question.correction?.explanation ?? "";

  return {
    id: question.id,
    canonicalQuestionId: question.id,
    questionFingerprint: `${question.exam_id}:${question.question_number}`,
    code: question.id,
    origin: "INEP_OFICIAL",
    examYear: Number(question.exam_id.match(/(20\d{2})/)?.[1] ?? 0),
    examEdition: question.exam_id,
    originalNumber: question.question_number,
    questionNumber: question.question_number,
    area: mapArea(question.dna?.primary_area),
    specialty: question.dna?.primary_subarea ?? "",
    topic: question.dna?.topic ?? "",
    subtopic: question.dna?.subtopic ?? "",
    competencyId: question.dna?.primary_competency ?? "",
    competencyDescription: question.dna?.question_intent ?? "",
    clinicalCase: question.stem,
    options: ["A", "B", "C", "D"].map((id) => ({
      id,
      text: question.alternatives[id],
      isCorrect: id === answer,
      explanation,
    })),
    correctAnswer: answer ?? "A",
    answerFinal: answer ?? "ANNULLED",
    officialStatus: question.status === "ACTIVE" ? "valid" : "annulled",
    extractionConfidence: "HIGH",
    keyFinding: question.correction?.answer_text ?? "",
    expectedConduct: question.correction?.clinical_decision ?? question.dna?.clinical_decision ?? "",
    inepIntent: question.dna?.question_intent ?? "",
    sources: [],
    images: [],
    stats: { totalAttempts: 0, successRate: 0, averageTimeSeconds: 0 },
    catalogVersion: "staziamed.revalida.import-package.v1",
    sourceStatus: question.status,
    sourceSchemaVersion: question.schema_version,
    sourceType: question.source_type,
    sourceVisualAssets: question.visual?.assets ?? [],
    sourceProvenance: question.provenance ?? {},
    importedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  const db = getAdminDb();
  const packageRoot = resolvePackageRoot();
  const { manifest, questions, editions } = validateReverseEnginePackage(packageRoot);
  const isDryRun = process.argv.includes("--dry-run");

  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          packageRoot,
          schemaVersion: manifest.schema_version,
          questions: questions.length,
          activeQuestions: manifest.active_question_count,
          editions: editions.length,
          assets: manifest.asset_count,
        },
        null,
        2
      )
    );
    return;
  }

  for (let start = 0; start < questions.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const question of questions.slice(start, start + BATCH_SIZE)) {
      batch.set(db.collection(QUESTIONS_COLLECTION).doc(question.id), toQuestionDocument(question), { merge: true });
    }
    await batch.commit();
    console.log(`Imported questions ${Math.min(start + BATCH_SIZE, questions.length)}/${questions.length}`);
  }

  const batch = db.batch();
  for (const edition of editions) {
    const id = String(edition.exam_id);
    batch.set(db.collection(EDITIONS_COLLECTION).doc(id), {
      ...edition,
      catalogVersion: "staziamed.revalida.import-package.v1",
      importedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  batch.set(db.collection(EDITIONS_COLLECTION).doc("_manifest"), {
    ...manifest,
    importedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  console.log(`Imported editions ${editions.length}/${editions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
