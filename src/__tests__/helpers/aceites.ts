/**
 * Apoio dos testes do Tutor: grava direto na tabela os dois aceites vigentes de um aluno (o do Termo, com origem `cadastro`, e o
 * dos Tutores de IA, com origem `tutor`), para os testes que usam o Tutor mas não tratam do aceite começarem com o aluno liberado.
 * Quem testa o aceite em si usa `app_accept_terms`, que é o caminho do app.
 *
 * Roda com o dono do banco (o mesmo `db.query` que o teste usa para criar usuários): a tabela só é gravada pelo servidor. O código
 * do e-mail (`email_hash`, obrigatório) sai do e-mail da conta, como na prova de verdade. Repetir não duplica. Só Termo e Tutores: a Política e o Regulamento (versões vigentes desde a 013740) não são aceitos à parte.
 */
export async function aceitarTermos(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, userId: string): Promise<void> {
  await db.query(
    `insert into public.legal_acceptances (user_id, document, version, origin, email_hash)
     select $1::uuid, v.document, v.version, case v.document when 'termo_uso' then 'cadastro' else 'tutor' end,
            public.legal_email_hash(coalesce((select u.email from auth.users u where u.id = $1::uuid), ''))
     from public.legal_versions v
     where v.document in ('termo_uso', 'tutor_ia')
     on conflict (user_id, document, version) do nothing`,
    [userId]
  );
}
