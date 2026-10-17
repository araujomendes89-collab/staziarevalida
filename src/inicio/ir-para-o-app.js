// Página inicial desligada: "/" leva para o app (/novo) com o resto do endereço (?code=, #access_token= dos e-mails).
location.replace("/novo" + location.search + location.hash);
