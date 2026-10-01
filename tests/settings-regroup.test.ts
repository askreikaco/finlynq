import { describe, it, expect } from "vitest";

describe("Settings Reorganization - Code Structure", () => {
  describe("Redirect pages exist and export correctly", () => {
    it("/settings/bank-feeds exports a redirect function", async () => {
      const mod = await import("@/app/(app)/settings/bank-feeds/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/rules exports a redirect function", async () => {
      const mod = await import("@/app/(app)/settings/rules/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/import exports a redirect function", async () => {
      const mod = await import("@/app/(app)/settings/import/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/display exports a redirect function", async () => {
      const mod = await import("@/app/(app)/settings/display/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/data exports a redirect function", async () => {
      const mod = await import("@/app/(app)/settings/data/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Parent pages accept initialSection prop", () => {
    it("ReconciliationPage accepts initialSection prop", async () => {
      const mod = await import("@/app/(app)/settings/reconciliation/page");
      const page = mod.default;
      const sig = page.toString();
      expect(sig).toContain("initialSection");
    });

    it("IntegrationsPage accepts initialSection prop", async () => {
      const mod = await import("@/app/(app)/settings/integrations/page");
      const page = mod.default;
      const sig = page.toString();
      expect(sig).toContain("initialSection");
    });

    it("DeveloperPage accepts initialSection prop", async () => {
      const mod = await import("@/app/(app)/settings/developer/page");
      const page = mod.default;
      const sig = page.toString();
      expect(sig).toContain("initialSection");
    });
  });

  describe("Section components are implemented", () => {
    it("ImportSection exports a React component", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      expect(mod.ImportSection).toBeDefined();
      expect(typeof mod.ImportSection).toBe("function");
    });

    it("DataSection exports a React component", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      expect(mod.DataSection).toBeDefined();
      expect(typeof mod.DataSection).toBe("function");
    });

    it("RulesSection exports a React component", async () => {
      const mod = await import("@/components/settings/sections/rules-section");
      expect(mod.RulesSection).toBeDefined();
      expect(typeof mod.RulesSection).toBe("function");
    });

    it("BankFeedsSection exports a React component", async () => {
      const mod = await import("@/components/settings/sections/bank-feeds-section");
      expect(mod.BankFeedsSection).toBeDefined();
      expect(typeof mod.BankFeedsSection).toBe("function");
    });

    it("DisplaySection exports a React component", async () => {
      const mod = await import("@/components/settings/sections/display-section");
      expect(mod.DisplaySection).toBeDefined();
      expect(typeof mod.DisplaySection).toBe("function");
    });
  });

  describe("Account routes exist", () => {
    it("/account route exists and exports default", async () => {
      const mod = await import("@/app/(app)/account/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/account route exists and exports default", async () => {
      const mod = await import("@/app/(app)/settings/account/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("AccountContent component is shared", () => {
    it("AccountContent is exported from account-content.tsx", async () => {
      const mod = await import("@/components/settings/account-content");
      expect(mod.AccountContent).toBeDefined();
      expect(typeof mod.AccountContent).toBe("function");
    });

    it("/account imports and uses AccountContent", async () => {
      const mod = await import("@/app/(app)/account/page");
      const src = mod.default.toString();
      expect(src).toContain("AccountContent");
    });

    it("/settings/account imports and uses AccountContent", async () => {
      const mod = await import("@/app/(app)/settings/account/page");
      const src = mod.default.toString();
      expect(src).toContain("AccountContent");
    });
  });

  describe("Settings layout", () => {
    it("settings layout exports default function", async () => {
      const mod = await import("@/app/(app)/settings/layout");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Reconciliation page has accordion sections", () => {
    it("ReconciliationPage has rules and import accordion items", async () => {
      const mod = await import("@/app/(app)/settings/reconciliation/page");
      const src = mod.default.toString();

      expect(src).toContain("rules");
      expect(src).toContain("import");
      expect(src).toContain("RulesSection");
      expect(src).toContain("ImportSection");
    });
  });

  describe("Integrations page has accordion sections", () => {
    it("IntegrationsPage has bank-feeds accordion item", async () => {
      const mod = await import("@/app/(app)/settings/integrations/page");
      const src = mod.default.toString();

      expect(src).toContain("bank-feeds");
      expect(src).toContain("BankFeedsSection");
    });
  });

  describe("Developer page has accordion sections", () => {
    it("DeveloperPage has data accordion item", async () => {
      const mod = await import("@/app/(app)/settings/developer/page");
      const src = mod.default.toString();

      expect(src).toContain("data");
      expect(src).toContain("DataSection");
    });
  });

  describe("General page has display section and appearance control", () => {
    it("GeneralPage has display section", async () => {
      const mod = await import("@/app/(app)/settings/general/page");
      const src = mod.default.toString();

      expect(src).toContain("DisplaySection");
    });

    it("GeneralPage has appearance control", async () => {
      const mod = await import("@/app/(app)/settings/general/page");
      const src = mod.default.toString();

      expect(src).toContain("useTheme");
      expect(src).toContain("setTheme");
    });
  });

  describe("Import section has all required functionality", () => {
    it("ImportSection has confirm mapping toggle", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("confirmCsvMapping");
    });

    it("ImportSection has email import config", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("importEmail");
    });

    it("ImportSection has template manager", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("TemplateManager");
    });

    it("ImportSection has migration providers", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("ConnectorTab");
      expect(src).toContain("MoneyProConnectorTab");
      expect(src).toContain("GenericCsvConnectorTab");
    });

    it("ImportSection has investment statements", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("InvestmentStatementImporter");
    });

    it("ImportSection has email rules manager", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      const src = mod.ImportSection.toString();
      expect(src).toContain("EmailRulesManager");
    });
  });

  describe("Data section has all required functionality", () => {
    it("DataSection has CSV import", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("importSection");
      expect(src).toContain("handleImportFile");
    });

    it("DataSection has CSV export", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("handleExport");
    });

    it("DataSection has backfill transactions", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("backfill");
    });

    it("DataSection has rebuild balance history", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("RebuildSnapshotsButton");
    });

    it("DataSection has clear all data", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("handleClearData");
      expect(src).toContain("Clear All Data");
    });

    it("DataSection has delete account", async () => {
      const mod = await import("@/components/settings/sections/data-section");
      const src = mod.DataSection.toString();
      expect(src).toContain("handleDeleteAccount");
      expect(src).toContain("Delete Account");
    });
  });
});
