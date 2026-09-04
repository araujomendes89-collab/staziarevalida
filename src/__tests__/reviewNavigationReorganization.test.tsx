import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider, useApp } from '../context/AppContext';
import { RevisarView } from '../components/revisar/RevisarView';
import { STUDENT_NAVIGATION_CONFIG } from '../config/navigation';
import { tabToPath, pathToTab } from '../services/routeMapping';
import { StorageService } from '../services/storageService';
import * as libFirebase from '../lib/firebase';
import { FirebaseService } from '../services/firebaseService';

const AdminRoleSetter: React.FC<{ role: 'STUDENT' | 'ADMIN'; isGuest?: boolean }> = ({ role, isGuest }) => {
  const { updateUserProfile, enterGuestMode, exitGuestMode } = useApp();
  React.useEffect(() => {
    updateUserProfile({ role, tier: role === 'ADMIN' ? 'ADMIN' : 'PRO' });
    if (isGuest) {
      enterGuestMode();
    } else {
      exitGuestMode();
    }
  }, [role, isGuest]);
  return null;
};

describe('Review Navigation & Admin Access Control (Etapa 1.20C)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should have exactly 3 sub-items in the student Sidebar for REVISAR', () => {
    const revisarSection = STUDENT_NAVIGATION_CONFIG.find((s) => s.id === 'revisar');
    expect(revisarSection).toBeDefined();
    expect(revisarSection?.subItems?.length).toBe(3);

    const subIds = revisarSection?.subItems?.map((item) => item.id);
    expect(subIds).toEqual(['revisar-erros', 'revisar-flashcards', 'revisar-atualizacoes']);
  });

  it('should not contain duplicate top navigation tabs inside RevisarView container', () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <RevisarView initialSubTab="FLASHCARDS" />
        </AppProvider>
      </BrowserRouter>
    );

    // The old top horizontal tabs bar with 5 buttons is removed
    expect(screen.queryByRole('button', { name: /Radar de Diretrizes/i })).toBeNull();
    // The main content of Flashcards is rendered cleanly
    expect(screen.getByText(/Revisão espaçada dos conteúdos clínicos/i)).toBeInTheDocument();
  });

  it('should preserve all routes and direct access mappings for all review submodules', () => {
    expect(tabToPath('revisar')).toBe('/revisar');
    expect(tabToPath('revisar-flashcards')).toBe('/revisar/flashcards');
    expect(tabToPath('revisar-erros')).toBe('/revisar/erros');
    expect(tabToPath('revisar-atualizacoes')).toBe('/revisar/atualizacoes');
    expect(tabToPath('revisar-radar')).toBe('/revisar/radar');
    expect(tabToPath('revisar-audio')).toBe('/revisar/audio');

    // Reverse resolution
    expect(pathToTab('/revisar/flashcards')).toBe('revisar-flashcards');
    expect(pathToTab('/revisar/erros')).toBe('revisar-erros');
    expect(pathToTab('/revisar/atualizacoes')).toBe('revisar-atualizacoes');
    expect(pathToTab('/revisar/radar')).toBe('revisar-radar');
    expect(pathToTab('/revisar/audio')).toBe('revisar-audio');
  });

  it('should DENY access to GuidelineWatchView (Radar) for a STUDENT user', async () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <AdminRoleSetter role="STUDENT" />
          <RevisarView initialSubTab="RADAR" />
        </AppProvider>
      </BrowserRouter>
    );

    // Access Denied screen rendered after auth resolution
    const deniedHeading = await screen.findByText(/Acesso Restrito à Administração/i);
    expect(deniedHeading).toBeInTheDocument();
    expect(screen.getByText(/Esta área exige confirmação de privilégios/i)).toBeInTheDocument();
    // Backoffice main container must NOT be visible
    expect(screen.queryByText(/Guideline Watch & O Que Mudou na Medicina/i)).toBeNull();
  });

  it('should DENY access to GuidelineWatchView for unauthenticated / GUEST mode', async () => {
    render(
      <BrowserRouter>
        <AppProvider>
          <AdminRoleSetter role="ADMIN" isGuest={true} />
          <RevisarView initialSubTab="RADAR" />
        </AppProvider>
      </BrowserRouter>
    );

    const deniedHeading = await screen.findByText(/Acesso Restrito à Administração/i);
    expect(deniedHeading).toBeInTheDocument();
    expect(screen.queryByText(/Guideline Watch & O Que Mudou na Medicina/i)).toBeNull();
  });

  it('should ALLOW access to GuidelineWatchView for authorized ADMIN user', async () => {
    const mockFbUser = {
      uid: 'usr-admin-master',
      email: 'araujomendes@staziamed.com.br',
      displayName: 'Administrador Master',
      emailVerified: true,
    } as any;

    vi.spyOn(libFirebase, 'subscribeToAuthState').mockImplementation((cb) => {
      cb(mockFbUser);
      return () => {};
    });

    vi.spyOn(FirebaseService, 'getUserProfile').mockResolvedValue({
      id: 'usr-admin-master',
      name: 'Administrador Master',
      email: 'araujomendes@staziamed.com.br',
      role: 'ADMIN',
      tier: 'PRO_PLUS',
      plan: 'pro_plus',
    } as any);

    render(
      <BrowserRouter>
        <AppProvider>
          <RevisarView initialSubTab="RADAR" />
        </AppProvider>
      </BrowserRouter>
    );

    // Radar content rendered for authenticated admin after auth resolution
    const radarTitle = await screen.findByText(/Guideline Watch & O Que Mudou na Medicina/i);
    expect(radarTitle).toBeInTheDocument();
    expect(screen.queryByText(/Acesso Restrito à Administração/i)).toBeNull();
  });
});
