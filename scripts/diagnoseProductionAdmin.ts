/**
 * Live Production Admin Identity Forensic Script (Etapa 1.27B.1.8).
 * Queries Firebase Auth and Firestore database 'staziamed-revalida-prod' directly via REST API.
 */

import crypto from "crypto";
import { execSync } from "child_process";

function getGcloudAccessToken(): string {
  return execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
}

function maskUid(uid: string): string {
  if (!uid || uid.length <= 8) return "***";
  return `${uid.substring(0, 6)}...${uid.substring(uid.length - 4)}`;
}

function hashUid(uid: string): string {
  return crypto.createHash("sha256").update(uid).digest("hex");
}

function parseFirestoreFields(fields: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!fields) return result;
  for (const [key, valObj] of Object.entries(fields) as [string, any][]) {
    if (valObj.stringValue !== undefined) result[key] = valObj.stringValue;
    else if (valObj.integerValue !== undefined) result[key] = Number(valObj.integerValue);
    else if (valObj.doubleValue !== undefined) result[key] = Number(valObj.doubleValue);
    else if (valObj.booleanValue !== undefined) result[key] = Boolean(valObj.booleanValue);
    else if (valObj.timestampValue !== undefined) result[key] = valObj.timestampValue;
    else if (valObj.mapValue !== undefined) result[key] = parseFirestoreFields(valObj.mapValue.fields);
    else if (valObj.arrayValue !== undefined) result[key] = (valObj.arrayValue.values || []).map((v: any) => v.stringValue || v);
    else if (valObj.nullValue !== undefined) result[key] = null;
  }
  return result;
}

