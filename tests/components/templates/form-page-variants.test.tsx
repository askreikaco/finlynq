/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { LoadState } from "@/lib/forms/load-state";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  params: {} as Record<string, string | undefined>,
  search: "",
  api: { data: undefined as unknown, error: undefined as unknown, mutate: vi.fn(), isLoading: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: h.refresh, back: vi.fn() }),
  useParams: () => h.params,
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/goals/1/edit",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

vi.mock("@/lib/data/use-api", () => ({
  useApi: () => ({ data: h.api.data, error: h.api.error, mutate: h.api.mutate, isLoading: h.api.isLoading }),
}));

import { FormPage, type FormPageProps, type FormPageContext } from "@/components/templates/form-page";

type Goal = { id: number; name: string };
type Values = { name: string };
type Extra = { accounts: string[] };

const ROOT_DEFAULT_BAR = "mx-auto w-full max-w-form pb-[var(--form-bottom-pad)]";

function Fields({ ctx, initial = "" }: { ctx: { registerValues: (get: () => Values) => void }; initial?: string }) {
  const [name, setName] = React.useState(initial);
  React.useEffect(() => {
    ctx.registerValues(() => ({ name }));
  }, [ctx.registerValues, name]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label>
      Name
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
    </label>
  );
}

function renderPage(props: Partial<FormPageProps<Goal[], Goal, Values, Extra>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn(async () => new Response("{}", { status: 200 }));
  return render(
    <FormPage<Goal[], Goal, Values, Extra>
      id="goal-edit"
      title="Edit goal"
      fallbackReturn="/goals"
      onSubmit={onSubmit}
      {...props}
    >
      {(ctx) => <Fields ctx={ctx} initial={ctx.record?.name ?? ""} />}
    </FormPage>,
  );
}

const withLoad = {
  load: { key: "/api/goals", select: (list: Goal[], id: string) => list.find((g) => g.id === Number(id)) },
};

const loaded = (data: Goal[] = [{ id: 1, name: "Emergency fund" }]) => {
  h.api.data = data;
  h.api.error = undefined;
};

const deleteCfg = (over: Partial<NonNullable<FormPageProps<Goal[], Goal, Values, Extra>["delete"]>> = {}) => ({
  label: "Delete goal",
  confirmTitle: "Delete goal",
  describe: (g: Goal) => g.name,
  request: async () => new Response("{}", { status: 200 }),
  after: "returnTo",
  ...over,
});

function openDeleteFromOverflow() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
}

