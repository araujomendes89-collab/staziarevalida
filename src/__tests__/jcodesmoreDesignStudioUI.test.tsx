import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminDesignStudioView } from "../components/admin/AdminDesignStudioView";
import { JCodesMoreWorkerClientService } from "../services/jcodesmoreWorkerClientService";

describe("AdminDesignStudioView JCodesMore Integration UI (1.27G.1)", () => {
  it("should render engine selector and switch between Stazia Quick Capture and JCodesMore", async () => {
    vi.spyOn(JCodesMoreWorkerClientService, "fetchWorkerHealth").mockResolvedValue({
      configured: true,
      sourceZipFound: true,
      sourceHashValid: true,
      packageVersion: "0.4.0",
      nodeRuntimeAvailable: true,
      nodeVersion: "v24.19.0",
      agentAvailable: true,
      agentType: "CLAUDE_CODE",
      agentVersion: "2.1.251",
      browserMcpAvailable: true,
      browserType: "CHROME_MCP",
      workspaceWritable: true,
      workerReady: true,
      checkedAt: new Date().toISOString(),
    });

    render(<AdminDesignStudioView />);

    // Check engine selector buttons
    const quickCaptureBtn = screen.getByText("Stazia Quick Capture");
    const jcodesmoreBtn = screen.getByText("JCodesMore High Fidelity");
    expect(quickCaptureBtn).toBeInTheDocument();
    expect(jcodesmoreBtn).toBeInTheDocument();

    // Click JCodesMore
    fireEvent.click(jcodesmoreBtn);

    // Verify JCodesMore panel elements appear
    await waitFor(() => {
      expect(screen.getByText(/Motor JCodesMore 0.4.0/i)).toBeInTheDocument();
      expect(screen.getByText("CLONAR COM JCODESMORE")).toBeInTheDocument();
      expect(screen.getByText(/Claude Code/i)).toBeInTheDocument();
      expect(screen.getByText(/Chrome DevTools MCP/i)).toBeInTheDocument();
    });
  });

  it("should display controlled notice on JCodesMore clone button trigger without running external clone", async () => {
    vi.spyOn(JCodesMoreWorkerClientService, "fetchWorkerHealth").mockResolvedValue({
      configured: true,
      sourceZipFound: true,
      sourceHashValid: true,
      packageVersion: "0.4.0",
      nodeRuntimeAvailable: true,
      nodeVersion: "v24.19.0",
      agentAvailable: true,
      agentType: "CLAUDE_CODE",
      browserMcpAvailable: true,
      browserType: "CHROME_MCP",
      workspaceWritable: true,
      workerReady: true,
      checkedAt: new Date().toISOString(),
    });

    vi.spyOn(JCodesMoreWorkerClientService, "createCloneJob").mockResolvedValue({
      success: true,
      job: {
        id: "job_ui_test",
        requestedUrl: "https://example.com/test",
        rightsType: "PUBLIC_REFERENCE_ONLY",
        cloneScope: "FULL_PAGE",
        requestedBy: "admin",
        engine: "JCODESMORE",
        engineVersion: "0.4.0",
        engineSourceHash: "a3a90a0cec72bfa7e3947ce372e04c797bfb819bdbae829fbd1111ebfc912303",
        agentType: "CLAUDE_CODE",
        status: "QUEUED",
        createdAt: new Date().toISOString(),
      },
    });

    render(<AdminDesignStudioView />);
    fireEvent.click(screen.getByText("JCodesMore High Fidelity"));

    await waitFor(() => {
      expect(screen.getByText("CLONAR COM JCODESMORE")).toBeInTheDocument();
    });

    // Select OWNED rights
    fireEvent.click(screen.getByText(/Site próprio \(OWNED\)/i));

    const urlInput = screen.getByPlaceholderText(/beta\.penserevalida\.com\/checklists/i);
    fireEvent.change(urlInput, { target: { value: "https://beta.penserevalida.com/checklists" } });

    const cloneBtn = screen.getByText("CLONAR COM JCODESMORE");
    fireEvent.click(cloneBtn);

    await waitFor(() => {
      expect(screen.getByText(/Job JCodesMore iniciado com sucesso em ambiente isolado/i)).toBeInTheDocument();
    });
  });
});