async function runForensicDiagnosis() {
  const targetEmail = "araujomendes@staziamed.com.br";
  const projectId = "staziamed-revalida-prod";
  const databaseId = "staziamed-revalida-prod";
  const token = getGcloudAccessToken();

  console.log("============================================================");
  console.log("LIVE PRODUCTION ADMIN IDENTITY FORENSIC (REST API)");
  console.log("============================================================");
  console.log(`Target Project:     ${projectId}`);
  console.log(`Target Database:    ${databaseId}`);
  console.log(`Target Email:       ${targetEmail}`);

  // 1. Query Firebase Auth via Identity Toolkit lookup
  let authUser: any = null;
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: [targetEmail],
      }),
    }
  );

  if (lookupRes.ok) {
    const data = await lookupRes.json();
    if (data.users && data.users.length > 0) {
      authUser = data.users[0];
    }
  } else {
    // Try query endpoint
    const queryRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expression: [`email = '${targetEmail}'`],
        }),
      }
    );
    if (queryRes.ok) {
      const qData = await queryRes.json();
      if (qData.users && qData.users.length > 0) {
        authUser = qData.users[0];
      }
    }
  }

  // Also list users to find by email if needed
  if (!authUser) {
    const listRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const matched = (listData.users || []).find((u: any) => u.email?.toLowerCase() === targetEmail.toLowerCase());
      if (matched) authUser = matched;
    }
  }

  if (authUser) {
    console.log("\n--- 1. FIREBASE AUTH RECORD ---");
    console.log(`Auth User Exists:      YES`);
    console.log(`Auth UID (Masked):     ${maskUid(authUser.localId)}`);
    console.log(`Auth UID (SHA-256):    ${hashUid(authUser.localId)}`);
    console.log(`Auth Email:            ${authUser.email}`);
    console.log(`Auth Email Verified:   ${authUser.emailVerified || false}`);
    console.log(`Auth Provider:         ${(authUser.providerUserInfo || []).map((p: any) => p.providerId).join(", ")}`);
    console.log(`Auth Disabled:         ${authUser.disabled || false}`);
    console.log(`Auth Created At:       ${authUser.createdAt}`);
    console.log(`Auth Last Login At:    ${authUser.lastLoginAt}`);
  } else {
    console.log("\n--- 1. FIREBASE AUTH RECORD ---");
    console.log(`Auth User Exists:      NO / Not Found in Firebase Auth`);
  }

  const uid = authUser?.localId;

  // 2. Query Firestore users/{uid} in database 'staziamed-revalida-prod'
  if (uid) {
    console.log(`\n--- 2. FIRESTORE users/{uid} RECORD (db: ${databaseId}) ---`);
    const userDocRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${uid}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (userDocRes.ok) {
      const rawDoc = await userDocRes.json();
      const parsedData = parseFirestoreFields(rawDoc.fields);
      console.log(`Document Exists:       YES (users/${maskUid(uid)})`);
      console.log(`Role in Firestore:     ${parsedData.role}`);
      console.log(`Tier in Firestore:     ${parsedData.tier}`);
      console.log(`Plan in Firestore:     ${parsedData.plan}`);
      console.log(`Name in Firestore:     ${parsedData.name}`);
      console.log(`Email in Firestore:    ${parsedData.email}`);
      console.log(`Updated At:            ${parsedData.updatedAt}`);
      console.log(`Trial Started:         ${parsedData.trialStartedAt}`);
      console.log(`Trial Ends:            ${parsedData.trialEndsAt}`);
      console.log(`Onboarding Done:       ${parsedData.isOnboardingCompleted}`);
    } else {
      console.log(`Document Exists:       NO (users/${maskUid(uid)} returned HTTP ${userDocRes.status})`);
    }

    // 3. Query Firestore admins/{uid}
    console.log(`\n--- 3. FIRESTORE admins/{uid} RECORD (db: ${databaseId}) ---`);
    const adminDocRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/admins/${uid}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (adminDocRes.ok) {
      const rawAdmin = await adminDocRes.json();
      const adminData = parseFirestoreFields(rawAdmin.fields);
      console.log(`Admin Doc Exists:      YES (admins/${maskUid(uid)})`);
      console.log(`Admin Doc Content:     ${JSON.stringify(adminData)}`);
    } else {
      console.log(`Admin Doc Exists:      NO (admins/${maskUid(uid)} returned HTTP ${adminDocRes.status})`);
    }
  }

  // 4. Query Firestore users collection for documents matching this email
  console.log(`\n--- 4. FIRESTORE EMAIL QUERY SCAN (db: ${databaseId}) ---`);
  const queryRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "email" },
              op: "EQUAL",
              value: { stringValue: targetEmail },
            },
          },
        },
      }),
    }
  );

  if (queryRes.ok) {
    const queryData = await queryRes.json();
    const docs = (queryData || []).filter((item: any) => item.document);
    console.log(`Matching users docs by email: ${docs.length}`);
    for (const item of docs) {
      const docName = item.document.name;
      const docId = docName.split("/").pop();
      const parsed = parseFirestoreFields(item.document.fields);
      console.log(`- Doc ID: users/${maskUid(docId)} | Role: ${parsed.role} | Tier: ${parsed.tier} | Plan: ${parsed.plan} | Updated: ${parsed.updatedAt}`);
    }
  } else {
    console.log(`Email Query Failed: HTTP ${queryRes.status}`);
  }

  // 5. Also scan admins collection
  console.log(`\n--- 5. FIRESTORE ADMINS COLLECTION LIST (db: ${databaseId}) ---`);
  const listAdminsRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/admins`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (listAdminsRes.ok) {
    const adminsData = await listAdminsRes.json();
    const adminDocs = adminsData.documents || [];
    console.log(`Total admins docs in collection: ${adminDocs.length}`);
    for (const ad of adminDocs) {
      const docId = ad.name.split("/").pop();
      const parsed = parseFirestoreFields(ad.fields);
      console.log(`- Admin Doc: admins/${maskUid(docId)} | Data: ${JSON.stringify(parsed)}`);
    }
  }

  console.log("\n============================================================");
  console.log("FORENSIC SCAN COMPLETED");
  console.log("============================================================");
}

runForensicDiagnosis().catch((err) => {
  console.error("FATAL ERROR in forensic diagnosis:", err);
  process.exit(1);
});
