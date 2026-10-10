/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";

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

import { FormPage, type FormPageProps, type FormPageStateContext } from "@/components/templates/form-page";

type Goal = { id: number; name: string };
type Values = { name: string };

const ROOT_DEFAULT_BAR = "mx-auto w-full max-w-form pb-[var(--form-bottom-pad)]";

const loadCfg = {
  load: { key: "/api/goals", select: (list: Goal[], id: string) => list.find((g) => g.id === Number(id)) },
};

function Fields({ registerValues }: { registerValues: (get: () => Values) => void }) {
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    registerValues(() => ({ name }));
  }, [registerValues, name]);
  return <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />;
}

function renderPage(props: Partial<FormPageProps<Goal[], Goal, Values>> = {}) {
  return render(
    <FormPage<Goal[], Goal, Values>
      id="goal-edit"
      title="Edit goal"
      fallbackReturn="/goals"
      onSubmit={vi.fn(async () => new Response("{}", { status: 200 }))}
      {...props}
    >
      {(ctx) => <Fields registerValues={ctx.registerValues} />}
    </FormPage>,
  );
}

/** A page load hook with a fixed state. `message` is optional and not part of LoadState. */
function hookWith(state: { status: LoadStatus; record?: Goal; message?: string }) {
  const retry = vi.fn();
  const value = { ...state, retry };
  return { useLoad: () => value as LoadState<Goal>, retry };
}

const loaded = () => {
  h.api.data = [{ id: 1, name: "Emergency fund" }];
  h.api.error = undefined;
};

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

