import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminEditorialView } from "../components/admin/AdminEditorialView";
import * as AppContextModule from "../context/AppContext";
import { AdminUserDirectoryClientService } from "../services/adminUserDirectoryClientService";

// Mock AppContext
const mockUseApp = vi.fn();
vi.spyOn(AppContextModule, "useApp").mockImplementation(() => mockUseApp());

// Mock Client Service
vi.spyOn(AdminUserDirectoryClientService, "fetchUsers").mockImplementation(async () => ({
  success: true,
  users: [
    {
      uid: "uid_real_admin_001",
      uidMasked: "uid_re..._001",
      displayName: "João Paulo Mendes",
      email: "araujomendes@staziamed.com.br",
      emailVerified: true,
      disabled: false,
      providerIds: ["google.com"],
      role: "ADMIN",
      tier: "TRIAL",
      plan: "trial",
      profileDocumentExists: true,
      profileStatus: "READY",
      privilegeSource: "Firestore Server Doc + Claims",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastSignInAt: "2026-09-04T20:00:00.000Z",
      hasCustomAdminClaim: true,
      status: "Ativo",
    },
    {
      uid: "uid_real_legacy_002",
      uidMasked: "uid_re..._002",
      displayName: "Joao Paulo",
      email: "joaopaulo_df@msn.com",
      emailVerified: true,
      disabled: false,
      providerIds: ["password"],
      role: "ADMIN",
      tier: "ADMIN",
      plan: "admin",
      profileDocumentExists: true,
      profileStatus: "READY",
      privilegeSource: "Firestore Server Doc + Claims",
      createdAt: "2026-08-15T12:00:00.000Z",
      lastSignInAt: "2026-09-03T18:00:00.000Z",
      hasCustomAdminClaim: true,
      status: "Ativo",
    },
  ],
  totalCount: 2,
}));

describe("AdminEditorialView — Real User Directory UI Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseAdminState = {
    user: {
      id: "uid_real_admin_001",
      name: "João Paulo Mendes",
      email: "araujomendes@staziamed.com.br",
      role: "ADMIN" as const,
      tier: "TRIAL" as const,
      plan: "trial",
    },
    firebaseUser: {
      uid: "uid_real_admin_001",
      email: "araujomendes@staziamed.com.br",
      emailVerified: true,
    },
    isDeveloperAdmin: true,
    isGuestMode: false,
    profileResolutionStatus: "READY" as const,
    activeTab: "admin" as const,
    setActiveTab: vi.fn(),
    questions: [],
    guidelines: [],
    editionsInventory: [],
    knowledgeGraph: [],
    resetUserData: vi.fn(),
    resetAllData: vi.fn(),
  };

  it("should render real user directory and NOT contain mock users (Administrador Chefe, Mariana Costa, Carlos Eduardo)", async () => {
    mockUseApp.mockReturnValue(baseAdminState);

    render(<AdminEditorialView />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-users-table")).toBeInTheDocument();
    });

    // Check that real user exists
    expect(screen.getByText("João Paulo Mendes")).toBeInTheDocument();
    expect(screen.getByText("araujomendes@staziamed.com.br")).toBeInTheDocument();

    // Check that mock users DO NOT exist
    expect(screen.queryByText("Administrador Chefe")).not.toBeInTheDocument();
    expect(screen.queryByText("Dra. Mariana Costa")).not.toBeInTheDocument();
    expect(screen.queryByText("Dr. Carlos Eduardo (Curador Geral)")).not.toBeInTheDocument();
    expect(screen.queryByText("mariana.costa@medicina.br")).not.toBeInTheDocument();
    expect(screen.queryByText("carlos.curadoria@staziamed.com.br")).not.toBeInTheDocument();
  });

  it("should display error state when backend fetch fails", async () => {
    vi.spyOn(AdminUserDirectoryClientService, "fetchUsers").mockRejectedValueOnce(
      new Error("Falha ao comunicar com o servidor de autenticação.")
    );

    mockUseApp.mockReturnValue(baseAdminState);

    render(<AdminEditorialView />);

    await waitFor(() => {
      expect(screen.getByTestId("admin-users-error")).toBeInTheDocument();
    });

    expect(screen.getByText(/falha ao comunicar com o servidor de autenticação/i)).toBeInTheDocument();
  });
});
