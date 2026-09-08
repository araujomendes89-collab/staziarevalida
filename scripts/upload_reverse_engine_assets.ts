import path from "node:path";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "../server/firebaseAdmin";
import {
  resolvePackageRoot,
  ReverseQuestion,
  ReverseVisualAsset,
  validateReverseEnginePackage,
} from "./reverseEnginePackage";

const QUESTIONS_COLLECTION = "questions_v2";
const STORAGE_PREFIX = "questions-images/revalida-import-v1";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "staziamed-revalida-prod.firebasestorage.app";

async function main() {
  const db = getAdminDb();
  const bucket = getStorage(getAdminApp()).bucket(STORAGE_BUCKET);
  const packageRoot = resolvePackageRoot();
  const { manifest, questions } = validateReverseEnginePackage(packageRoot);
  const isDryRun = process.argv.includes("--dry-run");
  let uploaded = 0;
  let linked = 0;
  let questionsWithAssets = 0;

  if (isDryRun) {
    for (const question of questions) {
      const assets = question.visual?.assets ?? [];
      if (assets.length > 0) {
        questionsWithAssets++;
        linked += assets.length;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          packageRoot,
          schemaVersion: manifest.schema_version,
          bucket: STORAGE_BUCKET,
          questionsWithAssets,
          declaredAssets: linked,
        },
        null,
        2
      )
    );
    return;
  }

  for (const question of questions) {
    const assets = question.visual?.assets ?? [];
    if (assets.length === 0) continue;
    questionsWithAssets++;

    const images = [];
    for (const asset of assets) {
      const localPath = path.join(packageRoot, asset.file);
      const storagePath = `${STORAGE_PREFIX}/${asset.file.replace(/^assets\//, "")}`;
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        await bucket.upload(localPath, {
          destination: storagePath,
          metadata: { contentType: "image/png", cacheControl: "public,max-age=31536000" },
        });
        uploaded++;
      }

      const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o/${encodeURIComponent(storagePath)}?alt=media`;
      images.push({
        file: asset.file,
        position: "after_stem",
        originalPage: asset.source_page ?? 0,
        url,
      });
    }

    await db.collection(QUESTIONS_COLLECTION).doc(question.id).set({ images }, { merge: true });
    linked += images.length;
  }

  console.log(`Uploaded new assets: ${uploaded}`);
  console.log(`Linked assets to questions_v2: ${linked}`);
  console.log(`Questions with assets: ${questionsWithAssets}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
