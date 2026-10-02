// Auditoria: abre cada tela, registra título, bloqueios, erros de console, chamadas de API e tira captura.
// Uso: node audit-crawl.cjs <saida> <guest|elite>
const { chromium } = require(process.cwd() + '/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const MODE = process.argv[3] || 'guest';
const BASE = 'http://localhost:3000';

const ROUTES = [
  ['inicio', '/'],
  ['estudar-plano-hoje', '/estudar/plano-de-hoje'],
  ['estudar-aulas', '/estudar/aulas'],
  ['estudar-grandes-temas', '/estudar/grandes-temas'],
  ['estudar-materiais', '/estudar/materiais'],
  ['praticar-questoes', '/praticar/questoes'],
  ['praticar-simulados', '/praticar/simulados'],
  ['praticar-provas', '/praticar/provas-completas'],
  ['praticar-questoes-ia', '/praticar/questoes-ia'],
  ['praticar-checklists', '/praticar/checklists'],
  ['revisar-flashcards', '/revisar/flashcards'],
  ['revisar-erros', '/revisar/erros'],
  ['revisar-atualizacoes', '/revisar/atualizacoes'],
  ['revisar-radar', '/revisar/radar'],
  ['revisar-audio', '/revisar/audio'],
  ['planejamento-calendario', '/planejamento/calendario'],
  ['planejamento-semanal', '/planejamento/semanal'],
  ['planejamento-ate-prova', '/planejamento/ate-prova'],
  ['planejamento-disponibilidade', '/planejamento/disponibilidade'],
  ['planejamento-replanejamento', '/planejamento/replanejamento'],
  ['desempenho-geral', '/desempenho/geral'],
  ['desempenho-evolucao', '/desempenho/evolucao'],
  ['desempenho-matriz', '/desempenho/matriz'],
  ['desempenho-tendencias', '/desempenho/tendencias'],
  ['desempenho-areas', '/desempenho/areas'],
  ['tutor-conversar', '/tutor/conversar'],
  ['tutor-transito', '/tutor/transito'],
  ['tutor-historico', '/tutor/historico'],
  ['perfil', '/perfil'],
  ['planos', '/planos'],
  ['memoria', '/memoria'],
  ['agente', '/agente'],
  ['export', '/export'],
  ['admin', '/admin'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  let current = 'boot';
  const log = {};
  const entry = () => (log[current] ||= { consoleErrors: [], pageErrors: [], api: [], failed: [] });
  page.on('console', (m) => { if (m.type() === 'error') entry().consoleErrors.push(m.text().slice(0, 220)); });
  page.on('pageerror', (e) => entry().pageErrors.push(e.message.slice(0, 220)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/')) entry().api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`.slice(0, 160));
    else if (r.status() >= 400 && !u.includes('favicon')) entry().failed.push(`${r.status()} ${u.slice(0, 140)}`);
  });

  const settle = async () => {
    await page
      .waitForFunction(() => document.body.innerText.length > 350 || document.querySelector('[data-testid^="feature-gate-blocked"]'), null, { timeout: 45000 })
      .catch(() => entry().pageErrors.push('TIMEOUT: tela não carregou conteúdo em 45s'));
    await page.waitForTimeout(1500);
  };

  // Entra em modo convidado (só localStorage do navegador de teste)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => localStorage.setItem('praxis_guest_mode', 'true'));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await settle();

  let profileBefore = null;
  if (MODE === 'elite') {
    // Teste de segurança: troca o plano direto no localStorage, sem login nem servidor.
    profileBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('praxis_user_profile_v2');
      if (!raw) return null;
      const p = JSON.parse(raw);
      const before = { plan: p.plan, tier: p.tier, role: p.role };
      p.plan = 'elite';
      localStorage.setItem('praxis_user_profile_v2', JSON.stringify(p));
      return before;
    });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await settle();
  }

  const summary = [];
  for (const [i, [name, route]] of ROUTES.entries()) {
    current = name;
    const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch((e) => entry().pageErrors.push('goto: ' + e.message));
    await settle();
    const info = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const gate = document.querySelector('[data-testid^="feature-gate-blocked"]');
      const headings = [...main.querySelectorAll('h1, h2')].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 6);
      const invisible = [...main.querySelectorAll('h1, h2, h3')].filter((h) => {
        const cs = getComputedStyle(h);
        const m = cs.color.match(/\d+/g);
        if (!m) return false;
        const [r, g, b] = m.map(Number);
        // texto escuro (luminância baixa) numa página de fundo escuro
        const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
        let el = h, bg = null;
        while (el && !bg) { const c = getComputedStyle(el).backgroundColor; if (c && !c.includes('0, 0, 0, 0') && c !== 'transparent') bg = c; el = el.parentElement; }
        const bm = (bg || 'rgb(255,255,255)').match(/\d+/g).map(Number);
        const bgDark = 0.2126 * bm[0] + 0.7152 * bm[1] + 0.0722 * bm[2] < 60;
        return dark && bgDark && h.textContent.trim().length > 0;
      }).map((h) => h.textContent.trim().slice(0, 50));
      return {
        path: location.pathname,
        headerTitle: (document.querySelector('header h1, header h2') || {}).textContent || '',
        headings,
        gate: gate ? gate.getAttribute('data-testid').replace('feature-gate-blocked-', '') : null,
        textLen: main.innerText.length,
        buttons: main.querySelectorAll('button').length,
        images: main.querySelectorAll('img').length,
        lowContrastHeadings: invisible,
        height: document.documentElement.scrollHeight,
      };
    });
    await page.screenshot({ path: path.join(OUT, `${String(i + 1).padStart(2, '0')}-${name}.png`) });
    const e = entry();
    summary.push({ name, route, ms: Date.now() - t0, ...info, consoleErrors: e.consoleErrors.length, pageErrors: e.pageErrors.length, apiCalls: e.api.length });
  }

  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ mode: MODE, profileBefore, summary, log }, null, 2));
  console.log('modo', MODE, 'perfil antes:', JSON.stringify(profileBefore));
  for (const s of summary) {
    console.log(`${s.name.padEnd(30)} gate=${String(s.gate).padEnd(22)} txt=${String(s.textLen).padStart(5)} err=${s.consoleErrors + s.pageErrors} api=${s.apiCalls} h=${s.height} | ${s.headings.slice(0, 2).join(' / ').slice(0, 60)}${s.lowContrastHeadings.length ? ' | BAIXO CONTRASTE: ' + s.lowContrastHeadings.join('; ') : ''}`);
  }
  await browser.close();
})();
