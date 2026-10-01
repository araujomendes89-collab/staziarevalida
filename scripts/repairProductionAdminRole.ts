/**
 * Production Admin Role Repair Script (Etapa 1.27B.1.8).
 * Ensures users/{uid} has role = 'ADMIN' and creates admins/{uid}
 * in database 'staziamed-revalida-prod' using active gcloud credentials.
 */

import { execSync } from "child_process";

function getGcloudAccessToken(): string {
  return execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
}

function maskUid(uid: string): string {
  if (!uid || uid.length <= 8) return "***";
  return `${uid.substring(0, 6)}...${uid.substring(uid.length - 4)}`;
}

async function repairAdminRole() {
  const projectId = "staziamed-revalida-prod";
  const databaseId = "staziamed-revalida-prod";
  const targetUid = "cQjACVALpedbijS0WiCwuFRJgxj2";
  const token = getGcloudAccessToken();

  console.log("============================================================");
  console.log("PRODUCTION ADMIN ROLE REPAIR & STABILIZATION");
  console.log("============================================================");
  console.log(`Target Project:  ${projectId}`);
  console.log(`Target Database: ${databaseId}`);
  console.log(`Target UID:      users/${maskUid(targetUid)}`);

  const nowIso = new Date().toISOString();

  // 1. Update users/{uid} with patch (merge update, preserving all other fields)
  console.log("\n1. Updating users/{uid} with role: 'ADMIN'...");
  const updateRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${targetUid}?updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          role: { stringValue: "ADMIN" },
          updatedAt: { stringValue: nowIso },
        },
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Failed to update users/${targetUid}: HTTP ${updateRes.status} - ${errText}`);
  }
  console.log("users/{uid} updated successfully.");

  // 2. Create admins/{uid} document for fast existence check in security rules and app context
  console.log("\n2. Creating admins/{uid} authoritative document...");
  const adminDocRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/admins/${targetUid}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          role: { stringValue: "ADMIN" },
          email: { stringValue: "araujomendes@staziamed.com.br" },
          grantedAt: { stringValue: nowIso },
          updatedAt: { stringValue: nowIso },
        },
      }),
    }
  );

  if (!adminDocRes.ok) {
    const errText = await adminDocRes.text();
    throw new Error(`Failed to set admins/${targetUid}: HTTP ${adminDocRes.status} - ${errText}`);
  }
  console.log("admins/{uid} created successfully.");

  // 3. Verification read
  console.log("\n3. Verifying updated Firestore documents...");
  const verifyUserRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${targetUid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const userDoc = await verifyUserRes.json();
  console.log(`Verified users/${maskUid(targetUid)}: role = ${userDoc.fields?.role?.stringValue}`);

  const verifyAdminRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/admins/${targetUid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const adminDoc = await verifyAdminRes.json();
  console.log(`Verified admins/${maskUid(targetUid)}: role = ${adminDoc.fields?.role?.stringValue}`);

  console.log("\n============================================================");
  console.log("REPAIR COMPLETED SUCCESSFULLY");
  console.log("============================================================");
}

repairAdminRole().catch((err) => {
  console.error("REPAIR FAILED:", err);
  process.exit(1);
});
