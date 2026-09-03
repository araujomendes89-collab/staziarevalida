# FIRESTORE_RULES_TEST_REPORT.md
# StaziaMed Revalida — Relatório de Testes Reais de Segurança Firestore (Emulator Suite)
**Data:** 2026-09-03  
**Auditor / Executor:** Antigravity Engine  
**Ambiente de Execução:** Firebase Firestore Emulator Suite (Porta 8899)  
**Framework de Testes:** `@firebase/rules-unit-testing` + TypeScript + Node v24  
**Isolamento de Produção:** **100% Isolado** (Host: `127.0.0.1:8899`, Project ID simulado: `staziamed-rules-test-isolated`, nenhum dado de produção foi tocado)

---

## 1. RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| **Total de Cenários Testados** | **64** |
| **Aprovados (PASSED)** | **64 (100%)** |
| **Falhas (FAILED)** | **0 (0%)** |
| **Validação Real no Emulator** | **`EMULATOR_TESTED`** |
| **Classificação Final** | **`EMULATOR_RULES_VERIFIED`** |

---

## 2. CONFIGURAÇÃO DO EMULATOR E ARQUIVOS CRIADOS

### Arquivos Envolvidos
- **Arquivo de Regras Testado:** `firestore.rules`
- **Arquivo de Testes Automatizados:** `test_firestore_rules.ts`
- **Configuração do Emulator (`firebase.json`):**
  ```json
  {
    "firestore": {
      "database": "staziamed-revalida-prod",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    },
    "storage": {
      "rules": "storage.rules"
    },
    "emulators": {
      "firestore": {
        "port": 8899,
        "host": "127.0.0.1"
      },
      "ui": {
        "enabled": false
      }
    }
  }
  ```

### Comando de Execução Utilizado
```bash
firebase emulators:exec --only firestore "npx tsx test_firestore_rules.ts"
```

---

## 3. RESULTADOS DETALHADOS POR CENÁRIO DE TESTE

### Seção 1: Coleção `users` (`/users/{userId}`)

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 1 | USER_A lê seu próprio perfil (`/users/user-a`) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 2 | USER_A tenta ler perfil de USER_B (`/users/user-b`) | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 3 | GUEST tenta ler perfil de USER_A | Não autenticado | DENY | DENY | ✅ PASS |
| 4 | Novo usuário cria seu perfil com `role=STUDENT`, `tier=TRIAL` | Autenticado (`user-new`) | ALLOW | ALLOW | ✅ PASS |
| 5 | Usuário tenta criar perfil com `role=ADMIN` (Privilege Escalation) | Autenticado (`attacker-1`) | DENY | DENY | ✅ PASS |
| 6 | Usuário tenta criar perfil com `tier=PRO` (Privilege Escalation) | Autenticado (`attacker-2`) | DENY | DENY | ✅ PASS |
| 7 | Usuário tenta criar perfil com `tier=PRO_PLUS` (Privilege Escalation) | Autenticado (`attacker-3`) | DENY | DENY | ✅ PASS |
| 8 | Usuário tenta criar perfil com `plan=pro` (Privilege Escalation) | Autenticado (`attacker-4`) | DENY | DENY | ✅ PASS |
| 9 | Usuário tenta criar perfil com `plan=pro_plus` (Privilege Escalation) | Autenticado (`attacker-5`) | DENY | DENY | ✅ PASS |
| 10 | USER_A atualiza campos permitidos (`name`, `graduationUniversity`, `dailyStudyMinutes`, etc.) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 11 | USER_A tenta alterar `role: STUDENT → ADMIN` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 12 | USER_A tenta alterar `role: STUDENT → EDITOR` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 13 | USER_A tenta alterar `tier: TRIAL → PRO` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 14 | USER_A tenta alterar `tier: TRIAL → PRO_PLUS` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 15 | USER_A tenta alterar `plan: trial → pro` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 16 | USER_A tenta alterar data de `subscriptionExpiresAt` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 17 | USER_A tenta estender `trialEndsAt` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 18 | USER_A tenta alterar `planUpdatedAt` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 19 | ADMIN altera `tier` e `plan` de USER_A para PRO | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

### Seção 2: Coleção `sessions` (`/sessions/{sessionId}`)

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 20 | USER_A lê sua própria sessão (`sess-a-1`) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 21 | USER_B tenta ler sessão de USER_A (`sess-a-1`) | Autenticado (`user-b`) | DENY | DENY | ✅ PASS |
| 22 | GUEST tenta ler sessão de USER_A | Não autenticado | DENY | DENY | ✅ PASS |
| 23 | USER_A cria nova sessão com `userId = "user-a"` | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 24 | USER_A tenta criar sessão com `userId = "user-b"` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 25 | USER_A tenta transferir owner da sessão (`user-a → user-b`) | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 26 | ADMIN lê e atualiza sessão de USER_A | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

