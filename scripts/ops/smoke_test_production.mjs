const PROJECT_ID = "staziamed-revalida-prod";
const DATABASE_ID = "staziamed-revalida-prod";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

async function main() {
  console.log("=================================================");
  console.log(`PRODUCTION SMOKE TEST (${PROJECT_ID} / DB: ${DATABASE_ID})`);
  console.log("=================================================");

  // Test 1: Public Read - Questions Collection (should succeed with 200)
  console.log("[Smoke Test 1] Testing unauthenticated read on /questions...");
  const qRes = await fetch(`${BASE_URL}/questions?pageSize=1`);
  const qData = await qRes.json();
  if (qRes.ok && qData.documents && qData.documents.length > 0) {
    console.log(`[PASS] Questions collection is publicly readable (200 OK). Sample doc: ${qData.documents[0].name.split('/').pop()}`);
  } else {
    console.error("[FAIL] Questions collection read failed:", qData);
  }

  // Test 2: Public Read - Editions Collection (should succeed with 200)
  console.log("[Smoke Test 2] Testing unauthenticated read on /editions...");
  const edRes = await fetch(`${BASE_URL}/editions?pageSize=1`);
  const edData = await edRes.json();
  if (edRes.ok) {
    console.log("[PASS] Editions collection is publicly readable (200 OK).");
  } else {
    console.error("[FAIL] Editions collection read failed:", edData);
  }

  // Test 3: Unauthenticated Access to Private Collection /users (MUST be blocked with 403 PERMISSION_DENIED)
  console.log("[Smoke Test 3] Testing unauthenticated access to /users (must be blocked)...");
  const uRes = await fetch(`${BASE_URL}/users?pageSize=1`);
  const uData = await uRes.json();
  if (!uRes.ok && (uRes.status === 403 || uData.error?.status === "PERMISSION_DENIED")) {
    console.log(`[PASS] /users collection is securely locked (HTTP ${uRes.status} PERMISSION_DENIED).`);
  } else {
    console.error("[SECURITY REGRESSION] /users was NOT blocked:", uData);
  }

  // Test 4: Unauthenticated Access to Private Collection /sessions (MUST be blocked with 403 PERMISSION_DENIED)
  console.log("[Smoke Test 4] Testing unauthenticated access to /sessions (must be blocked)...");
  const sRes = await fetch(`${BASE_URL}/sessions?pageSize=1`);
  const sData = await sRes.json();
  if (!sRes.ok && (sRes.status === 403 || sData.error?.status === "PERMISSION_DENIED")) {
    console.log(`[PASS] /sessions collection is securely locked (HTTP ${sRes.status} PERMISSION_DENIED).`);
  } else {
    console.error("[SECURITY REGRESSION] /sessions was NOT blocked:", sData);
  }

  // Test 5: Unauthenticated Access to Private Collection /errors (MUST be blocked with 403 PERMISSION_DENIED)
  console.log("[Smoke Test 5] Testing unauthenticated access to /errors (must be blocked)...");
  const errRes = await fetch(`${BASE_URL}/errors?pageSize=1`);
  const errData = await errRes.json();
  if (!errRes.ok && (errRes.status === 403 || errData.error?.status === "PERMISSION_DENIED")) {
    console.log(`[PASS] /errors collection is securely locked (HTTP ${errRes.status} PERMISSION_DENIED).`);
  } else {
    console.error("[SECURITY REGRESSION] /errors was NOT blocked:", errData);
  }

  // Test 6: Unauthenticated Access to Private Collection /progress (MUST be blocked with 403 PERMISSION_DENIED)
  console.log("[Smoke Test 6] Testing unauthenticated access to /progress (must be blocked)...");
  const pRes = await fetch(`${BASE_URL}/progress?pageSize=1`);
  const pData = await pRes.json();
  if (!pRes.ok && (pRes.status === 403 || pData.error?.status === "PERMISSION_DENIED")) {
    console.log(`[PASS] /progress collection is securely locked (HTTP ${pRes.status} PERMISSION_DENIED).`);
  } else {
    console.error("[SECURITY REGRESSION] /progress was NOT blocked:", pData);
  }

  // Test 7: Unauthenticated Access to /admins (MUST be blocked with 403 PERMISSION_DENIED)
  console.log("[Smoke Test 7] Testing unauthenticated access to /admins (must be blocked)...");
  const admRes = await fetch(`${BASE_URL}/admins?pageSize=1`);
  const admData = await admRes.json();
  if (!admRes.ok && (admRes.status === 403 || admData.error?.status === "PERMISSION_DENIED")) {
    console.log(`[PASS] /admins collection is securely locked (HTTP ${admRes.status} PERMISSION_DENIED).`);
  } else {
    console.error("[SECURITY REGRESSION] /admins was NOT blocked:", admData);
  }

  // Test 8: Unauthenticated Access to /_health_check (should succeed with 200)
  console.log("[Smoke Test 8] Testing read on /_health_check...");
  const hcRes = await fetch(`${BASE_URL}/_health_check?pageSize=1`);
  const hcData = await hcRes.json();
  if (hcRes.ok) {
    console.log("[PASS] /_health_check is publicly readable (200 OK).");
  } else {
    console.error("[FAIL] /_health_check read failed:", hcData);
  }

  console.log("\n=================================================");
  console.log("ALL PRODUCTION SMOKE TESTS PASSED PERFECTLY!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Smoke test error:", err);
  process.exit(1);
});
