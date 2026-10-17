# Limpeza pedida pelo dono (17/10, noite): correções 2-5 nas duas versões; marcas de revisão só na versão do advogado.
import re, sys, os
F = "/Volumes/StaziaMed/.tmp-aulas/juridico/FINAL"
REPO = sys.argv[1]
def ler(n): return open(os.path.join(F, n), encoding="utf-8").read()
def troca(s, a, b, n=1):
    assert s.count(a) == n, (a[:70], s.count(a)); return s.replace(a, b)

def reordenar(s, inicio, fim, ordem):
    """Reordena os parágrafos (separados por linha vazia) entre os títulos `inicio` e `fim`, pela lista de números."""
    i = s.index(inicio) + len(inicio); j = s.index(fim)
    meio = s[i:j].strip("\n").split("\n\n")
    num = {p.split(" ", 1)[0]: p for p in meio}
    assert sorted(num) == sorted(ordem), (sorted(num), ordem)
    return s[:i] + "\n\n" + "\n\n".join(num[k] for k in ordem) + "\n\n" + s[j:]

# ---------------- Contrato
c = ler("contrato-assinatura-v3.0.md")
c = troca(c, 'com o texto "Li e aceito os Termos de Uso e o Contrato de Assinatura e declaro ter acesso à Política de Privacidade", e clica',
             'com o texto "Li e aceito os Termos de Uso e o Contrato de Assinatura, declaro ter acesso à Política de Privacidade e declaro ter 18 anos ou mais", e clica')
c = troca(c, "× preço do pacote × 0,90 Os **minutos de voz ao vivo**", "× preço do pacote × 0,90. Os **minutos de voz ao vivo**")
c = troca(c, "minutos não usados ÷ minutos do pacote × preço × 0,90.. Os créditos", "minutos não usados ÷ minutos do pacote × preço × 0,90. Os créditos")
c = reordenar(c, "## 18. TUTOR DE INTELIGÊNCIA ARTIFICIAL", "## 19. PERSONALIDADES",
              ["18.1.", "18.2.", "18.3.", "18.4.", "18.5.", "18.6.", "18.7.", "18.8.", "18.9.", "18.10.", "18.11.", "18.12.", "18.13.", "18.14."])
c = reordenar(c, "## 22. TREINO EM DUPLA, MATCH, RADAR E COMUNIDADE", "## 23. EMPRESAS PARCEIRAS",
              ["22.1.", "22.1-A.", "22.1-B.", "22.2.", "22.3.", "22.3-A.", "22.4.", "22.5.", "22.6."])

# cartão de débito liberado pelo dono (17/10, noite): à vista; renovação automática só no cartão de crédito
c = troca(c, "| Renovação | No cartão, a assinatura renova sozinha a cada período até você cancelar. Você é avisado antes. (cláusula 10) |",
             "| Renovação | No cartão de crédito, a assinatura renova sozinha a cada período até você cancelar. No Pix e no cartão de débito, cada período é pago na hora. Você é avisado antes. (cláusula 10) |")
c = troca(c, "por **instituição de pagamento terceira**, **sempre à vista**, por **cartão de crédito ou Pix**. **Não há parcelamento nem boleto**; o plano trimestral é pago de uma vez.",
             "por **instituição de pagamento terceira**, por **Pix, cartão de crédito ou cartão de débito, sempre à vista**. **A renovação automática é feita só no cartão de crédito; no Pix e no cartão de débito, cada período é pago na hora.** **Não há parcelamento nem boleto**; o plano trimestral é pago de uma vez.")
c = troca(c, "10.1. Pagando no **cartão**, a assinatura **renova automaticamente** por períodos iguais (um mês ou um trimestre) até o cancelamento, pelo mesmo preço vigente, salvo reajuste informado conforme a cláusula 16.",
             "10.1. Pagando no **cartão de crédito**, a assinatura **renova automaticamente** por períodos iguais (um mês ou um trimestre) até o cancelamento, pelo mesmo preço vigente, salvo reajuste informado conforme a cláusula 16. No **Pix** e no **cartão de débito** não há renovação automática: cada período é pago na hora.")
c = troca(c, "10.3. Pagando por **Pix**, a Stazia gera a **cobrança 7 dias antes do vencimento**, para dar tempo de compensar, e avisa você (não há débito automático). No **cartão**, a cobrança é feita **no dia da renovação**.",
             "10.3. Pagando por **Pix** ou **cartão de débito**, a Stazia gera a **cobrança 7 dias antes do vencimento**, para dar tempo de compensar, e avisa você (não há cobrança automática). No **cartão de crédito**, a cobrança é feita **no dia da renovação**.")
