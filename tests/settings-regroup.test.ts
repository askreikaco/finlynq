import { describe, it, expect } from "vitest";
import { sectionFromPath, sectionFromUrl, type OpenSectionConfig } from "@/components/settings/use-open-section";
import { movedImportHref } from "@/components/settings/moved-import";
import { REDIRECTS } from "@/lib/nav-config";
import { existsSync } from "fs";
import { join } from "path";

const RECON: OpenSectionConfig = {
  byPath: [
    { prefix: "/settings/rules", section: "rules" },
    { prefix: "/settings/import", section: "import-settings" },
  ],
  valid: ["rules", "import-settings", "templates"],
  alias: { import: "import-settings" },
};

const INTEGRATIONS: OpenSectionConfig = {
  byPath: [
    { prefix: "/settings/bank-feeds", section: "bank-feeds" },
    { prefix: "/connect", section: "connect" },
  ],
  valid: ["bank-feeds", "connect", "email", "migrate", "statements"],
  providerSection: "migrate",
};

describe("old-path -> open section mapping", () => {
  it("path seeds the section", () => {
    expect(sectionFromPath("/settings/rules", RECON)).toBe("rules");
    expect(sectionFromPath("/settings/import", RECON)).toBe("import-settings");
    expect(sectionFromPath("/settings/import/reconcile-visibility", RECON)).toBe("import-settings");
    expect(sectionFromPath("/settings/reconciliation", RECON)).toBeNull();
  });
  it("?tab= and #hash refine it", () => {
    expect(sectionFromUrl("?tab=templates", "", RECON)).toBe("templates");
    expect(sectionFromUrl("?tab=import", "", RECON)).toBe("import-settings");
    expect(sectionFromUrl("?tab=bogus", "", RECON)).toBeNull();
    expect(sectionFromPath("/connect", INTEGRATIONS)).toBe("connect");
    expect(sectionFromUrl("?tab=email", "", INTEGRATIONS)).toBe("email");
    expect(sectionFromUrl("", "#statements", INTEGRATIONS)).toBe("statements");
    expect(sectionFromUrl("?provider=moneypro", "", INTEGRATIONS)).toBe("migrate");
  });
  it("legacy Import deep links forward to Integrations", () => {
    expect(movedImportHref("?tab=email", "")).toBe("/settings/integrations?tab=email");
    expect(movedImportHref("?tab=connect", "")).toBe("/settings/integrations?tab=migrate");
    expect(movedImportHref("", "#statements")).toBe("/settings/integrations?tab=statements");
    expect(movedImportHref("?provider=moneypro", "")).toBe(
      "/settings/integrations?tab=migrate&provider=moneypro",
    );
    expect(movedImportHref("?tab=templates", "")).toBeNull();
    expect(movedImportHref("", "")).toBeNull();
  });
});

describe("Settings Reorganization - Code Structure", () => {
  describe("Redirect pages exist and export correctly", () => {
    it("/settings/bank-feeds renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/bank-feeds/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/rules renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/rules/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/import renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/import/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/display renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/display/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/dropdown-order renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/dropdown-order/page");
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/about exists", async () => {
      const mod = await import("@/app/(app)/settings/about/page");
      expect(typeof mod.default).toBe("function");
    });

    it("/settings/data renders its parent in place", async () => {
      const mod = await import("@/app/(app)/settings/data/page");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Section components are implemented", () => {
    it("import-section exports its card and accordion items", async () => {
      const mod = await import("@/components/settings/sections/import-section");
      for (const name of [
        "ImportSettingsCard",
        "ImportTemplatesItem",
        "ImportEmailItem",
        "ImportMigrateItem",
        "ImportStatementsItem",
      ] as const) {
        expect(typeof mod[name]).toBe("function");
      }
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

    it("/settings/account page is removed (the redirect lives in nav-config)", () => {
      expect(existsSync(join(__dirname, "../src/app/(app)/settings/account/page.tsx"))).toBe(false);
    });
  });

  describe("AccountContent component is shared", () => {
    it("AccountContent is exported from account-content.tsx", async () => {
      const mod = await import("@/components/settings/account-content");
      expect(mod.AccountContent).toBeDefined();
      expect(typeof mod.AccountContent).toBe("function");
    });

    it("/account/security imports and uses AccountContent", async () => {
      const mod = await import("@/app/(app)/account/security/page");
      const src = mod.default.toString();
      expect(src).toContain("AccountContent");
    });

    it("/settings/account redirects to /account/security (G2-15, no duplicate content)", () => {
      expect(REDIRECTS).toContainEqual({ source: "/settings/account", destination: "/account/security", permanent: false });
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
    it("ReconciliationPage has Import settings + Rules cards and Import Templates", async () => {
      const mod = await import("@/app/(app)/settings/reconciliation/page");
      const src = mod.default.toString();

      expect(src).toContain("ImportSettingsCard");
      expect(src).toContain("RulesSection");
      expect(src).toContain("ImportTemplatesItem");
      expect(src).not.toContain("ImportEmailItem");
    });
  });

  describe("Integrations page has accordion sections", () => {
    it("IntegrationsPage has bank-feeds accordion item", async () => {
      const mod = await import("@/app/(app)/settings/integrations/page");
      const src = mod.default.toString();

      expect(src).toContain("bank-feeds");
      expect(src).toContain("BankFeedsSection");
      expect(src).toContain("ImportEmailItem");
      expect(src).toContain("ImportMigrateItem");
      expect(src).toContain("ImportStatementsItem");
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

  describe("Import pieces keep all required functionality", () => {
    const src = async (name: "ImportSettingsCard" | "ImportTemplatesItem" | "ImportEmailItem" | "ImportMigrateItem" | "ImportStatementsItem") =>
      (await import("@/components/settings/sections/import-section"))[name].toString();

    it("Import settings has confirm mapping toggle", async () => {
      expect(await src("ImportSettingsCard")).toContain("confirmCsvMapping");
    });

    it("Import via Email has the address and email rules manager", async () => {
      const s = await src("ImportEmailItem");
      expect(s).toContain("importEmail");
      expect(s).toContain("EmailRulesManager");
    });

    it("Import Templates has template manager", async () => {
      expect(await src("ImportTemplatesItem")).toContain("TemplateManager");
    });

    it("Import via another app has migration providers", async () => {
      const s = await src("ImportMigrateItem");
      expect(s).toContain("ConnectorTab");
      expect(s).toContain("MoneyProConnectorTab");
      expect(s).toContain("GenericCsvConnectorTab");
    });

    it("Import Investment Statement has the importer", async () => {
      expect(await src("ImportStatementsItem")).toContain("InvestmentStatementImporter");
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
