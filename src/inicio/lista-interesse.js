// Lista de interesse da 2ª fase — formulário da página inicial. Sem dependências e sem nada inline (CSP: script-src 'self',
// connect-src 'self'). Sem este arquivo o formulário continua funcionando (POST normal → página simples do servidor).
//   - máscara do WhatsApp do Brasil: (11) 98765-4321; outros países sem máscara;
//   - confere os campos antes de enviar (o servidor e o banco conferem de novo);
//   - envia para /api/interesse (mesmo domínio), leva junto os utm_* do endereço da página;
//   - sucesso: troca o formulário por "Pronto!" e, se houver grupo, o botão "Entrar no grupo do WhatsApp" (abre em outra aba);
//   - erro: mensagem em português no próprio formulário (lida pelo leitor de tela).
(function () {
  "use strict";
  var form = document.getElementById("li-form");
  if (!form || !window.fetch) return;
  var pais = document.getElementById("li-pais");
  var zap = document.getElementById("li-whatsapp");
  var email = document.getElementById("li-email");
  var caixa = document.getElementById("li-consentimento");
  var erro = document.getElementById("li-erro");
  var botao = document.getElementById("li-enviar");
  var pronto = document.getElementById("li-pronto");
  var prontoMsg = document.getElementById("li-pronto-msg");
  var grupo = document.getElementById("li-grupo");
  var ROTULO = botao.textContent;
  var EXEMPLO = { "55": "(11) 98765-4321", "595": "981 123456", "591": "71234567", "54": "9 11 2345-6789", outro: "+351 912 345 678" };

  form.setAttribute("novalidate", ""); // a conferência com mensagem em português fica por conta deste arquivo

  function digitos(v) {
    return String(v || "").replace(/\D/g, "");
  }
  // (11) 98765-4321 / (61) 3333-4444 enquanto a pessoa digita (só Brasil e só se não começou com +)
  function mascaraBR(v) {
    if (/^\s*(\+|00)/.test(v)) return v;
    var d = digitos(v).replace(/^0/, "");
    if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    var meio = d.length === 11 ? 7 : 6;
    if (d.length <= meio) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, meio) + "-" + d.slice(meio);
  }
  function whatsappOk() {
    var v = zap.value.trim();
    var d = digitos(v);
    if (/^(\+|00)/.test(v)) return d.length >= 8 && d.length <= 17;
    if (pais.value === "55") {
      d = d.replace(/^0/, "");
      if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
      return /^[1-9][1-9]([2-5]\d{7}|9\d{8})$/.test(d);
    }
    if (pais.value === "outro") return false; // de outro país: precisa do + e do código
    return d.length >= 6 && d.length <= 13;
  }
  function mostrarErro(msg, campo) {
    erro.textContent = msg;
    erro.hidden = false;
    [zap, email, caixa].forEach(function (c) {
      c.removeAttribute("aria-invalid");
    });
    if (campo) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
    }
  }
  function limparErro() {
    erro.hidden = true;
    erro.textContent = "";
  }
  function utm() {
    var out = {};
    try {
      var p = new URLSearchParams(window.location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
        var v = p.get(k);
        if (v) out[k] = v.slice(0, 100);
      });
    } catch (e) {
      /* navegador antigo: sem utm */
    }
    return out;
  }

  pais.addEventListener("change", function () {
    zap.placeholder = EXEMPLO[pais.value] || "";
    if (pais.value === "55") zap.value = mascaraBR(zap.value);
  });
  zap.addEventListener("input", function () {
    if (pais.value !== "55") return;
    var fim = zap.selectionStart === zap.value.length;
    var novo = mascaraBR(zap.value);
    if (novo !== zap.value) {
      zap.value = novo;
      if (fim) zap.setSelectionRange(novo.length, novo.length);
    }
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    limparErro();
    if (!whatsappOk()) {
      return mostrarErro(
        pais.value === "outro"
          ? "Para número de outro país, comece com + e o código do país (ex.: +351 912 345 678)."
          : "Confira o número do WhatsApp com DDD, por exemplo (11) 98765-4321.",
        zap
      );
    }
    var e = email.value.trim();
    if (e && !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(e)) {
      return mostrarErro("Confira o e-mail (exemplo: nome@email.com) ou deixe o campo vazio.", email);
    }
    if (!caixa.checked) return mostrarErro("Marque a caixa de consentimento para entrar na lista.", caixa);

    var dados = {};
    new FormData(form).forEach(function (v, k) {
      dados[k] = v;
    });
    dados.utm = utm();
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    botao.textContent = "Enviando…";
    fetch(form.getAttribute("action") || "/api/interesse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(dados),
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json().then(
          function (j) {
            return { status: res.status, j: j };
          },
          function () {
            return { status: res.status, j: {} };
          }
        );
      })
      .then(function (r) {
        if (r.status === 200 && r.j && r.j.ok) {
          prontoMsg.textContent = r.j.mensagem || "Você está na lista de interesse da 2ª fase.";
          if (r.j.grupo && /^\/api\/interesse\/grupo\?t=[0-9a-f]{64}$/.test(r.j.grupo)) {
            grupo.href = r.j.grupo;
            grupo.hidden = false;
          } else {
            grupo.hidden = true;
          }
          form.hidden = true;
          pronto.hidden = false;
          pronto.focus();
          return;
        }
        mostrarErro((r.j && r.j.error) || "Não deu certo agora. Tente de novo em alguns minutos.");
      })
      .catch(function () {
        mostrarErro("Sem conexão com o servidor. Confira a internet e tente de novo.");
      })
      .then(function () {
        botao.disabled = false;
        botao.removeAttribute("aria-busy");
        botao.textContent = ROTULO;
      });
  });
})();