c = troca(c, "em caso de **arrependimento (7 dias) pago no cartão**, a Stazia comunica", "em caso de **arrependimento (7 dias) pago no cartão de crédito**, a Stazia comunica")
c = troca(c, "Nos **demais cancelamentos** e nos pagamentos por **Pix**, a devolução", "Nos **demais cancelamentos** e nos pagamentos por **Pix** ou **cartão de débito**, a devolução")
c = troca(c, "No arrependimento pago no cartão, o valor aparece", "No arrependimento pago no cartão de crédito, o valor aparece")

# ---------------- Política
p = ler("politica-privacidade-v3.0-integral.md")
p = troca(p, "Os fornecedores de IA e voz dos tutores estão nomeados na seção 3.", "Os fornecedores de IA e voz dos tutores estão descritos por categoria na seção 3.")
p = troca(p, "Cobranças por Pix geram uma nova cobrança a cada renovação, e o acesso é liberado pela confirmação de pagamento que ela envia.",
             "O pagamento é sempre à vista, por Pix, cartão de crédito ou cartão de débito. Só o cartão de crédito renova automaticamente; no Pix e no cartão de débito, cada período gera uma nova cobrança, paga na hora, e o acesso é liberado pela confirmação de pagamento que ela envia.")
p = troca(p, "com pelo menos 30 dias de antecedência** O aviso é enviado automaticamente.", "com pelo menos 30 dias de antecedência**. O aviso é enviado automaticamente.")

# ---------------- Regulamento
r = ler("regulamento-coins-ligas-beneficios-v1.0.md")
r = troca(r, "3.5. **Sons e celebrações.**", "3.4. **Sons e celebrações.**")
r = troca(r, "3.6. **Treino sozinho (2ª fase).**", "3.5. **Treino sozinho (2ª fase).**")
r = troca(r, '(por exemplo, itens de personalização, benefícios de parceiros ou desconto em pacotes) As trocas são "a definir" e serão anunciadas com **30 dias de aviso**.. As trocas valem',
             '(por exemplo, itens de personalização, benefícios de parceiros ou desconto em pacotes). As opções de troca de Coins serão anunciadas no app, com as regras de cada uma, com **30 dias de aviso** antes de ficarem disponíveis. As trocas valem')

def limpar(s):
    """Versão do aluno: sem o aviso interno do topo e sem as marcas de revisão; as citações de lei ficam."""
    linhas = s.split("\n")
    assert linhas[0].startswith("> **VERSÃO PARA REVISÃO FINAL DO ADVOGADO.**") and linhas[1] == ""
    s = "\n".join(linhas[2:])
    s = s.replace(" (conferir Decreto 7.962/2013).", " (Decreto 7.962/2013).")
    s = s.replace(" [conferir]", "")
    s = s.replace("; conferir)", ")")
    s = s.replace("; conferir.", ".")
    s = s.replace("(Código Civil, art. 107; Medida Provisória 2.200-2/2001, art. 10, § 2º; conferir)", "(Código Civil, art. 107; Medida Provisória 2.200-2/2001, art. 10, § 2º)")
    s = s.replace("(CDC, art. 54, § 4º; conferir)", "(CDC, art. 54, § 4º)")
    resto = [m.start() for m in re.finditer(r"conferir|\[A DEFINIR|A CONFIRMAR|【|\ba definir\b", s, re.I)]
    assert not resto, [s[max(0, k - 60):k + 30] for k in resto]
    return s

saidas = {"contrato-assinatura-v3.0": (c, "contrato-v3.0.md"), "politica-privacidade-v3.0-integral": (p, "politica-privacidade-v3.0.md"),
          "regulamento-coins-ligas-beneficios-v1.0": (r, "regulamento-v1.0.md")}
for base, (texto, repo) in saidas.items():
    open(os.path.join(F, f"{base}-advogado.md"), "w", encoding="utf-8").write(texto)
    aluno = limpar(texto)
    open(os.path.join(F, f"{base}-aluno.md"), "w", encoding="utf-8").write(aluno)
    open(os.path.join(REPO, "src/novo/app/legal/textos", repo), "w", encoding="utf-8").write(aluno)
    print(base, "marcas no advogado:", len(re.findall("conferir", texto)), "| aluno:", len(aluno), "caracteres")
