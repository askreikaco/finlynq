/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";

type Rec = { id: number };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("useDeleteFlow", () => {
  it("open sets target, close clears it", () => {
    const { result } = renderHook(() =>
      useDeleteFlow<Rec>({ request: async () => json(200, {}) }),
    );
    act(() => result.current.open({ id: 7 }));
    expect(result.current.target).toEqual({ id: 7 });
    act(() => result.current.close());
    expect(result.current.target).toBeNull();
  });

  it("confirm calls request with the target and onDeleted on success", async () => {
    const request = vi.fn(async () => json(200, {}));
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeleteFlow<Rec>({ request, onDeleted }));
    act(() => result.current.open({ id: 3 }));
    await act(async () => {
      await result.current.confirm();
    });
    expect(request).toHaveBeenCalledWith({ id: 3 });
    expect(onDeleted).toHaveBeenCalledWith({ id: 3 });
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps the dialog open with the server error on failure", async () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteFlow<Rec>({ request: async () => json(409, { error: "In use" }), onDeleted }),
    );
    act(() => result.current.open({ id: 3 }));
    await act(async () => {
      await result.current.confirm();
    });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.target).toEqual({ id: 3 });
    expect(result.current.error).toBe("In use");
  });

  it("maps a 423 on delete to the DEK-locked message", async () => {
    const { result } = renderHook(() =>
      useDeleteFlow<Rec>({ request: async () => json(423, {}) }),
    );
    act(() => result.current.open({ id: 1 }));
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.error).toBe("Unlock your data to make changes");
  });

  it("confirm with no target does nothing", async () => {
    const request = vi.fn(async () => json(200, {}));
    const { result } = renderHook(() => useDeleteFlow<Rec>({ request }));
    await act(async () => {
      await result.current.confirm();
    });
    expect(request).not.toHaveBeenCalled();
  });
});
