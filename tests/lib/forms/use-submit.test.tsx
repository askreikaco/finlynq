/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSubmit, SUBMIT_FALLBACK_MESSAGE } from "@/lib/forms/use-submit";
import { DEK_LOCKED_MESSAGE } from "@/lib/save-error";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("useSubmit", () => {
  it("returns the Response and no error on 2xx", async () => {
    const { result } = renderHook(() => useSubmit());
    const ok = json(200, { id: 1 });
    let out: Response | null = null;
    await act(async () => {
      out = await result.current.run(async () => ok);
    });
    expect(out).toBe(ok);
    expect(result.current.error).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it("maps a 423 to the DEK-locked message, whatever the body says", async () => {
    const { result } = renderHook(() => useSubmit());
    let out: Response | null = new Response();
    await act(async () => {
      out = await result.current.run(async () => json(423, { error: "Encryption required" }));
    });
    expect(out).toBeNull();
    expect(result.current.error).toBe(DEK_LOCKED_MESSAGE);
    expect(DEK_LOCKED_MESSAGE).toBe("Unlock your data to make changes");
  });

  it("uses the server error body for other failures", async () => {
    const { result } = renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(async () => json(400, { error: "Name is required" }));
    });
    expect(result.current.error).toBe("Name is required");
  });

  it("uses the fallback when the failed body has no message", async () => {
    const { result } = renderHook(() => useSubmit({ fallback: "Save failed" }));
    await act(async () => {
      await result.current.run(async () => new Response("<html>", { status: 500 }));
    });
    expect(result.current.error).toBe("Save failed");
  });

  it("defaults the fallback to the shared generic message", async () => {
    const { result } = renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(async () => new Response("", { status: 500 }));
    });
    expect(result.current.error).toBe(SUBMIT_FALLBACK_MESSAGE);
  });

  it("sets the network message when fetch throws", async () => {
    const { result } = renderHook(() => useSubmit({ networkMessage: "Offline" }));
    let out: Response | null = new Response();
    await act(async () => {
      out = await result.current.run(async () => {
        throw new TypeError("Failed to fetch");
      });
    });
    expect(out).toBeNull();
    expect(result.current.error).toBe("Offline");
    expect(result.current.saving).toBe(false);
  });

  it("clears a previous error when a new run starts", async () => {
    const { result } = renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(async () => json(400, { error: "bad" }));
    });
    expect(result.current.error).toBe("bad");
    await act(async () => {
      await result.current.run(async () => json(200, {}));
    });
    expect(result.current.error).toBeNull();
  });
});
