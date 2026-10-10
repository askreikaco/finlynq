/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  params: {} as Record<string, string | undefined>,
  search: "",
  api: { data: undefined as unknown, error: undefined as unknown, mutate: vi.fn(), isLoading: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: vi.fn(), back: vi.fn() }),
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

import { FormPage, type FormPageProps } from "@/components/templates/form-page";

type Goal = { id: number; name: string };
type Values = { name: string };

function Fields({
  ctx,
  initial = "",
}: {
  ctx: { registerValues: (get: () => Values) => void };
  initial?: string;
}) {
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

function renderForm(props: Partial<FormPageProps<Goal[], Goal, Values>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn(async () => new Response("{}", { status: 200 }));
  return render(
    <FormPage<Goal[], Goal, Values>
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

beforeEach(() => {
  h.push.mockReset();
  h.params = { id: "1" };
  h.search = "";
  h.api = { data: undefined, error: undefined, mutate: vi.fn(), isLoading: false };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FormPage: root, header and returnTo", () => {
  it("renders the root testid, title and form", () => {
    loaded();
    renderForm();
    expect(screen.getByTestId("goal-edit-root")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Edit goal" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("uses a valid ?returnTo= for Back", () => {
    loaded();
    h.search = "returnTo=%2Fgoals%3Ftab%3Dactive";
    renderForm();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/goals?tab=active");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil", "/ spaced"])(
    "rejects an unsafe returnTo (%s) and falls back",
    (raw) => {
      loaded();
      h.search = `returnTo=${encodeURIComponent(raw)}`;
      renderForm();
      expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/goals");
    },
  );

  it("takes a function fallbackReturn with the route params", () => {
    loaded();
    renderForm({ fallbackReturn: (p) => `/goals/${p.id}` });
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/goals/1");
  });

  it("is wrapped in Suspense (a suspending child shows nothing first, then renders)", async () => {
    loaded();
    let resolved = false;
    let pending: Promise<void> | null = null;
    function Suspends() {
      if (!resolved) {
        pending ??= new Promise<void>((r) => setTimeout(() => { resolved = true; r(); }, 5));
        throw pending;
      }
      return <span>ready</span>;
    }
    render(
      <FormPage<Goal[], Goal, Values> id="s" title="S" fallbackReturn="/x" onSubmit={vi.fn()}>
        {() => <Suspends />}
      </FormPage>,
    );
    expect(screen.queryByText("ready")).toBeNull();
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
  });
});

describe("FormPage: Cancel and Save placement", () => {
  it("bottom placement shows Cancel and Save in the footer; Cancel goes to returnTo", () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F9";
    renderForm({ savePlacement: "bottom" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.push).toHaveBeenCalledWith("/goals/9");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("bar placement has Save in the header and no Cancel by default", () => {
    loaded();
    renderForm();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("cancel=true adds Cancel to the bar placement", () => {
    loaded();
    renderForm({ cancel: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("Save submits the registered values, then goes to returnTo", async () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F5";
    const onSubmit = vi.fn(async () => new Response("{}", { status: 200 }));
    renderForm({ onSubmit, savePlacement: "bottom" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Vacation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/goals/5"));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Vacation" });
  });

  it("uses saveLabel", () => {
    loaded();
    renderForm({ saveLabel: "Create goal" });
    expect(screen.getByRole("button", { name: "Create goal" })).toBeTruthy();
  });
});

describe("FormPage: submit state", () => {
  it("disables Save while saving", async () => {
    loaded();
    let finish: (r: Response) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<Response>((r) => { finish = r; }));
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true));
    finish(new Response("{}", { status: 200 }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows the server error and stays on the page", async () => {
    loaded();
    const onSubmit = vi.fn(async () => new Response(JSON.stringify({ error: "Name is required" }), { status: 400 }));
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Name is required");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("shows the 423 message (locked data) instead of a generic error", async () => {
    loaded();
    const onSubmit = vi.fn(async () => new Response("{}", { status: 423 }));
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unlock your data to make changes");
  });

  it("ctx.submit runs the same path as Save", async () => {
    loaded();
    const onSubmit = vi.fn(async () => new Response("{}", { status: 200 }));
    h.search = "returnTo=%2Fgoals%2F2";
    render(
      <FormPage<Goal[], Goal, Values> id="c" title="C" fallbackReturn="/goals" onSubmit={onSubmit}>
        {(ctx) => (
          <button type="button" onClick={() => void ctx.submit({ name: "Direct" })}>
            Direct submit
          </button>
        )}
      </FormPage>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Direct submit" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/goals/2"));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Direct" });
  });
});

describe("FormPage: load states", () => {
  it("shows a skeleton while loading and no form", () => {
    h.params = { id: "1" };
    renderForm({ load: { key: "/api/goals", select: (list, id) => list.find((g) => g.id === Number(id)) } });
    expect(screen.getByTestId("goal-edit-root")).toBeTruthy();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("passes the route id to a function key and select", () => {
    loaded();
    const key = vi.fn((id: string) => `/api/goals/${id}`);
    const select = vi.fn((list: Goal[], id: string) => list.find((g) => g.id === Number(id)));
    renderForm({ load: { key, select } });
    expect(key).toHaveBeenCalledWith("1");
    expect(select).toHaveBeenCalledWith([{ id: 1, name: "Emergency fund" }], "1");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Emergency fund");
  });

  it("shows an error with a retry that revalidates", () => {
    h.api.error = new Error("boom");
    renderForm({ load: { key: "/api/goals", select: () => undefined } });
    expect(screen.getByText("Couldn't load this page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(h.api.mutate).toHaveBeenCalled();
  });

  it("shows not found with a link back to returnTo", () => {
    loaded([]);
    h.search = "returnTo=%2Fgoals%2Fdone";
    renderForm({ load: { key: "/api/goals", select: (list, id) => list.find((g) => g.id === Number(id)) } });
    expect(screen.getByText(/doesn't exist or was deleted/)).toBeTruthy();
    const note = screen.getByText(/doesn't exist or was deleted/);
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/goals/done");
    expect(screen.queryByLabelText("Name")).toBeNull();
  });
});

describe("FormPage: delete", () => {
  it("opens from the overflow, confirms, then goes to returnTo when after is 'returnTo'", async () => {
    loaded();
    h.search = "returnTo=%2Fgoals%2F3";
    const request = vi.fn(async () => new Response("{}", { status: 200 }));
    renderForm({
      ...withLoad,
      delete: {
        label: "Delete goal",
        confirmTitle: "Delete goal",
        describe: (g) => <span>{g.name}</span>,
        request,
        after: "returnTo",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Emergency fund")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/goals/3"));
    expect(request).toHaveBeenCalledWith({ id: 1, name: "Emergency fund" });
  });

  it("goes to a fixed app path when after is a string", async () => {
    loaded();
    renderForm({
      ...withLoad,
      delete: {
        label: "Delete goal",
        confirmTitle: "Delete goal",
        describe: (g) => g.name,
        request: async () => new Response("{}", { status: 200 }),
        after: "/loans",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/loans"));
  });

  it("keeps the dialog open and shows the error when the delete fails", async () => {
    loaded();
    renderForm({
      ...withLoad,
      delete: {
        label: "Delete goal",
        confirmTitle: "Delete goal",
        describe: (g) => g.name,
        request: async () => new Response(JSON.stringify({ error: "Goal is linked" }), { status: 409 }),
        after: "returnTo",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete goal" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await screen.findByText("Goal is linked")).getAttribute("role")).toBe("alert");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("has no delete entry without a delete config", () => {
    loaded();
    renderForm();
    expect(screen.queryByRole("button", { name: "Delete goal" })).toBeNull();
  });
});

describe("FormPage: unsaved-changes guard", () => {
  it("is off by default: no beforeunload listener and Back is a link", () => {
    loaded();
    const add = vi.spyOn(window, "addEventListener");
    renderForm();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
  });

  it("when on: a change adds the beforeunload listener and Back asks before leaving", () => {
    loaded();
    const add = vi.spyOn(window, "addEventListener");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm({ dirtyGuard: true });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(confirm).toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });
});
