/** Operação manual e paga, somente quando executada explicitamente. Nunca faz deploy ou aprova uso pelos alunos. */
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { OFFICIAL_VOICES, type OfficialVoice } from "../../src/shared/tutor/officialVoices";
import { validVoiceId } from "../../server/tutor/officialVoices";

async function main() {
  const [command, personality, choice, consent] = process.argv.slice(2);
  if (!["design", "save"].includes(command) || !Object.hasOwn(OFFICIAL_VOICES, personality ?? "")) {
    throw new Error("Uso: npx tsx scripts/tutor/elevenlabs-design.ts design <tranquilo|durona|direto> OU save <perfil> <1|2|3> --approve-design");
  }
  const id = personality as OfficialVoice;
  const env = { ...readEnv(".env"), ...readEnv(".env.local"), ...process.env };
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey || apiKey.length < 20) throw new Error("Configure ELEVENLABS_API_KEY somente no .env.local do servidor; não envie a chave no chat.");
  if (env.TUTOR_VOICE_ALLOW_EXTERNAL !== "1") throw new Error("É necessário TUTOR_VOICE_ALLOW_EXTERNAL=1. A geração consome créditos ElevenLabs.");
  const profile = OFFICIAL_VOICES[id];
  const directory = path.resolve(".data/tutor-voices", id);
  const manifest = path.join(directory, "design.json");
  const saved = path.join(directory, "saved-voice.json");
  const lock = path.join(directory, ".operation.lock");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Destino de audição não pode ser link simbólico.");
  // Não duplicar operação paga ao executar duas vezes ou após falha de salvamento.
  const fd = fs.openSync(lock, "wx", 0o600);
  let completed = false;
  try {
    if (command === "design") {
      if (fs.existsSync(manifest) || fs.existsSync(saved)) throw new Error("Este perfil já tem uma geração local. Revise os arquivos existentes antes de gerar outra versão.");
      const data = await post("/v1/text-to-voice/design", {
        voice_description: profile.design, text: profile.sample,
        model_id: "eleven_ttv_v3", auto_generate_text: false, should_enhance: false,
      });
      if (!Array.isArray(data.previews) || !data.previews.length || data.previews.length > 10) throw new Error("Voice Design não retornou prévias válidas. Não repita a operação sem conferir o painel.");
      const previews = data.previews.map((preview: any, index: number) => {
        if (!validVoiceId(preview.generated_voice_id) || typeof preview.audio_base_64 !== "string" || preview.audio_base_64.length > 12_000_000 || !String(preview.media_type).startsWith("audio/")) throw new Error("Prévia inválida. Confira a geração no painel antes de repetir.");
        const audio = Buffer.from(preview.audio_base_64, "base64");
        if (!audio.length) throw new Error("Prévia vazia. Confira o painel antes de repetir.");
        const audioPath = path.join(directory, `previa-${index + 1}.mp3`);
        fs.writeFileSync(audioPath, audio, { flag: "wx", mode: 0o600 });
        return { index: index + 1, generated_voice_id: preview.generated_voice_id, audioPath };
      });
      fs.writeFileSync(manifest, JSON.stringify({ personality: id, description: profile.design, text: profile.sample, previews }, null, 2), { flag: "wx", mode: 0o600 });
      completed = true;
      console.log(`Prévias de ${profile.label} geradas em ${directory}. Ouça todas e escolha uma; nenhuma voz oficial foi aprovada ou publicada.`);
    } else {
      if (consent !== "--approve-design" || !/^[1-9][0-9]?$/.test(choice ?? "")) throw new Error("Ouça a prévia antes. Para salvar a escolha, informe o número e --approve-design.");
      if (fs.existsSync(saved)) throw new Error("Já existe uma voz salva para este perfil. Veja saved-voice.json; não criar uma duplicata.");
      const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
      const preview = data.previews?.find((p: any) => p.index === Number(choice));
      if (data.personality !== id || !validVoiceId(preview?.generated_voice_id)) throw new Error("Prévia escolhida não encontrada.");
      const result = await post("/v1/text-to-voice", { voice_name: `Nexus — ${profile.label}`, voice_description: data.description, generated_voice_id: preview.generated_voice_id });
      if (!validVoiceId(result.voice_id)) throw new Error("Resposta sem voice_id válido; confira o painel antes de repetir.");
      fs.writeFileSync(saved, JSON.stringify({ personality: id, voice_id: result.voice_id, createdAt: new Date().toISOString(), releaseApproved: false }, null, 2), { flag: "wx", mode: 0o600 });
      completed = true;
      const variable = { direto: "DIRETO", durona: "DURONA", tranquilo: "TRANQUILO" }[id];
      // voice_id não é credencial. A API Key nunca é impressa nem gravada nestes arquivos.
      console.log(`Voz salva. Configure no servidor: ELEVENLABS_VOICE_${variable}=${result.voice_id}\nAinda é necessário testar os cenários no painel interno e aprovar a liberação.`);
    }
  } finally {
    fs.closeSync(fd);
    if (completed) fs.unlinkSync(lock);
    // Em erro o lock permanece: conferir o painel antes de uma nova operação paga.
  }

  async function post(endpoint: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`https://api.elevenlabs.io${endpoint}`, {
        method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "xi-api-key": apiKey! },
        body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
      });
    } catch { throw new Error("Sem resposta da ElevenLabs. Confira o painel antes de repetir: a operação pode ter consumido créditos."); }
    if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}. Confira permissões, plano e créditos no painel. Nenhuma repetição automática foi feita.`);
    try { return await response.json(); }
    catch { throw new Error("ElevenLabs retornou dados inválidos. Confira o painel antes de repetir; o corpo da resposta foi omitido."); }
  }
}
function readEnv(file: string) { return fs.existsSync(file) ? parse(fs.readFileSync(file)) : {}; }
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha na operação Voice Design."); process.exitCode = 1; });
