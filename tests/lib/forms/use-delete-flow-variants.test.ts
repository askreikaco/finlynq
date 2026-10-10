/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";

type Rec = { id: number };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function confirmWith(hook: () => ReturnType<typeof useDeleteFlow<Rec>>) {
  const { result } = renderHook(hook);
  act(() => result.current.open({ id: 5 }));
  await act(async () => {
    await result.current.confirm();
  });
  return result;
}

describe("useDeleteFlow variants: defaults", () => {
  it("default keeps the dialog open with the server error (unchanged)", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({ request: async () => json(409, { error: "In use" }) }),
    );
    expect(result.current.target).toEqual({ id: 5 });
    expect(result.current.error).toBe("In use");
  });

  it("default treats a non-ok response as failure, not success", async () => {
    const onDeleted = vi.fn();
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({ request: async () => json(500, {}), onDeleted }),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Could not delete. Please try again.");
  });
});

describe("useDeleteFlow variants: keepOpenOnError", () => {
  it("false closes the dialog on server error and keeps the error", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => json(409, { error: "In use" }),
        keepOpenOnError: false,
      }),
    );
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBe("In use");
    expect(result.current.deleting).toBe(false);
  });

  it("false closes the dialog on a network throw and keeps the fallback", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => {
          throw new Error("offline");
        },
        keepOpenOnError: false,
        fallback: "Network down",
      }),
    );
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBe("Network down");
  });

  it("false does not change success", async () => {
    const onDeleted = vi.fn();
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => json(200, {}),
        onDeleted,
        keepOpenOnError: false,
      }),
    );
    expect(onDeleted).toHaveBeenCalledWith({ id: 5 });
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useDeleteFlow variants: ignoreStatus", () => {
  it("true treats a 500 response as success and calls onDeleted", async () => {
    const onDeleted = vi.fn();
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({ request: async () => json(500, {}), onDeleted, ignoreStatus: true }),
    );
    expect(onDeleted).toHaveBeenCalledWith({ id: 5 });
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("true still reports a thrown request as failure", async () => {
    const onDeleted = vi.fn();
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => {
          throw new Error("offline");
        },
        onDeleted,
        ignoreStatus: true,
      }),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Could not delete. Please try again.");
  });
});

describe("useDeleteFlow variants: errorMessage", () => {
  it("shows fixed copy instead of the server error body", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => json(409, { error: "In use" }),
        errorMessage: "Could not remove this goal.",
      }),
    );
    expect(result.current.error).toBe("Could not remove this goal.");
    expect(result.current.target).toEqual({ id: 5 });
  });

  it("fixed copy replaces the 423 DEK-locked mapping too", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => json(423, {}),
        errorMessage: "Fixed copy",
      }),
    );
    expect(result.current.error).toBe("Fixed copy");
  });

  it("fixed copy applies to the network-throw path", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({
        request: async () => {
          throw new Error("offline");
        },
        errorMessage: "Fixed copy",
      }),
    );
    expect(result.current.error).toBe("Fixed copy");
  });

  it("is cleared when the dialog is reopened", async () => {
    const result = await confirmWith(() =>
      useDeleteFlow<Rec>({ request: async () => json(409, {}), errorMessage: "Fixed copy" }),
    );
    expect(result.current.error).toBe("Fixed copy");
    act(() => result.current.open({ id: 6 }));
    expect(result.current.error).toBeNull();
  });
});