### Seção 3: Coleção `errors` (`/errors/{errorId}`)

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 27 | USER_A lê seu próprio registro de erro (`err-a-1`) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 28 | USER_B tenta ler registro de erro de USER_A | Autenticado (`user-b`) | DENY | DENY | ✅ PASS |
| 29 | GUEST tenta ler registro de erro de USER_A | Não autenticado | DENY | DENY | ✅ PASS |
| 30 | USER_A cria autópsia de erro com `userId = "user-a"` | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 31 | USER_A tenta criar autópsia de erro com `userId = "user-b"` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 32 | USER_A tenta alterar o `userId` de um erro existente | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 33 | ADMIN lê e atualiza status do erro de USER_A | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

### Seção 4: Coleção `progress` (`/progress/{progressId}`)

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 34 | USER_A lê seu próprio `progress_user-a` | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 35 | USER_A lê seu próprio `bulletin_user-a` | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 36 | USER_B tenta ler `progress_user-a` | Autenticado (`user-b`) | DENY | DENY | ✅ PASS |
| 37 | GUEST tenta ler `progress_user-a` | Não autenticado | DENY | DENY | ✅ PASS |
| 38 | USER_A cria novo documento de progresso com `userId = "user-a"` | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 39 | USER_A tenta criar documento de progresso com `userId = "user-b"` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 40 | USER_A tenta alterar `userId` de documento de progresso | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 41 | ADMIN lê e atualiza documento de progresso de USER_A | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

### Seção 5: Conteúdo Público (`questions`, `editions`, `guidelines`, `knowledge_nodes`)

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 42 | GUEST lê questão oficial (`/questions/REV-2026.1-Q1`) | Não autenticado | ALLOW | ALLOW | ✅ PASS |
| 43 | USER_A lê questão oficial (`/questions/REV-2026.1-Q1`) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 44 | USER_A tenta alterar gabarito em `/questions/REV-2026.1-Q1` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 45 | ADMIN atualiza questão oficial em `/questions/REV-2026.1-Q1` | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |
| 46 | GUEST lê edital em `/editions/rev-2026-1` | Não autenticado | ALLOW | ALLOW | ✅ PASS |
| 47 | USER_A tenta alterar edital em `/editions/rev-2026-1` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 48 | ADMIN atualiza edital em `/editions/rev-2026-1` | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |
| 49 | GUEST lê diretriz em `/guidelines/guideline-pce-2025` | Não autenticado | ALLOW | ALLOW | ✅ PASS |
| 50 | USER_A tenta alterar diretriz em `/guidelines/guideline-pce-2025` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 51 | ADMIN atualiza diretriz em `/guidelines/guideline-pce-2025` | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |
| 52 | GUEST lê nó clínico em `/knowledge_nodes/node-sca` | Não autenticado | ALLOW | ALLOW | ✅ PASS |
| 53 | USER_A tenta alterar nó em `/knowledge_nodes/node-sca` | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 54 | ADMIN atualiza nó em `/knowledge_nodes/node-sca` | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

### Seção 6: Estações OSCE, Admins e Health Check

| # | Cenário Testado | Papel / Contexto | Resultado Esperado | Resultado Real | Status |
|:---:|---|---|:---:|:---:|:---:|
| 55 | GUEST tenta ler estação OSCE (`/osce_stations/osce-station-1`) | Não autenticado | DENY | DENY | ✅ PASS |
| 56 | USER_A autenticado lê estação OSCE (`/osce_stations/osce-station-1`) | Autenticado (`user-a`) | ALLOW | ALLOW | ✅ PASS |
| 57 | USER_A tenta alterar estação OSCE | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 58 | ADMIN atualiza estação OSCE | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |
| 59 | USER_A tenta consultar lista de admins (`/admins/admin-a`) | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 60 | GUEST tenta consultar lista de admins (`/admins/admin-a`) | Não autenticado | DENY | DENY | ✅ PASS |
| 61 | ADMIN lê lista de admins (`/admins/admin-a`) | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |
| 62 | GUEST lê probe de conectividade (`/_health_check/connection`) | Não autenticado | ALLOW | ALLOW | ✅ PASS |
| 63 | USER_A tenta sobrescrever probe de conectividade | Autenticado (`user-a`) | DENY | DENY | ✅ PASS |
| 64 | ADMIN atualiza probe de conectividade | Autenticado (`admin-a`) | ALLOW | ALLOW | ✅ PASS |

---

## 4. CONFIRMAÇÃO DE ISOLAMENTO DE PRODUÇÃO

1. **Host do Emulator:** `127.0.0.1:8899` iniciado via CLI local (`firebase emulators:exec`).
2. **Project ID:** `staziamed-rules-test-isolated`.
3. **Produção Inalterada:** Nenhuma chamada alcançou os servidores remotos do Firebase (`southamerica-east1` / `staziamed-revalida-prod`).
4. **Deploy:** Nenhum deploy foi realizado.

---

## 5. CONCLUSÃO FINAL

As regras de segurança do Cloud Firestore foram **100% validadas contra o motor oficial do Firestore Emulator Suite**, com **zero falhas e zero regressões**.

### Classificação Oficial:
# **`EMULATOR_RULES_VERIFIED`**
