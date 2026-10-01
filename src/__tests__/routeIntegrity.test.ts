import { describe, it, expect } from 'vitest';
import { STUDENT_NAVIGATION_CONFIG } from '../config/navigation';
import { TAB_TO_PATH, PATH_TO_TAB_MAP, pathToTab, tabToPath, tabToTitle } from '../services/routeMapping';
import { NavTab } from '../context/AppContext';

describe('Route & Navigation Integrity Automated Audit', () => {
  it('should have valid canonical paths for all Sidebar navigation items and sub-items', () => {
    for (const section of STUDENT_NAVIGATION_CONFIG) {
      const sectionPath = tabToPath(section.id);
      expect(sectionPath).toBeDefined();
      expect(typeof sectionPath).toBe('string');
      expect(sectionPath.startsWith('/')).toBe(true);

      // Section ID must resolve back from its path
      const resolvedSectionTab = pathToTab(sectionPath);
      expect(resolvedSectionTab).toBe(section.id);

      if (section.subItems) {
        for (const sub of section.subItems) {
          const subPath = tabToPath(sub.id);
          expect(subPath).toBeDefined();
          expect(typeof subPath).toBe('string');
          expect(subPath.startsWith('/')).toBe(true);

          // SubItem ID must resolve back from its path
          const resolvedSubTab = pathToTab(subPath);
          expect(resolvedSubTab).toBe(sub.id);
        }
      }
    }
  });

  it('should verify all 7 primary student modules resolve to correct non-home tabs', () => {
    const modules: { tab: NavTab; expectedPath: string }[] = [
      { tab: 'home', expectedPath: '/' },
      { tab: 'estudar', expectedPath: '/estudar' },
      { tab: 'estudar-plano-hoje', expectedPath: '/estudar/plano-de-hoje' },
      { tab: 'estudar-aulas', expectedPath: '/estudar/aulas' },
      { tab: 'estudar-grandes-temas', expectedPath: '/estudar/grandes-temas' },
      { tab: 'estudar-materiais', expectedPath: '/estudar/materiais' },
      { tab: 'praticar', expectedPath: '/praticar' },
      { tab: 'praticar-questoes', expectedPath: '/praticar/questoes' },
      { tab: 'praticar-simulados', expectedPath: '/praticar/simulados' },
      { tab: 'praticar-provas', expectedPath: '/praticar/provas-completas' },
      { tab: 'praticar-questoes-ia', expectedPath: '/praticar/questoes-ia' },
      { tab: 'praticar-checklists', expectedPath: '/praticar/checklists' },
      { tab: 'revisar', expectedPath: '/revisar' },
      { tab: 'revisar-erros', expectedPath: '/revisar/erros' },
      { tab: 'revisar-flashcards', expectedPath: '/revisar/flashcards' },
      { tab: 'revisar-atualizacoes', expectedPath: '/revisar/atualizacoes' },
      { tab: 'planejamento', expectedPath: '/planejamento' },
      { tab: 'planejamento-calendario', expectedPath: '/planejamento/calendario' },
      { tab: 'planejamento-semanal', expectedPath: '/planejamento/semanal' },
      { tab: 'planejamento-ate-prova', expectedPath: '/planejamento/ate-prova' },
      { tab: 'desempenho', expectedPath: '/desempenho' },
      { tab: 'desempenho-geral', expectedPath: '/desempenho/geral' },
      { tab: 'desempenho-areas', expectedPath: '/desempenho/areas' },
      { tab: 'desempenho-evolucao', expectedPath: '/desempenho/evolucao' },
      { tab: 'tutor-ia', expectedPath: '/tutor' },
      { tab: 'tutor-conversar', expectedPath: '/tutor/conversar' },
    ];

    for (const item of modules) {
      expect(tabToPath(item.tab)).toBe(item.expectedPath);
      expect(pathToTab(item.expectedPath)).toBe(item.tab);
      const title = tabToTitle(item.tab);
      expect(title).toBeDefined();
      expect(title.length).toBeGreaterThan(0);
      expect(title).toContain('StaziaMed Revalida');
    }
  });

  it('should preserve legacy URL aliases without breaking existing bookmarks', () => {
    const legacyAliases: { path: string; expectedTab: NavTab }[] = [
      { path: '/questoes', expectedTab: 'praticar-questoes' },
      { path: '/questions', expectedTab: 'praticar-questoes' },
      { path: '/simulados', expectedTab: 'praticar-simulados' },
      { path: '/ineditas', expectedTab: 'praticar-simulados' },
      { path: '/provas', expectedTab: 'praticar-provas' },
      { path: '/provas-completas', expectedTab: 'praticar-provas' },
      { path: '/flashcards', expectedTab: 'revisar-flashcards' },
      { path: '/erros', expectedTab: 'revisar-erros' },
      { path: '/caderno-de-erros', expectedTab: 'revisar-erros' },
      { path: '/radar', expectedTab: 'revisar-radar' },
      { path: '/guidelines', expectedTab: 'revisar-radar' },
      { path: '/revisar/radar', expectedTab: 'revisar-radar' },
      { path: '/calendario', expectedTab: 'planejamento-calendario' },
      { path: '/calendario-inteligente', expectedTab: 'planejamento-calendario' },
      { path: '/desempenho', expectedTab: 'desempenho' },
      { path: '/desempenho/geral', expectedTab: 'desempenho-geral' },
      { path: '/desempenho/areas', expectedTab: 'desempenho-areas' },
      { path: '/desempenho/evolucao', expectedTab: 'desempenho-evolucao' },
      { path: '/evolucao', expectedTab: 'desempenho-evolucao' },
      { path: '/desempenho/matriz', expectedTab: 'desempenho-matriz' },
      { path: '/matriz', expectedTab: 'desempenho-matriz' },
      { path: '/desempenho/tendencias', expectedTab: 'desempenho-tendencias' },
      { path: '/tendencias', expectedTab: 'desempenho-tendencias' },
      { path: '/estudar/plano-hoje', expectedTab: 'estudar-plano-hoje' },
      { path: '/plano-hoje', expectedTab: 'estudar-plano-hoje' },
    ];

    for (const alias of legacyAliases) {
      const resolved = pathToTab(alias.path);
      expect(resolved).toBe(alias.expectedTab);
    }
  });

  it('should strictly return "home" fallback only for truly unknown routes', () => {
    expect(pathToTab('/rota-inexistente-xyz')).toBe('home');
    expect(pathToTab('/foo/bar/baz')).toBe('home');
  });
});