beforeEach(() => {
  h.push.mockReset();
  h.refresh.mockReset();
  h.params = { id: "1" };
  h.search = "";
  h.api = { data: undefined, error: undefined, mutate: vi.fn(), isLoading: false };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FormPage variants: default is unchanged", () => {
  it("root className, body class, header and form are the same as before the variants", () => {
    loaded();
    renderPage();
    const root = screen.getByTestId("goal-edit-root");
    expect(root.className).toBe(ROOT_DEFAULT_BAR);
    const form = document.getElementById("goal-edit-form");
    expect(form?.className).toBe("mt-3 space-y-3");
    expect(form?.tagName).toBe("FORM");
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("bottom placement root has no pad class by default", () => {
    loaded();
    renderPage({ savePlacement: "bottom" });
    expect(screen.getByTestId("goal-edit-root").className).toBe("mx-auto w-full max-w-form");
  });

  it("explicit form=owned, width=form, padBottom=default match the default root", () => {
    loaded();
    renderPage({ form: "owned", width: "form", padBottom: "default" });
    expect(screen.getByTestId("goal-edit-root").className).toBe(ROOT_DEFAULT_BAR);
  });

  it("the load-less route keeps the same root and renders the form", () => {
    renderPage();
    expect(screen.getByTestId("goal-edit-root").className).toBe(ROOT_DEFAULT_BAR);
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});

describe("FormPage variants: title and subtitle ReactNode", () => {
  it("title accepts a ReactNode", () => {
    loaded();
    renderPage({ title: <span data-testid="icon-title">Goal <em>icon</em></span> });
    const t = screen.getByTestId("icon-title");
    expect(t.querySelector("em")?.textContent).toBe("icon");
  });

  it("subtitle accepts a ReactNode", () => {
    loaded();
    renderPage({ subtitle: <span data-testid="sub-node">Line <b>two</b></span> });
    expect(screen.getByTestId("sub-node").querySelector("b")?.textContent).toBe("two");
  });
});

describe("FormPage variants: form=external", () => {
  it("renders no <form>, no Save and no Cancel", () => {
    loaded();
    renderPage({ form: "external", savePlacement: "bottom" });
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("pads the body, not the root", () => {
    loaded();
    renderPage({ form: "external" });
    expect(screen.getByTestId("goal-edit-root").className).toBe("mx-auto w-full max-w-form");
    const body = screen.getByLabelText("Name").closest("div");
    expect(body?.className).toContain("mt-3");
    expect(body?.className).toContain("pb-[var(--form-bottom-pad)]");
  });

  it("the page's own Save is rendered through header.actions and submits nothing itself", () => {
    loaded();
    const onSubmit = vi.fn();
    renderPage({
      form: "external",
      onSubmit,
      header: { actions: <button type="submit" form="my-form">Save splits</button> },
    });
    expect(screen.getByRole("button", { name: "Save splits" })).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ctx.submit still works when called explicitly", async () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F4";
    const onSubmit = vi.fn(async () => new Response("{}", { status: 200 }));
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="ext2" title="E" fallbackReturn="/goals" form="external" onSubmit={onSubmit}>
        {(ctx) => (
          <button type="button" onClick={() => void ctx.submit({ name: "Direct" })}>
            Direct submit
          </button>
        )}
      </FormPage>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Direct submit" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/goals/4"));
  });
});

describe("FormPage variants: bodyClassName", () => {
  it("appends to the owned form class", () => {
    loaded();
    renderPage({ bodyClassName: "space-y-5" });
    // twMerge keeps the later space-y utility, so the default space-y-3 is replaced.
    expect(document.getElementById("goal-edit-form")?.className).toBe("mt-3 space-y-5");
  });

  it("appends to the external body div", () => {
    loaded();
    renderPage({ form: "external", bodyClassName: "space-y-3" });
    const body = screen.getByLabelText("Name").closest("div");
    expect(body?.className).toContain("space-y-3");
    expect(body?.className).toContain("mt-3");
  });
});

describe("FormPage variants: useLoad", () => {
  it("renders the record and extra from the page hook", () => {
    const useLoad = vi.fn((): LoadState<Goal, Extra> => ({
      status: "ready",
      record: { id: 1, name: "From hook" },
      extra: { accounts: ["A"] },
      retry: vi.fn(),
    }));
    const seen: { record?: Goal; extra?: Extra }[] = [];
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="h" title="H" fallbackReturn="/goals" useLoad={useLoad}>
        {(ctx) => {
          seen.push({ record: ctx.record, extra: ctx.extra });
          return <Fields ctx={ctx} initial={ctx.record?.name ?? ""} />;
        }}
      </FormPage>,
    );
    expect(useLoad).toHaveBeenCalledWith({ params: { id: "1" }, returnTo: "/goals" });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("From hook");
    expect(seen.at(-1)?.extra).toEqual({ accounts: ["A"] });
  });

  it("status loading shows the skeleton with no form", () => {
    renderPage({ useLoad: () => ({ status: "loading", retry: vi.fn() }) });
    expect(screen.getByTestId("goal-edit-root")).toBeTruthy();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("status error shows the default error and retry calls the hook's retry", () => {
    const retry = vi.fn();
    renderPage({ useLoad: () => ({ status: "error", retry }) });
    expect(screen.getByText("Couldn't load this page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("status notFound shows the default not-found note", () => {
    renderPage({ useLoad: () => ({ status: "notFound", retry: vi.fn() }) });
    expect(screen.getByText(/doesn't exist or was deleted/)).toBeTruthy();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("useLoad takes precedence over load", () => {
    const select = vi.fn();
    renderPage({
      load: { key: "/api/goals", select },
      useLoad: () => ({ status: "ready", record: { id: 1, name: "Hook wins" }, retry: vi.fn() }),
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Hook wins");
    expect(select).not.toHaveBeenCalled();
  });

  it("without useLoad the status is ready, so the form renders", () => {
    renderPage();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});

describe("FormPage variants: ctx reload, extra, openDelete", () => {
  it("reload re-runs the load (the legacy load calls mutate)", () => {
    loaded();
    let reload: (() => void) | undefined;
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="r" title="R" fallbackReturn="/goals" {...withLoad}>
        {(ctx: FormPageContext<Goal, Values, Extra>) => {
          reload = ctx.reload;
          return <span>r</span>;
        }}
      </FormPage>,
    );
    reload?.();
    expect(h.api.mutate).toHaveBeenCalled();
  });

  it("openDelete is undefined without a record and a function with one", () => {
    loaded();
    const seen: (undefined | (() => void))[] = [];
    render(
      <FormPage<Goal[], Goal, Values, Extra>
        id="od"
        title="OD"
        fallbackReturn="/goals"
        {...withLoad}
        delete={deleteCfg()}
      >
        {(ctx) => {
          seen.push(ctx.openDelete);
          return <span>od</span>;
        }}
      </FormPage>,
    );
    expect(typeof seen.at(-1)).toBe("function");
  });

  it("openDelete is undefined when the record is missing", () => {
    loaded([]);
    const seen: (undefined | (() => void))[] = [];
    render(
      <FormPage<Goal[], Goal, Values, Extra>
        id="od2"
        title="OD"
        fallbackReturn="/goals"
        {...withLoad}
        delete={deleteCfg()}
        states={{ notFound: { chrome: true } }}
      >
        {(ctx) => {
          seen.push(ctx.openDelete);
          return <span>od</span>;
        }}
      </FormPage>,
    );
    expect(seen.every((x) => x === undefined)).toBe(true);
  });
});

describe("FormPage variants: states", () => {
  it("states.loading.chrome=false renders the skeleton bare (no root, no header)", () => {
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="bare" title="Bare" fallbackReturn="/goals" {...withLoad} states={{ loading: { chrome: false } }}>
        {() => <span>never</span>}
      </FormPage>,
    );
    expect(screen.queryByTestId("bare-root")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bare" })).toBeNull();
    expect(screen.queryByText("never")).toBeNull();
  });

  it("states.loading default (chrome on) keeps the root and header", () => {
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="on" title="On" fallbackReturn="/goals" {...withLoad}>
        {() => <span>never</span>}
      </FormPage>,
    );
    expect(screen.getByTestId("on-root")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "On" })).toBeTruthy();
  });

  it("states.loading variant and rows are accepted (cards)", () => {
    const { container } = render(
      <FormPage<Goal[], Goal, Values, Extra> id="lc" title="LC" fallbackReturn="/goals" {...withLoad} states={{ loading: { variant: "cards", rows: 2 } }}>
        {() => <span>never</span>}
      </FormPage>,
    );
    expect(container.querySelectorAll(".h-36").length).toBe(2);
  });

  it("states.error copy and retry=refresh calls router.refresh", () => {
    h.api.error = new Error("boom");
    renderPage({
      ...withLoad,
      states: { error: { title: "Couldn't load goal", message: "Custom message", retry: "refresh" } },
    });
    expect(screen.getByText("Couldn't load goal")).toBeTruthy();
    expect(screen.getByText("Custom message")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(h.refresh).toHaveBeenCalled();
    expect(h.api.mutate).not.toHaveBeenCalled();
  });

  it("states.error retry=reload (default) calls mutate", () => {
    h.api.error = new Error("boom");
    renderPage({ ...withLoad });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(h.api.mutate).toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("states.error chrome=false renders the error bare", () => {
    h.api.error = new Error("boom");
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="ec" title="EC" fallbackReturn="/goals" {...withLoad} states={{ error: { chrome: false } }}>
        {() => <span>never</span>}
      </FormPage>,
    );
    expect(screen.queryByTestId("ec-root")).toBeNull();
    expect(screen.getByText("Couldn't load this page")).toBeTruthy();
  });

  it("states.notFound kind=text renders a muted paragraph with the link", () => {
    loaded([]);
    h.search = "returnTo=%2Fgoals%2Fdone";
    renderPage({
      ...withLoad,
      states: { notFound: { kind: "text", message: "This goal no longer exists.", linkLabel: "Back to goals" } },
    });
    const p = screen.getByText(/no longer exists/);
    expect(p.tagName).toBe("P");
    expect(p.className).toBe("mt-6 text-sm text-muted-foreground");
    expect(p.querySelector("a")?.getAttribute("href")).toBe("/goals/done");
    expect(screen.getByRole("link", { name: "Back to goals" })).toBeTruthy();
  });

  it("states.notFound kind=note (default) keeps FormNote and the default copy", () => {
    loaded([]);
    renderPage({ ...withLoad });
    expect(screen.getByText(/doesn't exist or was deleted/)).toBeTruthy();
  });

  it("states.notFound kind=error renders ErrorState with the title; retry=returnTo goes to returnTo", () => {
    loaded([]);
    h.search = "returnTo=%2Floans";
    renderPage({
      ...withLoad,
      states: { notFound: { kind: "error", title: "Goal not found", message: "Gone.", retry: "returnTo" } },
    });
    expect(screen.getByText("Goal not found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(h.push).toHaveBeenCalledWith("/loans");
  });

  it("states.notFound chrome=false renders bare", () => {
    loaded([]);
    render(
      <FormPage<Goal[], Goal, Values, Extra> id="nf" title="NF" fallbackReturn="/goals" {...withLoad} states={{ notFound: { chrome: false, kind: "text", message: "Gone" } }}>
        {() => <span>never</span>}
      </FormPage>,
    );
    expect(screen.queryByTestId("nf-root")).toBeNull();
    expect(screen.getByText("Gone")).toBeTruthy();
  });
});

describe("FormPage variants: header", () => {
  it("header.className replaces the default header class", () => {
    loaded();
    renderPage({ header: { className: "flex items-start gap-2" } });
    const bar = screen.getByRole("heading", { level: 1 }).closest(".flex.items-start.gap-2");
    expect(bar).toBeTruthy();
    expect(document.querySelector(".flex.items-center.justify-between")).toBeNull();
  });

  it("header.actions (node) replaces the default desktop Delete and bar Save", () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg(),
      header: { actions: <button type="button">Custom action</button> },
    });
    expect(screen.getByRole("button", { name: "Custom action" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete goal" })).toBeNull();
  });

  it("header.actions (function) receives the record", () => {
    loaded();
    const fn = vi.fn((rec?: Goal) => <span>Actions for {rec?.name}</span>);
    renderPage({ ...withLoad, header: { actions: fn } });
    expect(screen.getByText("Actions for Emergency fund")).toBeTruthy();
    expect(fn).toHaveBeenCalledWith({ id: 1, name: "Emergency fund" });
  });

  it("header.belowTitle renders under the title", () => {
    loaded();
    renderPage({ header: { belowTitle: <span data-testid="below-node">B</span> } });
    expect(screen.getByTestId("below-node")).toBeTruthy();
  });

  it("header.backLabel renames the Back link", () => {
    loaded();
    renderPage({ header: { backLabel: "Back to goals" } });
    expect(screen.getByRole("link", { name: "Back to goals" })).toBeTruthy();
  });

  it("header.backHref changes only the Back target; ctx.returnTo is unchanged", () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F7";
    const seen: string[] = [];
    render(
      <FormPage<Goal[], Goal, Values, Extra>
        id="bh"
        title="BH"
        fallbackReturn="/goals"
        {...withLoad}
        header={{ backHref: "/dashboard" }}
      >
        {(ctx) => {
          seen.push(ctx.returnTo);
          return <span>bh</span>;
        }}
      </FormPage>,
    );
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/dashboard");
    expect(seen.at(-1)).toBe("/goals/7");
  });
});

describe("FormPage variants: width", () => {
  it.each([
    ["form", "max-w-form"],
    ["section", "max-w-section"],
    ["report", "max-w-report"],
  ] as const)("width=%s sets %s on the root", (width, cls) => {
    loaded();
    renderPage({ width });
    const root = screen.getByTestId("goal-edit-root");
    expect(root.className.split(" ")).toContain(cls);
  });
});

describe("FormPage variants: padBottom", () => {
  it("padBottom=none removes the root pad class", () => {
    loaded();
    renderPage({ padBottom: "none" });
    expect(screen.getByTestId("goal-edit-root").className).toBe("mx-auto w-full max-w-form");
  });

  it("padBottom=max uses the max pad token", () => {
    loaded();
    renderPage({ padBottom: "max" });
    expect(screen.getByTestId("goal-edit-root").className).toBe("mx-auto w-full max-w-form pb-[var(--form-bottom-pad-max)]");
  });

  it("padBottom=default on a bottom-save owned form has no pad (today)", () => {
    loaded();
    renderPage({ padBottom: "default", savePlacement: "bottom" });
    expect(screen.getByTestId("goal-edit-root").className).toBe("mx-auto w-full max-w-form");
  });

  it("padBottom=none on external removes the body pad too", () => {
    loaded();
    renderPage({ form: "external", padBottom: "none" });
    const body = screen.getByLabelText("Name").closest("div");
    expect(body?.className).not.toContain("pb-[");
  });
});

describe("FormPage variants: saveDisabled", () => {
  it("saveDisabled true disables Save", () => {
    loaded();
    renderPage({ saveDisabled: () => true });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saveDisabled false leaves Save enabled", () => {
    loaded();
    renderPage({ saveDisabled: () => false });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saveDisabled receives the context (record)", () => {
    loaded();
    const saveDisabled = vi.fn((ctx: FormPageContext<Goal, Values, Extra>) => ctx.record?.name === "");
    renderPage({ ...withLoad, saveDisabled });
    expect(saveDisabled).toHaveBeenCalledWith(expect.objectContaining({ record: { id: 1, name: "Emergency fund" } }));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("FormPage variants: delete extras", () => {
  it("headerLabel sets the desktop button text, overflow keeps label", () => {
    loaded();
    renderPage({ ...withLoad, delete: deleteCfg({ headerLabel: "Delete" }) });
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    openDeleteFromOverflow();
    expect(screen.getByRole("menuitem", { name: "Delete goal" })).toBeTruthy();
  });

  it("button=none removes the desktop button but keeps the overflow item", () => {
    loaded();
    renderPage({ ...withLoad, delete: deleteCfg({ button: "none" }) });
    expect(screen.queryByRole("button", { name: "Delete goal" })).toBeNull();
    openDeleteFromOverflow();
    expect(screen.getByRole("menuitem", { name: "Delete goal" })).toBeTruthy();
  });

  it("whenMissing=hide (default) renders no desktop Delete when the record is missing", () => {
    loaded([]);
    renderPage({ ...withLoad, delete: deleteCfg(), states: { notFound: { chrome: true } } });
    expect(screen.queryByRole("button", { name: "Delete goal" })).toBeNull();
  });

  it("whenMissing=disabled renders a disabled desktop Delete and no overflow item", () => {
    loaded([]);
    renderPage({ ...withLoad, delete: deleteCfg({ whenMissing: "disabled" }) });
    const btn = screen.getByRole("button", { name: "Delete goal" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("whenMissing=disabled with a record renders an enabled Delete", () => {
    loaded();
    renderPage({ ...withLoad, delete: deleteCfg({ whenMissing: "disabled" }) });
    expect((screen.getByRole("button", { name: "Delete goal" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("errorStyle=inline renders a plain alert paragraph, not FormNote", async () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg({ errorStyle: "inline", request: async () => new Response(JSON.stringify({ error: "Linked" }), { status: 409 }) }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await screen.findByText("Linked");
    expect(alert.tagName).toBe("P");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.className).toBe("text-sm text-destructive");
  });

  it("errorStyle=note (default) renders the FormNote alert", async () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg({ request: async () => new Response(JSON.stringify({ error: "Linked" }), { status: 409 }) }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await screen.findByText("Linked")).getAttribute("role")).toBe("alert");
  });

  it("keepOpenOnError=false closes the dialog and keeps the error on the page", async () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg({ keepOpenOnError: false, request: async () => new Response(JSON.stringify({ error: "Nope" }), { status: 500 }) }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await screen.findByText("Nope")).getAttribute("role")).toBe("alert");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.push).not.toHaveBeenCalled();
  });

  it("ignoreStatus=true treats a non-ok Response as success and goes to returnTo", async () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F8";
    renderPage({
      ...withLoad,
      delete: deleteCfg({ ignoreStatus: true, request: async () => new Response("{}", { status: 404 }) }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/goals/8"));
  });

  it("ignoreStatus default (false) keeps the dialog open on a non-ok Response", async () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg({ request: async () => new Response("{}", { status: 404 }) }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByText("Could not delete. Please try again.");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("errorMessage shows fixed copy instead of the server message", async () => {
    loaded();
    renderPage({
      ...withLoad,
      delete: deleteCfg({
        errorMessage: "Couldn't delete the goal",
        request: async () => new Response(JSON.stringify({ error: "Server detail" }), { status: 409 }),
      }),
    });
    openDeleteFromOverflow();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Couldn't delete the goal")).toBeTruthy();
    expect(screen.queryByText("Server detail")).toBeNull();
  });
});

describe("FormPage variants: dirtyGuard with external", () => {
  it("a change in an external body arms the beforeunload guard", () => {
    loaded();
    const add = vi.spyOn(window, "addEventListener");
    renderPage({ form: "external", dirtyGuard: true });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });
});
