import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PACKAGE_ROOT = path.resolve(
  process.cwd(),
  "revalida-reverse-engine/data/exports/staziamed_import_ready/v1",
);

export const EXPECTED_SCHEMA_VERSION = "staziamed.revalida.import-package.v1";
export const EXPECTED_QUESTION_COUNT = 1300;

export type ReverseQuestionStatus = "ACTIVE" | "ANNULLED" | "EXCLUDED_STATISTICAL";

export type ReverseQuestion = {
  id: string;
  exam_id: string;
  question_number: number;
  status: ReverseQuestionStatus;
  stem: string;
  alternatives: Record<"A" | "B" | "C" | "D", string>;
  official_answer: string;
  correction: {
    answer?: string;
    answer_text?: string;
    explanation?: string;
    clinical_decision?: string;
  } | null;
  dna: {
    primary_area?: string;
    primary_subarea?: string;
    topic?: string;
    subtopic?: string;
    primary_competency?: string;
    clinical_decision?: string;
    question_intent?: string;
  } | null;
  visual?: { assets?: ReverseVisualAsset[] };
  provenance?: Record<string, unknown>;
  schema_version: string;
  source_type: string;
};

export type ReverseVisualAsset = {
  file: string;
  type?: string;
  source_page?: number;
};

type PackageManifest = {
  schema_version: string;
  active_question_count: number;
  all_question_count: number;
  asset_count: number;
  files: Record<string, string>;
  assets?: Record<string, string>;
};

export function resolvePackageRoot(): string {
  return process.env.REVERSE_ENGINE_PACKAGE_ROOT
    ? path.resolve(process.cwd(), process.env.REVERSE_ENGINE_PACKAGE_ROOT)
    : DEFAULT_PACKAGE_ROOT;
}

export function readJsonFile<T>(packageRoot: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, fileName), "utf8")) as T;
}

export function readJsonLines<T>(packageRoot: string, fileName: string): T[] {
  return fs
    .readFileSync(path.join(packageRoot, fileName), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function validateReverseEnginePackage(packageRoot: string): {
  manifest: PackageManifest;
  questions: ReverseQuestion[];
  editions: Array<Record<string, unknown>>;
} {
  if (!fs.existsSync(packageRoot)) {
    throw new Error(`Reverse-engine package root not found: ${packageRoot}`);
  }

  const manifest = readJsonFile<PackageManifest>(packageRoot, "manifest.json");
  const questions = readJsonLines<ReverseQuestion>(packageRoot, "questions_all.jsonl");
  const editions = readJsonFile<Array<Record<string, unknown>>>(packageRoot, "editions.json");

  if (manifest.schema_version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Invalid package schema: expected ${EXPECTED_SCHEMA_VERSION}, received ${manifest.schema_version}`
    );
  }

  if (questions.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(
      `Package validation failed: expected ${EXPECTED_QUESTION_COUNT} questions, received ${questions.length}`
    );
  }

  const uniqueIds = new Set(questions.map((question) => question.id));
  if (uniqueIds.size !== questions.length) {
    throw new Error("Package validation failed: duplicate question ids detected");
  }

  if (manifest.all_question_count !== questions.length) {
    throw new Error(
      `Manifest all_question_count mismatch: expected ${questions.length}, received ${manifest.all_question_count}`
    );
  }

  const activeCount = questions.filter((question) => question.status === "ACTIVE").length;
  if (manifest.active_question_count !== activeCount) {
    throw new Error(
      `Manifest active_question_count mismatch: expected ${activeCount}, received ${manifest.active_question_count}`
    );
  }

  for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
    const filePath = path.join(packageRoot, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Manifest file missing from package: ${fileName}`);
    }
    const actualHash = sha256File(filePath);
    if (actualHash !== expectedHash) {
      throw new Error(`Manifest hash mismatch for ${fileName}`);
    }
  }

  let declaredAssetCount = 0;
  for (const question of questions) {
    for (const asset of question.visual?.assets ?? []) {
      declaredAssetCount++;
      const assetPath = path.join(packageRoot, asset.file);
      if (!fs.existsSync(assetPath)) {
        throw new Error(`Missing declared asset: ${asset.file}`);
      }
    }
  }

  if (manifest.asset_count !== declaredAssetCount) {
    throw new Error(
      `Manifest asset_count mismatch: expected ${declaredAssetCount}, received ${manifest.asset_count}`
    );
  }

  if (manifest.assets) {
    for (const [assetFile, expectedHash] of Object.entries(manifest.assets)) {
      const assetPath = path.join(packageRoot, assetFile);
      if (!fs.existsSync(assetPath)) {
        throw new Error(`Manifest asset missing from package: ${assetFile}`);
      }
      const actualHash = sha256File(assetPath);
      if (actualHash !== expectedHash) {
        throw new Error(`Manifest hash mismatch for asset ${assetFile}`);
      }
    }
  }

  return { manifest, questions, editions };
}
