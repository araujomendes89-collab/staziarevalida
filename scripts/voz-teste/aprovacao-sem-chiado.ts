// Prepara o SQL que registra a aprovação das vozes Stazi e Stazia na versão nova do acabamento (18/10, sem chiado). A voz, o modelo,
// a afinação e a pronúncia são os mesmos; mudou só o acabamento (ruído das pontas, volume, teto e soltura do limitador), e por isso
// a "versão" (fingerprint) mudou e os alunos voltariam à voz reserva até alguém aprovar de novo. O dono autorizou o coordenador a
// aprovar em nome dele. Imprime as versões antiga e nova e o SQL (rodar UMA vez no SQL Editor do Supabase, depois de publicar).
// Uso: TUTOR_VOICE_ENGINE=gemini npx tsx scripts/voz-teste/aprovacao-sem-chiado.ts <email de quem aprova>
import { fingerprintOf, fingerprintParts, voiceFingerprint } from "../../server/tutor/officialVoices";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Informe o e-mail de quem aprova (o mesmo da lista TUTOR_VOICE_APPROVERS).");
const env = { ...process.env, TUTOR_VOICE_ENGINE: "gemini" };
const ANTES = { stazi: -13.1, stazia: -13.7 } as const;
const linhas: string[] = [];
for (const id of ["stazi", "stazia"] as const) {
  const novo = voiceFingerprint(id, env);
  const partes = fingerprintParts(id, env) as Record<string, unknown>;
  const antigo = fingerprintOf({ ...partes, finish: { version: "frases-espera-2026-10-17", lufs: ANTES[id], peakDb: -3.5 } });
  console.log(`${id}: antes ${antigo}\n${" ".repeat(id.length)}  agora ${novo}`);
  linhas.push(`-- ${id}: a aprovação passa da versão ${antigo.slice(0, 12)}… para ${novo.slice(0, 12)}… (só o acabamento mudou)
insert into public.tutor_voice_approvals (voice, fingerprint, approved_by, approved_at, revoked_at, revoked_by, sample_path)
select '${id}', '${novo}', u.id, now(), null, null, null from auth.users u where lower(u.email) = '${email}'
on conflict (voice) do update set fingerprint = excluded.fingerprint, approved_by = excluded.approved_by, approved_at = excluded.approved_at,
  revoked_at = null, revoked_by = null, sample_path = null;
insert into public.admin_audit_log (actor_id, action, target, details)
select u.id, 'tutor.voice.approve', 'tutor', jsonb_build_object('voice', '${id}', 'fingerprint', '${novo}', 'anterior', '${antigo}', 'via', 'hotfix-chiado 18/10 (aprovação autorizada pelo dono)')
from auth.users u where lower(u.email) = '${email}';`);
}
console.log(`\n-- ===== SQL (rodar uma vez, depois de publicar o hotfix) =====\nbegin;\n${linhas.join("\n\n")}\n-- confere: as duas vozes com a versão nova\nselect voice, left(fingerprint, 12) as versao, approved_at, revoked_at from public.tutor_voice_approvals order by voice;\ncommit;`);
