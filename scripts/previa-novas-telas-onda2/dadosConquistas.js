// PRÉVIA (onda 7): as 41 medalhas, as 7 ligas e a loja exatamente como a migração 20261003003800_stazia_play.sql as semeia,
// no formato de app_gamification_achievements / app_league_current / app_gamification_rewards. Nenhuma medalha "ganha":
// todas bloqueadas, como a conta real. ?ganhas=1 marca DUAS como desbloqueadas só para ver o estado colorido (TESTE).
const q = new URLSearchParams(location.search);

const BASE = [
  ["primeiros_passos", "Primeiros Passos", "10 questões respondidas.", "estudo", "footprints", "comum", 10, 5],
  ["aquecendo_motores", "Aquecendo os Motores", "100 questões respondidas.", "estudo", "flame", "comum", 30, 15],
  ["maquina_de_questoes", "Máquina de Questões", "1.000 questões respondidas.", "estudo", "cog", "rara", 100, 50],
  ["insano", "Insano", "5.000 questões respondidas.", "estudo", "zap", "epica", 300, 150],
  ["mira_boa", "Mira Boa", "80% de acerto em pelo menos 50 questões.", "precisao", "target", "comum", 30, 15],
  ["atirador_de_elite", "Atirador de Elite", "90% de acerto em pelo menos 100 questões.", "precisao", "crosshair", "rara", 80, 40],
  ["quase_banca", "Quase Banca do INEP", "95% de acerto em pelo menos 200 questões.", "precisao", "graduation-cap", "lendaria", 200, 100],
  ["streak_3", "3 dias seguidos", "Sequência de 3 dias.", "streak", "flame", "comum", 10, 5],
  ["streak_7", "7 dias seguidos", "Sequência de 7 dias.", "streak", "flame", "comum", 25, 10],
  ["streak_15", "15 dias seguidos", "Sequência de 15 dias.", "streak", "flame", "rara", 50, 25],
  ["streak_30", "30 dias seguidos", "Sequência de 30 dias.", "streak", "flame", "rara", 100, 50],
  ["streak_60", "60 dias seguidos", "Sequência de 60 dias.", "streak", "flame", "epica", 200, 100],
  ["streak_100", "100 dias seguidos", "Sequência de 100 dias.", "streak", "flame", "epica", 300, 150],
  ["streak_365", "Um ano inteiro", "Sequência de 365 dias.", "streak", "flame", "lendaria", 1000, 500],
  ["virada_de_jogo", "Virada de Jogo", "Melhorou a precisão em 10 pontos ou mais entre uma quinzena e a seguinte.", "evolucao", "trending-up", "rara", 60, 30],
  ["aprendeu_mesmo", "Aprendeu Mesmo", "Superou 20 questões que tinha errado.", "evolucao", "brain", "rara", 60, 30],
  ["top_10_semanal", "Top 10 semanal", "Terminou a semana entre os 10 primeiros do seu grupo da liga.", "especiais", "trophy", "rara", 50, 25],
];
const SECRETAS = [
  ["corujao", "rara", 20, 10],
  ["cinco_da_manha", "rara", 20, 10],
  ["sobrevivente", "epica", 40, 20],
  ["imparavel", "epica", 100, 50],
];
const AREAS = [
  ["CIRURGIA_GERAL", "Cirurgia"],
  ["GINECOLOGIA_OBSTETRICIA", "Gineco & Obstetrícia"],
  ["MEDICINA_FAMILIA_COMUNIDADE", "Preventiva / MFC"],
  ["CLINICA_MEDICA", "Clínica Médica"],
  ["PEDIATRIA", "Pediatria"],
];
const NIVEIS = [
  ["interno", "Interno", 50, 60, 0, "comum", 20],
  ["residente", "Residente", 150, 70, 0, "comum", 40],
  ["especialista", "Especialista", 300, 80, 50, "rara", 80],
  ["mestre", "Mestre", 500, 85, 70, "epica", 200],
];

function itens() {
  const lista = BASE.map(([slug, name, description, category, icon, rarity, xp, coins]) => ({ slug, name, description, category, icon, rarity, xp, coins, secret: false }));
  for (const [tier, title, n, acc, cov, rarity, xp] of NIVEIS)
    for (const [area, label] of AREAS)
      lista.push({ slug: `${area.toLowerCase()}_${tier}`, name: `${title} em ${label}`, description: `${n} questões de ${label} com ${acc}% de acerto${cov ? ` e ${cov}% dos temas estudados` : ""}.`, category: "areas", icon: "stethoscope", rarity, xp, coins: xp / 2, secret: false });
  for (const [slug, rarity, xp, coins] of SECRETAS) lista.push({ slug, name: "Conquista secreta", description: "Continue estudando para descobrir.", category: "especiais", icon: "lock", rarity, xp, coins, secret: true });
  const ganhas = q.get("ganhas") ? new Set(["primeiros_passos", "streak_3"]) : new Set();
  return lista
    .map((i) => ({ ...i, unlocked_at: ganhas.has(i.slug) ? "2026-10-14T12:00:00Z" : null, seen: true }))
    // mesma ordem da função do banco: desbloqueadas primeiro, depois categoria (ordem alfabética do texto) e posição
    .map((i, n) => [i, n])
    .sort(([a, x], [b, y]) => Number(!a.unlocked_at) - Number(!b.unlocked_at) || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) || x - y)
    .map(([i]) => i);
}

export function conquistas() {
  const items = itens();
  return { unlocked: items.filter((i) => i.unlocked_at).length, total: items.length, items };
}

export const LIGAS = [
  { slug: "bronze", name: "Bronze", position: 1, icon: "medal", color_token: "--league-bronze" },
  { slug: "prata", name: "Prata", position: 2, icon: "medal", color_token: "--league-prata" },
  { slug: "ouro", name: "Ouro", position: 3, icon: "medal", color_token: "--league-ouro" },
  { slug: "platina", name: "Platina", position: 4, icon: "gem", color_token: "--league-platina" },
  { slug: "diamante", name: "Diamante", position: 5, icon: "gem", color_token: "--league-diamante" },
  { slug: "elite", name: "Elite", position: 6, icon: "crown", color_token: "--league-elite" },
  { slug: "revalida_master", name: "Revalida Master", position: 7, icon: "trophy", color_token: "--league-master" },
];

export function loja() {
  return {
    enabled: true,
    coins: 0,
    freezes: 0,
    freeze_max: 3,
    catalog: q.get("lojavazia")
      ? []
      : [
          { slug: "streak_freeze", name: "Proteção de sequência", description: "Protege a sequência por um dia sem estudo. Máximo de 3 guardadas.", kind: "streak_freeze", cost: 60, icon: "snowflake", owned: false },
          { slug: "frame_teal", name: "Moldura Teal", description: "Moldura colorida no seu avatar da classificação.", kind: "frame", cost: 120, icon: "circle", owned: false },
          { slug: "frame_gold", name: "Moldura Dourada", description: "Moldura dourada no seu avatar da classificação.", kind: "frame", cost: 300, icon: "circle", owned: false },
        ],
    mine: [],
    transactions: [],
  };
}
