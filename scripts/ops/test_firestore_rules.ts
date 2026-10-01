import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "staziamed-rules-test-isolated";

interface TestResult {
  num: number;
  category: string;
  name: string;
  expected: "ALLOW" | "DENY";
  actual: "ALLOW" | "DENY";
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  num: number,
  category: string,
  name: string,
  expected: "ALLOW" | "DENY",
  fn: () => Promise<any>
) {
  try {
    if (expected === "ALLOW") {
      await assertSucceeds(fn());
      results.push({ num, category, name, expected, actual: "ALLOW", passed: true });
      console.log(`[PASS] #${num} ${category}: ${name} -> ALLOW`);
    } else {
      await assertFails(fn());
      results.push({ num, category, name, expected, actual: "DENY", passed: true });
      console.log(`[PASS] #${num} ${category}: ${name} -> DENY`);
    }
  } catch (err: any) {
    const actual = expected === "ALLOW" ? "DENY" : "ALLOW";
    results.push({
      num,
      category,
      name,
      expected,
      actual,
      passed: false,
      error: err?.message || String(err),
    });
    console.error(`[FAIL] #${num} ${category}: ${name} Expected ${expected}, got ${actual}. Error:`, err?.message || err);
  }
}

async function main() {
  console.log("=================================================");
  console.log("STAZIAMED REVALIDA - FIRESTORE SECURITY RULES REAL EMULATOR TEST SUITE");
  console.log("=================================================");

  const rules = readFileSync("firestore.rules", "utf8");

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8899,
    },
  });

  // Setup admin and initial documents using withSecurityRulesDisabled
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // 1. Setup admin doc in /admins/admin-a and /users/admin-a
    await setDoc(doc(db, "admins", "admin-a"), {
      id: "admin-a",
      name: "Dr. Administrador",
      role: "ADMIN",
    });
    await setDoc(doc(db, "users", "admin-a"), {
      id: "admin-a",
      name: "Dr. Administrador",
      email: "admin@med.br",
      role: "ADMIN",
      tier: "ADMIN",
      plan: "admin",
      graduationCountry: "Brasil",
      graduationUniversity: "USP",
      graduationYear: 2020,
      targetEdition: "Revalida 2026/2",
      dailyStudyMinutes: 120,
      availableDaysPerWeek: 6,
      studyStreakDays: 10,
      totalQuestionsSolved: 500,
      overallReadiness: 90,
      projectedPassScoreMin: 80,
      projectedPassScoreMax: 95,
      isOnboardingCompleted: true,
    });

    // 2. Setup user-a and user-b profiles
    await setDoc(doc(db, "users", "user-a"), {
      id: "user-a",
      name: "Candidato A",
      email: "a@med.br",
      role: "STUDENT",
      tier: "TRIAL",
      plan: "trial",
      graduationCountry: "Brasil",
      graduationUniversity: "UFRJ",
      graduationYear: 2024,
      targetEdition: "Revalida 2026/2",
      dailyStudyMinutes: 90,
      availableDaysPerWeek: 5,
      studyStreakDays: 3,
      totalQuestionsSolved: 50,
      overallReadiness: 65,
      projectedPassScoreMin: 60,
      projectedPassScoreMax: 70,
      isOnboardingCompleted: true,
      trialStartedAt: "2026-09-01T00:00:00.000Z",
      trialEndsAt: "2026-09-08T00:00:00.000Z",
    });

    await setDoc(doc(db, "users", "user-b"), {
      id: "user-b",
      name: "Candidato B",
      email: "b@med.br",
      role: "STUDENT",
      tier: "TRIAL",
      plan: "trial",
      graduationCountry: "Bolívia",
      graduationUniversity: "UDABOL",
      graduationYear: 2023,
      targetEdition: "Revalida 2026/2",
      dailyStudyMinutes: 60,
      availableDaysPerWeek: 4,
      studyStreakDays: 1,
      totalQuestionsSolved: 20,
      overallReadiness: 55,
      projectedPassScoreMin: 50,
      projectedPassScoreMax: 60,
      isOnboardingCompleted: true,
    });

    // 3. Setup sessions
    await setDoc(doc(db, "sessions", "sess-a-1"), {
      id: "sess-a-1",
      userId: "user-a",
      mode: "SIMULADO",
      questionIds: ["REV-2026.1-Q1"],
      startTime: "2026-09-03T10:00:00.000Z",
      isCompleted: false,
      title: "Simulado 1",
    });

    // 4. Setup errors
    await setDoc(doc(db, "errors", "err-a-1"), {
      id: "err-a-1",
      userId: "user-a",
      questionId: "REV-2026.1-Q1",
      area: "CLINICA_MEDICA",
      topic: "Cardiologia",
      selectedOption: "B",
      correctOption: "A",
      errorReason: "KNOWLEDGE_GAP",
      timestamp: "2026-09-03T10:15:00.000Z",
    });

    // 5. Setup progress
    await setDoc(doc(db, "progress", "progress_user-a"), {
      id: "progress_user-a",
      userId: "user-a",
      overallReadiness: 65,
    });

    await setDoc(doc(db, "progress", "bulletin_user-a"), {
      id: "bulletin_user-a",
      userId: "user-a",
      score: 65,
    });

    // 6. Setup public content
    await setDoc(doc(db, "questions", "REV-2026.1-Q1"), {
      id: "REV-2026.1-Q1",
      code: "REV-2026.1-Q1",
      clinicalCase: "Paciente 45 anos...",
      correctAnswer: "A",
    });

    await setDoc(doc(db, "editions", "rev-2026-1"), {
      id: "rev-2026-1",
      year: 2026,
      editionLabel: "2026/1",
    });

    await setDoc(doc(db, "guidelines", "guideline-pce-2025"), {
      id: "guideline-pce-2025",
      title: "Diretriz Pré-Eclâmpsia 2025",
    });

    await setDoc(doc(db, "knowledge_nodes", "node-sca"), {
      id: "node-sca",
      title: "Síndrome Coronariana Aguda",
    });

    await setDoc(doc(db, "osce_stations", "osce-station-1"), {
      id: "osce-station-1",
      title: "Estação Parada Cardiorrespiratória",
    });

    await setDoc(doc(db, "_health_check", "connection"), {
      status: "healthy",
    });
  });

  const userAContext = testEnv.authenticatedContext("user-a");
  const userBContext = testEnv.authenticatedContext("user-b");
  const adminContext = testEnv.authenticatedContext("admin-a");
  const unauthContext = testEnv.unauthenticatedContext();

  const dbA = userAContext.firestore();
  const dbB = userBContext.firestore();
  const dbAdmin = adminContext.firestore();
  const dbGuest = unauthContext.firestore();

  // ==========================================
  // SECTION 1: USERS COLLECTION
  // ==========================================
  await runTest(1, "USERS", "USER_A reads own profile (/users/user-a)", "ALLOW", () =>
    getDoc(doc(dbA, "users", "user-a"))
  );

  await runTest(2, "USERS", "USER_A tries to read USER_B profile (/users/user-b)", "DENY", () =>
    getDoc(doc(dbA, "users", "user-b"))
  );

  await runTest(3, "USERS", "GUEST tries to read USER_A profile", "DENY", () =>
    getDoc(doc(dbGuest, "users", "user-a"))
  );

  await runTest(4, "USERS", "USER_A creates new profile with role=STUDENT, tier=TRIAL", "ALLOW", () => {
    const freshUserCtx = testEnv.authenticatedContext("user-new");
    return setDoc(doc(freshUserCtx.firestore(), "users", "user-new"), {
      id: "user-new",
      name: "Novo Aluno",
      email: "novo@med.br",
      role: "STUDENT",
      tier: "TRIAL",
      plan: "trial",
    });
  });

  await runTest(5, "USERS", "USER_A tries to create profile with role=ADMIN (Privilege Escalation)", "DENY", () => {
    const ctx = testEnv.authenticatedContext("attacker-1");
    return setDoc(doc(ctx.firestore(), "users", "attacker-1"), {
      id: "attacker-1",
      name: "Attacker",
      email: "atk@med.br",
      role: "ADMIN",
    });
  });

  await runTest(6, "USERS", "USER_A tries to create profile with tier=PRO (Privilege Escalation)", "DENY", () => {
    const ctx = testEnv.authenticatedContext("attacker-2");
    return setDoc(doc(ctx.firestore(), "users", "attacker-2"), {
      id: "attacker-2",
      name: "Attacker",
      email: "atk@med.br",
      role: "STUDENT",
      tier: "PRO",
    });
  });

  await runTest(7, "USERS", "USER_A tries to create profile with tier=PRO_PLUS (Privilege Escalation)", "DENY", () => {
    const ctx = testEnv.authenticatedContext("attacker-3");
    return setDoc(doc(ctx.firestore(), "users", "attacker-3"), {
      id: "attacker-3",
      name: "Attacker",
      email: "atk@med.br",
      role: "STUDENT",
      tier: "PRO_PLUS",
    });
  });

  await runTest(8, "USERS", "USER_A tries to create profile with plan=pro (Privilege Escalation)", "DENY", () => {
    const ctx = testEnv.authenticatedContext("attacker-4");
    return setDoc(doc(ctx.firestore(), "users", "attacker-4"), {
      id: "attacker-4",
      name: "Attacker",
      email: "atk@med.br",
      role: "STUDENT",
      plan: "pro",
    });
  });

  await runTest(9, "USERS", "USER_A tries to create profile with plan=pro_plus (Privilege Escalation)", "DENY", () => {
    const ctx = testEnv.authenticatedContext("attacker-5");
    return setDoc(doc(ctx.firestore(), "users", "attacker-5"), {
      id: "attacker-5",
      name: "Attacker",
      email: "atk@med.br",
      role: "STUDENT",
      plan: "pro_plus",
    });
  });

  await runTest(10, "USERS", "USER_A updates common fields (name, graduationUniversity, dailyStudyMinutes)", "ALLOW", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      name: "Dr. Candidato A Atualizado",
      graduationUniversity: "USP Ribeirão",
      dailyStudyMinutes: 120,
      availableDaysPerWeek: 6,
    })
  );

  await runTest(11, "USERS", "USER_A tries to update role: STUDENT -> ADMIN", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      role: "ADMIN",
    })
  );

  await runTest(12, "USERS", "USER_A tries to update role: STUDENT -> EDITOR", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      role: "EDITOR",
    })
  );

  await runTest(13, "USERS", "USER_A tries to update tier: TRIAL -> PRO", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      tier: "PRO",
    })
  );

  await runTest(14, "USERS", "USER_A tries to update tier: TRIAL -> PRO_PLUS", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      tier: "PRO_PLUS",
    })
  );

  await runTest(15, "USERS", "USER_A tries to update plan: trial -> pro", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      plan: "pro",
    })
  );

  await runTest(16, "USERS", "USER_A tries to update subscriptionExpiresAt", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      subscriptionExpiresAt: "2030-01-01T00:00:00.000Z",
    })
  );

  await runTest(17, "USERS", "USER_A tries to extend trialEndsAt", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      trialEndsAt: "2030-01-01T00:00:00.000Z",
    })
  );

  await runTest(18, "USERS", "USER_A tries to alter planUpdatedAt", "DENY", () =>
    updateDoc(doc(dbA, "users", "user-a"), {
      planUpdatedAt: "2026-09-03T12:00:00.000Z",
    })
  );

  await runTest(19, "USERS", "ADMIN updates USER_A tier and plan to PRO", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "users", "user-a"), {
      tier: "PRO",
      plan: "pro",
      subscriptionExpiresAt: "2027-09-03T00:00:00.000Z",
    })
  );

  // ==========================================
  // SECTION 2: SESSIONS COLLECTION
  // ==========================================
  await runTest(20, "SESSIONS", "USER_A reads own session (sess-a-1)", "ALLOW", () =>
    getDoc(doc(dbA, "sessions", "sess-a-1"))
  );

  await runTest(21, "SESSIONS", "USER_B tries to read USER_A session (sess-a-1)", "DENY", () =>
    getDoc(doc(dbB, "sessions", "sess-a-1"))
  );

  await runTest(22, "SESSIONS", "GUEST tries to read USER_A session", "DENY", () =>
    getDoc(doc(dbGuest, "sessions", "sess-a-1"))
  );

  await runTest(23, "SESSIONS", "USER_A creates new session with userId=user-a", "ALLOW", () =>
    setDoc(doc(dbA, "sessions", "sess-a-new"), {
      id: "sess-a-new",
      userId: "user-a",
      mode: "ESTUDO",
      questionIds: ["REV-2026.1-Q1"],
      startTime: new Date().toISOString(),
      isCompleted: false,
    })
  );

  await runTest(24, "SESSIONS", "USER_A tries to create session with userId=user-b", "DENY", () =>
    setDoc(doc(dbA, "sessions", "sess-fake-b"), {
      id: "sess-fake-b",
      userId: "user-b",
      mode: "ESTUDO",
      questionIds: ["REV-2026.1-Q1"],
      startTime: new Date().toISOString(),
      isCompleted: false,
    })
  );

  await runTest(25, "SESSIONS", "USER_A tries to change session owner from user-a to user-b", "DENY", () =>
    updateDoc(doc(dbA, "sessions", "sess-a-1"), {
      userId: "user-b",
    })
  );

  await runTest(26, "SESSIONS", "ADMIN reads and modifies USER_A session", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "sessions", "sess-a-1"), {
      isCompleted: true,
      lastUpdated: new Date().toISOString(),
    })
  );

  // ==========================================
  // SECTION 3: ERRORS COLLECTION
  // ==========================================
  await runTest(27, "ERRORS", "USER_A reads own error autopsy (err-a-1)", "ALLOW", () =>
    getDoc(doc(dbA, "errors", "err-a-1"))
  );

  await runTest(28, "ERRORS", "USER_B tries to read USER_A error autopsy", "DENY", () =>
    getDoc(doc(dbB, "errors", "err-a-1"))
  );

  await runTest(29, "ERRORS", "GUEST tries to read USER_A error autopsy", "DENY", () =>
    getDoc(doc(dbGuest, "errors", "err-a-1"))
  );

  await runTest(30, "ERRORS", "USER_A creates error autopsy with userId=user-a", "ALLOW", () =>
    setDoc(doc(dbA, "errors", "err-a-2"), {
      id: "err-a-2",
      userId: "user-a",
      questionId: "REV-2026.1-Q1",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      selectedOption: "C",
      correctOption: "D",
      errorReason: "DISTRACTOR_TRAP",
      timestamp: new Date().toISOString(),
    })
  );

  await runTest(31, "ERRORS", "USER_A tries to create error autopsy with userId=user-b", "DENY", () =>
    setDoc(doc(dbA, "errors", "err-b-fake"), {
      id: "err-b-fake",
      userId: "user-b",
      questionId: "REV-2026.1-Q1",
      area: "CIRURGIA_GERAL",
      topic: "Trauma",
      selectedOption: "C",
      correctOption: "D",
      errorReason: "DISTRACTOR_TRAP",
      timestamp: new Date().toISOString(),
    })
  );

  await runTest(32, "ERRORS", "USER_A tries to alter error autopsy userId", "DENY", () =>
    updateDoc(doc(dbA, "errors", "err-a-1"), {
      userId: "user-b",
    })
  );

  await runTest(33, "ERRORS", "ADMIN reads and modifies error autopsy", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "errors", "err-a-1"), {
      resolutionStatus: "MASTERED",
    })
  );

  // ==========================================
  // SECTION 4: PROGRESS COLLECTION
  // ==========================================
  await runTest(34, "PROGRESS", "USER_A reads own progress_user-a", "ALLOW", () =>
    getDoc(doc(dbA, "progress", "progress_user-a"))
  );

  await runTest(35, "PROGRESS", "USER_A reads own bulletin_user-a", "ALLOW", () =>
    getDoc(doc(dbA, "progress", "bulletin_user-a"))
  );

  await runTest(36, "PROGRESS", "USER_B tries to read progress_user-a", "DENY", () =>
    getDoc(doc(dbB, "progress", "progress_user-a"))
  );

  await runTest(37, "PROGRESS", "GUEST tries to read progress_user-a", "DENY", () =>
    getDoc(doc(dbGuest, "progress", "progress_user-a"))
  );

  await runTest(38, "PROGRESS", "USER_A creates new progress with userId=user-a", "ALLOW", () =>
    setDoc(doc(dbA, "progress", "progress_user-a_new"), {
      userId: "user-a",
      overallReadiness: 70,
    })
  );

  await runTest(39, "PROGRESS", "USER_A tries to create progress with userId=user-b", "DENY", () =>
    setDoc(doc(dbA, "progress", "progress_user-b_fake"), {
      userId: "user-b",
      overallReadiness: 70,
    })
  );

  await runTest(40, "PROGRESS", "USER_A tries to alter progress userId", "DENY", () =>
    updateDoc(doc(dbA, "progress", "progress_user-a"), {
      userId: "user-b",
    })
  );

  await runTest(41, "PROGRESS", "ADMIN reads and modifies progress_user-a", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "progress", "progress_user-a"), {
      overallReadiness: 85,
    })
  );

  // ==========================================
  // SECTION 5: QUESTIONS COLLECTION (PUBLIC READ / ADMIN WRITE)
  // ==========================================
  await runTest(42, "QUESTIONS", "GUEST reads /questions/REV-2026.1-Q1", "ALLOW", () =>
    getDoc(doc(dbGuest, "questions", "REV-2026.1-Q1"))
  );

  await runTest(43, "QUESTIONS", "USER_A reads /questions/REV-2026.1-Q1", "ALLOW", () =>
    getDoc(doc(dbA, "questions", "REV-2026.1-Q1"))
  );

  await runTest(44, "QUESTIONS", "USER_A tries to write to /questions/REV-2026.1-Q1", "DENY", () =>
    updateDoc(doc(dbA, "questions", "REV-2026.1-Q1"), {
      correctAnswer: "B",
    })
  );

  await runTest(45, "QUESTIONS", "ADMIN writes to /questions/REV-2026.1-Q1", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "questions", "REV-2026.1-Q1"), {
      officialStatus: "valid",
    })
  );

  // ==========================================
  // SECTION 6: PUBLIC CONTENT (EDITIONS, GUIDELINES, KNOWLEDGE_NODES, BRAZIL_MEDICINE)
  // ==========================================
  await runTest(46, "EDITIONS", "GUEST reads /editions/rev-2026-1", "ALLOW", () =>
    getDoc(doc(dbGuest, "editions", "rev-2026-1"))
  );

  await runTest(47, "EDITIONS", "USER_A tries to write to /editions/rev-2026-1", "DENY", () =>
    updateDoc(doc(dbA, "editions", "rev-2026-1"), {
      year: 2027,
    })
  );

  await runTest(48, "EDITIONS", "ADMIN writes to /editions/rev-2026-1", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "editions", "rev-2026-1"), {
      updatedAt: new Date().toISOString(),
    })
  );

  await runTest(49, "GUIDELINES", "GUEST reads /guidelines/guideline-pce-2025", "ALLOW", () =>
    getDoc(doc(dbGuest, "guidelines", "guideline-pce-2025"))
  );

  await runTest(50, "GUIDELINES", "USER_A tries to write to /guidelines/guideline-pce-2025", "DENY", () =>
    updateDoc(doc(dbA, "guidelines", "guideline-pce-2025"), {
      status: "SUPERSEDED",
    })
  );

  await runTest(51, "GUIDELINES", "ADMIN writes to /guidelines/guideline-pce-2025", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "guidelines", "guideline-pce-2025"), {
      status: "CURRENT",
    })
  );

  await runTest(52, "KNOWLEDGE_NODES", "GUEST reads /knowledge_nodes/node-sca", "ALLOW", () =>
    getDoc(doc(dbGuest, "knowledge_nodes", "node-sca"))
  );

  await runTest(53, "KNOWLEDGE_NODES", "USER_A tries to write to /knowledge_nodes/node-sca", "DENY", () =>
    updateDoc(doc(dbA, "knowledge_nodes", "node-sca"), {
      title: "Hacked",
    })
  );

  await runTest(54, "KNOWLEDGE_NODES", "ADMIN writes to /knowledge_nodes/node-sca", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "knowledge_nodes", "node-sca"), {
      title: "Síndrome Coronariana Aguda Oficial",
    })
  );

  // ==========================================
  // SECTION 7: OSCE STATIONS (AUTHENTICATED READ / ADMIN WRITE)
  // ==========================================
  await runTest(55, "OSCE", "GUEST tries to read /osce_stations/osce-station-1", "DENY", () =>
    getDoc(doc(dbGuest, "osce_stations", "osce-station-1"))
  );

  await runTest(56, "OSCE", "USER_A (authenticated) reads /osce_stations/osce-station-1", "ALLOW", () =>
    getDoc(doc(dbA, "osce_stations", "osce-station-1"))
  );

  await runTest(57, "OSCE", "USER_A tries to write to /osce_stations/osce-station-1", "DENY", () =>
    updateDoc(doc(dbA, "osce_stations", "osce-station-1"), {
      title: "Hacked OSCE",
    })
  );

  await runTest(58, "OSCE", "ADMIN writes to /osce_stations/osce-station-1", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "osce_stations", "osce-station-1"), {
      title: "Estação PCR Validada",
    })
  );

  // ==========================================
  // SECTION 8: ADMINS COLLECTION & HEALTH CHECK
  // ==========================================
  await runTest(59, "ADMINS", "USER_A tries to read /admins/admin-a directly", "DENY", () =>
    getDoc(doc(dbA, "admins", "admin-a"))
  );

  await runTest(60, "ADMINS", "GUEST tries to read /admins/admin-a directly", "DENY", () =>
    getDoc(doc(dbGuest, "admins", "admin-a"))
  );

  await runTest(61, "ADMINS", "ADMIN reads /admins/admin-a", "ALLOW", () =>
    getDoc(doc(dbAdmin, "admins", "admin-a"))
  );

  await runTest(62, "HEALTH_CHECK", "GUEST reads /_health_check/connection", "ALLOW", () =>
    getDoc(doc(dbGuest, "_health_check", "connection"))
  );

  await runTest(63, "HEALTH_CHECK", "USER_A tries to write /_health_check/connection", "DENY", () =>
    updateDoc(doc(dbA, "_health_check", "connection"), {
      status: "tampered",
    })
  );

  await runTest(64, "HEALTH_CHECK", "ADMIN writes /_health_check/connection", "ALLOW", () =>
    updateDoc(doc(dbAdmin, "_health_check", "connection"), {
      status: "verified",
    })
  );

  // Cleanup test environment
  await testEnv.cleanup();

  // Print Summary
  console.log("\n=================================================");
  console.log("FINAL TEST SUITE SUMMARY");
  console.log("=================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);

  if (failed === 0) {
    console.log("\n>>> CLASSIFICATION: EMULATOR_RULES_VERIFIED <<<");
  } else {
    console.log("\n>>> CLASSIFICATION: EMULATOR_RULES_FAILED <<<");
  }
}

main().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
