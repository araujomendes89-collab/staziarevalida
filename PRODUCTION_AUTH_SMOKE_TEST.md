# PRODUCTION_AUTH_SMOKE_TEST.md
# StaziaMed Revalida — Relatório de Smoke Test e Validação de Fluxos em Produção
**Data:** 2026-09-03  
**Auditor / Executor:** Antigravity Engine  
**Ambiente de Execução:** Produção (`staziamed-revalida-prod` / Região `southamerica-east1`)  
**Banco de Dados:** `staziamed-revalida-prod`  
**Estado das Regras:** `PRODUCTION_RULES_DEPLOYED` (Ruleset: `720cc169-42d5-4e83-894e-cf2f1b2fd4d7`)

---

## 1. RESUMO EXECUTIVO DE FLUXOS POR DOMÍNIO

Em estrita conformidade com a diretriz de **NÃO criar credenciais ou usuários artificiais em produção**:
- Os fluxos públicos e de modo convidado (Guest) foram testados diretamente na aplicação real conectada ao Firestore de produção.
- Os fluxos que exigem uma sessão interativa autenticada via Firebase Auth no browser foram classificados honestamente como `NOT_TESTED` por ausência de login interativo ativo na sessão do navegador de testes, preservando a integridade dos dados reais.

| Domínio | Status | Detalhes da Validação |
|---|:---:|---|
| **QUESTIONS** | **PASS** | Coleção `/questions` carregou 300 questões oficiais sincronizadas em tempo real do Firestore de produção (`REV-2025.1-Q1`, `REV-2026.1-Q1`, etc.). Zero erros. |
| **GUEST** | **PASS** | Modo convidado (`[FirebaseAuth] No active auth session (Guest/Offline state)`) operando com integridade total: nenhuma escrita disparada para coleções privadas, zero erros de `PERMISSION_DENIED`, sem crash. |
| **PROFILE** | **NOT_TESTED** | Documentos reais de perfil inspecionados em produção (`cQjA***xj2`, `E9RI***sJ3`). Sem sessão de login ativa no navegador no momento do teste. |
| **SESSIONS** | **NOT_TESTED** | Coleção `/sessions` vazia em produção. Sem sessão de login ativa para criação/sincronização cloud no browser. |
| **SIMULADOS** | **NOT_TESTED** | Sem sessão de login ativa no navegador de testes. |
| **PROGRESS** | **NOT_TESTED** | Documento real existente em produção (`progress_cQjACVALpedbijS0WiCwuFRJgxj2`) confirmado intacto. Sem sessão ativa para leitura de cliente. |
| **ERRORS** | **NOT_TESTED** | Documento real existente em produção (`err_att-1788399351656` de `cQjA***xj2`) confirmado intacto. Sem sessão ativa para submissão no browser. |
| **ADMIN** | **NOT_TESTED** | Sem sessão com claims de administrador ativa no browser de teste. |

---

## 2. INFORMAÇÕES DE AMBIENTE E USUÁRIOS EM PRODUÇÃO

- **UIDs Identificados em Produção (Mascarados para Segurança):**
  - `cQjACVALp*****************gxj2` (`Dr(a). Candidato(a)`) — Possui registros de progresso e autópsia de erros anteriores.
  - `E9RIC2AbH*****************osJ3` (`Joao Paulo`) — Perfil de estudante.
- **Coleções Acessadas no Smoke Test:**
  - `questions` (Leitura aberta: 300 documentos retornados com HTTP 200)
  - `editions` (Leitura aberta confirmada)
  - `_health_check` (Probe de conectividade: 200 OK)
  - `users`, `sessions`, `errors`, `progress`, `admins` (Bloqueio estrito de acessos não autorizados: HTTP 403 PERMISSION_DENIED confirmado)

---

## 3. LOGS DE CONSOLE E REDE

```
[AppContext] Syncing questions with Firestore...
[FirebaseAuth] No active auth session (Guest/Offline state)
[AppContext] Successfully synced 300 total questions (300 from Firestore).
```

- **Erros `PERMISSION_DENIED` Inesperados:** **0**
- **Erros de Console:** **0**
- **Erros de Rede / Fetch:** **0**
- **Unhandled Promise Rejections:** **0**

---

## 4. CLASSIFICAÇÃO FINAL

Como os fluxos públicos e de Guest foram validados com 100% de sucesso (**PASS**), mas os fluxos autenticados interativos exigem autenticação do usuário final no dispositivo real sem criação de credenciais artificiais:

# **`PRODUCTION_AUTH_INCOMPLETE`**