describe("FormPage knob rootTestId", () => {
  it("default: the root testid is <id>-root and the root class is unchanged", () => {
    loaded();
    renderPage(loadCfg);
    expect(screen.getByTestId("goal-edit-root").className).toBe(ROOT_DEFAULT_BAR);
  });

  it("set: replaces the root testid, keeps the class, and the form id still derives from id", () => {
    loaded();
    renderPage({ ...loadCfg, rootTestId: "goal-edit-custom-root" });
    expect(screen.queryByTestId("goal-edit-root")).toBeNull();
    const root = screen.getByTestId("goal-edit-custom-root");
    expect(root.className).toBe(ROOT_DEFAULT_BAR);
    expect(document.getElementById("goal-edit-form")?.tagName).toBe("FORM");
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
  });

  it("set in external mode: the testid moves and no form is rendered", () => {
    loaded();
    const { container } = renderPage({ ...loadCfg, form: "external", rootTestId: "rule-form-root" });
    expect(screen.getByTestId("rule-form-root")).toBeTruthy();
    expect(screen.queryByTestId("goal-edit-root")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("FormPage knob subtitle", () => {
  it("default: a static node renders as before", () => {
    loaded();
    renderPage({ ...loadCfg, subtitle: "Static line" });
    expect(screen.getByText("Static line")).toBeTruthy();
  });

  it("default: no subtitle renders no subtitle text", () => {
    loaded();
    renderPage(loadCfg);
    expect(screen.queryByText("Static line")).toBeNull();
  });

  it("function: receives the loaded record", () => {
    loaded();
    const subtitle = vi.fn((r: Goal | undefined) => `Record: ${r?.name ?? "none"}`);
    renderPage({ ...loadCfg, subtitle });
    expect(screen.getByText("Record: Emergency fund")).toBeTruthy();
    expect(subtitle).toHaveBeenLastCalledWith({ id: 1, name: "Emergency fund" });
  });

  it("function: receives undefined while the record is loading", () => {
    const hook = hookWith({ status: "loading" });
    const subtitle = vi.fn((r: Goal | undefined) => (r ? "has record" : "No record yet"));
    renderPage({ useLoad: hook.useLoad, subtitle });
    expect(screen.getByText("No record yet")).toBeTruthy();
    expect(subtitle).toHaveBeenCalledWith(undefined);
  });

  it("function: without any load it is called with undefined", () => {
    const subtitle = vi.fn(() => "Unloaded");
    renderPage({ subtitle });
    expect(screen.getByText("Unloaded")).toBeTruthy();
    expect(subtitle).toHaveBeenCalledWith(undefined);
  });
});

describe("FormPage knob states.*.wrapperClassName and node", () => {
  it("loading default: the body is a direct child of the root (no wrapper)", () => {
    const hook = hookWith({ status: "loading" });
    renderPage({ useLoad: hook.useLoad, states: { loading: { node: <p>Loading custom</p> } } });
    const body = screen.getByText("Loading custom");
    expect(body.parentElement).toBe(screen.getByTestId("goal-edit-root"));
  });

  it("loading wrapperClassName: the body sits in a div with that class", () => {
    const hook = hookWith({ status: "loading" });
    renderPage({ useLoad: hook.useLoad, states: { loading: { wrapperClassName: "mt-3", node: <p>Loading custom</p> } } });
    const body = screen.getByText("Loading custom");
    expect(body.parentElement?.tagName).toBe("DIV");
    expect(body.parentElement?.className).toBe("mt-3");
    expect(body.parentElement?.parentElement).toBe(screen.getByTestId("goal-edit-root"));
  });

  it("loading default: the built-in skeleton still renders under the header", () => {
    const hook = hookWith({ status: "loading" });
    renderPage({ useLoad: hook.useLoad });
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("loading node function: ctx.retry runs the hook retry", () => {
    const hook = hookWith({ status: "loading" });
    const node = vi.fn((ctx: FormPageStateContext) => <button onClick={ctx.retry}>Again loading</button>);
    renderPage({ useLoad: hook.useLoad, states: { loading: { node } } });
    fireEvent.click(screen.getByRole("button", { name: "Again loading" }));
    expect(hook.retry).toHaveBeenCalledTimes(1);
  });

  it("loading chrome:false + wrapper + node: renders bare (no root, no header)", () => {
    const hook = hookWith({ status: "loading" });
    const { container } = renderPage({
      useLoad: hook.useLoad,
      states: { loading: { chrome: false, wrapperClassName: "mt-3", node: <p>Bare loading</p> } },
    });
    expect(screen.queryByTestId("goal-edit-root")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.firstElementChild?.className).toBe("mt-3");
    expect(container.textContent).toBe("Bare loading");
  });

  it("error default: the built-in ErrorState is a direct child of the root with its copy", () => {
    const hook = hookWith({ status: "error" });
    renderPage({ useLoad: hook.useLoad });
    const alert = screen.getByRole("alert");
    expect(alert.parentElement).toBe(screen.getByTestId("goal-edit-root"));
    expect(screen.getByText("Couldn't load this page")).toBeTruthy();
  });

  it("error wrapperClassName: the ErrorState sits in a div with that class", () => {
    const hook = hookWith({ status: "error" });
    renderPage({ useLoad: hook.useLoad, states: { error: { wrapperClassName: "mt-3" } } });
    const alert = screen.getByRole("alert");
    expect(alert.parentElement?.className).toBe("mt-3");
    expect(alert.parentElement?.parentElement).toBe(screen.getByTestId("goal-edit-root"));
  });

  it("error node static: replaces the built-in body and keeps the header", () => {
    const hook = hookWith({ status: "error" });
    renderPage({ useLoad: hook.useLoad, states: { error: { node: <p>Custom failure</p> } } });
    expect(screen.getByText("Custom failure")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this page")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
  });

  it("error node function: receives the hook message and a ctx.retry that reloads", () => {
    const hook = hookWith({ status: "error", message: "Server said no" });
    const node = vi.fn((ctx: FormPageStateContext) => (
      <button onClick={ctx.retry}>{ctx.message ?? "no message"}</button>
    ));
    renderPage({ useLoad: hook.useLoad, states: { error: { node } } });
    const btn = screen.getByRole("button", { name: "Server said no" });
    fireEvent.click(btn);
    expect(hook.retry).toHaveBeenCalledTimes(1);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("error node function: retry 'refresh' makes ctx.retry call router.refresh", () => {
    const hook = hookWith({ status: "error" });
    const node = vi.fn((ctx: FormPageStateContext) => <button onClick={ctx.retry}>Refresh me</button>);
    renderPage({ useLoad: hook.useLoad, states: { error: { retry: "refresh", node } } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh me" }));
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(hook.retry).not.toHaveBeenCalled();
  });

  it("error chrome:false + node: renders the node bare", () => {
    const hook = hookWith({ status: "error" });
    const { container } = renderPage({
      useLoad: hook.useLoad,
      states: { error: { chrome: false, node: <p>Bare error</p> } },
    });
    expect(screen.queryByTestId("goal-edit-root")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.textContent).toBe("Bare error");
  });

  it("notFound default: the built-in note with the default copy and back link", () => {
    loaded();
    h.api.data = [];
    renderPage(loadCfg);
    const note = screen.getByText(/This record doesn't exist or was deleted\./);
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/goals");
    expect(note.querySelector("a")?.textContent).toBe("Back");
  });

  it("notFound node function: receives the hook message", () => {
    const hook = hookWith({ status: "notFound", message: "Goal 9 was archived" });
    const node = vi.fn((ctx: FormPageStateContext) => <p>{ctx.message}</p>);
    renderPage({ useLoad: hook.useLoad, states: { notFound: { node } } });
    expect(screen.getByText("Goal 9 was archived")).toBeTruthy();
    expect(node.mock.calls[0][0].message).toBe("Goal 9 was archived");
  });

  it("notFound node function: ctx.message is undefined when the hook has none", () => {
    const hook = hookWith({ status: "notFound" });
    const node = vi.fn((_ctx: FormPageStateContext) => <p>Gone</p>);
    renderPage({ useLoad: hook.useLoad, states: { notFound: { node } } });
    expect(node.mock.calls[0][0].message).toBeUndefined();
  });

  it("notFound node function: retry 'returnTo' makes ctx.retry go to returnTo", () => {
    const hook = hookWith({ status: "notFound" });
    const node = vi.fn((ctx: FormPageStateContext) => <button onClick={ctx.retry}>Go back</button>);
    renderPage({ useLoad: hook.useLoad, states: { notFound: { kind: "error", retry: "returnTo", node } } });
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(h.push).toHaveBeenCalledWith("/goals");
    expect(hook.retry).not.toHaveBeenCalled();
  });

  it("notFound default retry: ctx.retry reloads through the hook", () => {
    const hook = hookWith({ status: "notFound" });
    const node = vi.fn((ctx: FormPageStateContext) => <button onClick={ctx.retry}>Reload nf</button>);
    renderPage({ useLoad: hook.useLoad, states: { notFound: { node } } });
    fireEvent.click(screen.getByRole("button", { name: "Reload nf" }));
    expect(hook.retry).toHaveBeenCalledTimes(1);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("notFound wrapperClassName: the body sits in a div with that class", () => {
    const hook = hookWith({ status: "notFound" });
    renderPage({ useLoad: hook.useLoad, states: { notFound: { wrapperClassName: "mt-3", node: <p>Wrapped nf</p> } } });
    const body = screen.getByText("Wrapped nf");
    expect(body.parentElement?.className).toBe("mt-3");
    expect(body.parentElement?.parentElement).toBe(screen.getByTestId("goal-edit-root"));
  });

  it("notFound chrome:false + node: renders bare", () => {
    const hook = hookWith({ status: "notFound" });
    const { container } = renderPage({
      useLoad: hook.useLoad,
      states: { notFound: { chrome: false, node: <p>Bare nf</p> } },
    });
    expect(screen.queryByTestId("goal-edit-root")).toBeNull();
    expect(container.textContent).toBe("Bare nf");
  });
});
