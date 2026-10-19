// Treino em Dupla · entrada na estação (dono, 19/10): o candidato fica de frente para a porta da área e, ao iniciar, o apito e a
// porta abrindo acontecem juntos, pelo relógio do SERVIDOR. A migração 014150 grava started_at = toque do ator + 2 s.

/** Duração do apito (playWhistle, sound.js) e da porta abrindo, em ms. A 014150 usa o mesmo valor ("interval '2 seconds'"). */
export const APITO_MS = 2000;
