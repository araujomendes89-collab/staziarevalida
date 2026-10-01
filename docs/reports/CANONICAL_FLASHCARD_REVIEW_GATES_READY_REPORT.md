# Canonical Flashcard Review Gates & READY Workflow (Etapa 1.22N)

## 1. Executive Summary

This report formalizes the successful implementation and verification of **ETAPA 1.22N — CANONICAL FLASHCARD REVIEW GATES & READY WORKFLOW** for the StaziaMed Revalida platform.

In this stage, the multi-stage review pipeline and READY governance transition for canonical flashcards were implemented strictly within the trusted backend server, maintaining total isolation from the public catalog, zero regressions on student read-only access, and full compatibility with local V4 user storage and the FSRS algorithm.

---

## 2. Review Gates & Governance Architecture

Under the current **GENERAL_ADMIN_POLICY (`ADMIN_CAN_PERFORM_ALL_CANONICAL_CONTENT_OPERATIONS`)**, an administrative user (`ADMIN`) possesses authority to advance a canonical flashcard draft across all review gates and promote it to `READY`. Each operation records distinct, immutable audit metadata (`reviewedBy`, `reviewedAt`, `validatedDraftRevision`, `reviewNotes`, `confidenceLevel`, `primarySourceValidated`), ensuring granular accountability.

### Implemented Endpoints & Operations

| Endpoint | HTTP Method | Handler Function | Action / Gate |
| :--- | :--- | :--- | :--- |
| `/api/admin/flashcards/drafts/:contentId/auto-validate` | `POST` | `autoValidateDraft` | Executes automated structural, topic taxonomy, card purpose, and evidence checks. Sets `autoValidationStatus: PASSED \| FAILED`. |
| `/api/admin/flashcards/drafts/:contentId/medical-review` | `POST` | `submitMedicalReview` | Submits medical curation review, confirming clinical accuracy, curriculum relevance, and explicit primary source validation (`primarySourceValidated: true`). |
| `/api/admin/flashcards/drafts/:contentId/editorial-review` | `POST` | `submitEditorialReview` | Submits editorial curation review, confirming adherence to phrasing standards, clarity, tone, and conciseness. |
| `/api/admin/flashcards/drafts/:contentId/ready` | `POST` | `markReady` | Promotes workflow status from `DRAFT` to `READY` after verifying all 3 gates pass and revision binding matches exactly. |

---

## 3. Strict Gate Invariants & Security Boundaries

1. **Exact Revision Binding (`draftRevision` Verification):**
   - Each review gate records the exact `draftRevision` (`validatedDraftRevision`, `reviewedDraftRevision`) it was evaluated against.
   - Any content update (`PATCH /api/admin/flashcards/drafts/:contentId`) increments `draftRevision` ($N \to N+1$), which immediately invalidates previous approvals.
   - Attempting to promote to `READY` when any gate was executed on an earlier revision returns `HTTP 409 CONFLICT`.

2. **Full Gate Precondition for `READY`:**
   - Promotion to `READY` requires:
     1. `autoValidation.status === "PASSED"` and `autoValidation.validatedDraftRevision === draftRevision`
     2. `medicalReview.status === "APPROVED"` and `medicalReview.reviewedDraftRevision === draftRevision` and `medicalReview.primarySourceValidated === true`
     3. `editorialReview.status === "APPROVED"` and `editorialReview.reviewedDraftRevision === draftRevision`
   - If any gate is missing, failed, or stale, the transition is blocked.

3. **Total Isolation from Public Catalog:**
   - **`CANONICAL_ROOT_WRITES_ADDED = 0`**: No writes to `/flashcardContents/{contentId}`.
   - **`PUBLISHED_VERSION_WRITES_ADDED = 0`**: No writes to `/flashcardContents/{contentId}/versions/{versionId}`.
   - All draft and review workflow state lives strictly inside `/flashcardWorkflows/{contentId}`.

4. **Preservation of Local V4 Storage and FSRS:**
   - Zero modifications to client-side flashcard view models (`hydrateFlashcardItem`), storage envelope V4 (`praxis_flashcards_v4`), or FSRS scheduling logic.

---

## 4. Test Suite Accounting & Verification Metrics

```
APP TESTS:
43/43 files PASS
350/350 test cases PASS

SERVER AUTH TESTS:
11/11 PASS

SERVER WORKFLOW TESTS:
19/19 PASS (10 Draft Workflow + 9 Review Gates & READY)

FIRESTORE RULES INVARIANTS:
15/15 verified

CONSOLE ERRORS:
0
```

---

## 5. Architectural Status Classification

```
CANONICAL_FLASHCARD_REVIEW_GATES_READY
```
