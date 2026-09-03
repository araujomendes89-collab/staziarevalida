import { readFileSync } from "fs";
import { execSync } from "child_process";

const PROJECT_ID = "staziamed-revalida-prod";
const RELEASE_NAME = `projects/${PROJECT_ID}/releases/cloud.firestore/${PROJECT_ID}`;

async function main() {
  console.log(`[Deploy] Target Project: ${PROJECT_ID}`);
  console.log(`[Deploy] Reading firestore.rules...`);
  const content = readFileSync("firestore.rules", "utf8");

  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

  // 1. Create Ruleset
  console.log(`[Deploy] Creating new ruleset on Google Cloud Firebase Rules API...`);
  const createRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": PROJECT_ID,
    },
    body: JSON.stringify({
      source: {
        files: [
          {
            name: "firestore.rules",
            content: content,
          },
        ],
      },
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok || !createData.name) {
    console.error("[Deploy ERROR] Failed to create ruleset:", createData);
    process.exit(1);
  }

  const rulesetName = createData.name;
  console.log(`[Deploy] Ruleset created successfully: ${rulesetName}`);
  console.log(`[Deploy] Ruleset timestamp: ${createData.createTime}`);

  // 2. Update Release (UpdateReleaseRequest takes `release: Release`)
  console.log(`[Deploy] Updating release "${RELEASE_NAME}" with new ruleset...`);
  const patchRes = await fetch(`https://firebaserules.googleapis.com/v1/${RELEASE_NAME}?updateMask=ruleset_name`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": PROJECT_ID,
    },
    body: JSON.stringify({
      release: {
        name: RELEASE_NAME,
        rulesetName: rulesetName,
      },
    }),
  });

  const patchData = await patchRes.json();
  if (!patchRes.ok || !patchData.name) {
    console.error("[Deploy ERROR] Failed to update release:", patchData);
    process.exit(1);
  }

  console.log(`[Deploy SUCCESS] Firestore Security Rules deployed successfully.`);
  console.log(`[Deploy SUCCESS] Active Release: ${patchData.name}`);
  console.log(`[Deploy SUCCESS] Active Ruleset: ${patchData.rulesetName}`);
  console.log(`[Deploy SUCCESS] Update Time: ${patchData.updateTime}`);
}

main().catch((err) => {
  console.error("[Deploy FATAL]", err);
  process.exit(1);
});
