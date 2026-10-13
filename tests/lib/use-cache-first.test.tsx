/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const bad = (status = 500) => ({ ok: false, status, json: async () => ({}) }) as Response;

function wrapperWith(cache: Map<string, unknown>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
        {children}
      </SWRConfig>
    );
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("flag OFF ('0'): plain fetch, same as before", () => {
  beforeEach(() => window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0"));

  it("loads once and returns the data", async () => {
    fetchMock.mockResolvedValue(ok({ a: 1 }));
    const { result } = renderHook(() => useCacheFirstJson<{ a: number }>("/api/x"), { wrapper: wrapperWith(new Map()) });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ a: 1 }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/x");
  });

  it("a non-OK answer is an error with no data; reload fetches again", async () => {
    fetchMock.mockResolvedValueOnce(bad()).mockResolvedValueOnce(ok({ a: 2 }));
    const { result } = renderHook(() => useCacheFirstJson<{ a: number }>("/api/x"), { wrapper: wrapperWith(new Map()) });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual({ a: 2 }));
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("null url: no request, not loading", () => {
    const { result } = renderHook(() => useCacheFirstJson(null), { wrapper: wrapperWith(new Map()) });
    expect(result.current).toMatchObject({ data: undefined, loading: false, error: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keepPrevious keeps the last data while the next url loads", async () => {
    fetchMock.mockResolvedValueOnce(ok({ cur: "USD" })).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ u }) => useCacheFirstJson<{ cur: string }>(u, { keepPrevious: true }), {
      initialProps: { u: "/api/d?c=USD" },
      wrapper: wrapperWith(new Map()),
    });
    await waitFor(() => expect(result.current.data).toEqual({ cur: "USD" }));
    rerender({ u: "/api/d?c=VND" });
    expect(result.current.data).toEqual({ cur: "USD" });
    expect(result.current.loading).toBe(false);
  });

  it("without keepPrevious a new url goes back to loading", async () => {
    fetchMock.mockResolvedValueOnce(ok({ n: 1 })).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ u }) => useCacheFirstJson<{ n: number }>(u), {
      initialProps: { u: "/api/a" },
      wrapper: wrapperWith(new Map()),
    });
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    rerender({ u: "/api/b" });
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
  });
});

describe("flag ON: cache-first through the SWR cache", () => {
  beforeEach(() => window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1"));

  it("a second open paints the cached data at once, then revalidates", async () => {
    const cache = new Map<string, unknown>();
    fetchMock.mockResolvedValueOnce(ok({ v: "first" }));
    const first = renderHook(() => useCacheFirstJson<{ v: string }>("/api/x"), { wrapper: wrapperWith(cache) });
    await waitFor(() => expect(first.result.current.data).toEqual({ v: "first" }));
    first.unmount();

    let release: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => { release = res; }));
    const second = renderHook(() => useCacheFirstJson<{ v: string }>("/api/x"), { wrapper: wrapperWith(cache) });
    // Cached data is on screen before the network answers.
    expect(second.result.current.data).toEqual({ v: "first" });
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await act(async () => release!(ok({ v: "second" })));
    await waitFor(() => expect(second.result.current.data).toEqual({ v: "second" }));
  });

  it("offline after data: the data stays and there is no error", async () => {
    const cache = new Map<string, unknown>();
    fetchMock.mockResolvedValueOnce(ok({ v: 1 }));
    const first = renderHook(() => useCacheFirstJson<{ v: number }>("/api/x"), { wrapper: wrapperWith(cache) });
    await waitFor(() => expect(first.result.current.data).toEqual({ v: 1 }));
    first.unmount();

    fetchMock.mockRejectedValue(new TypeError("offline"));
    const second = renderHook(() => useCacheFirstJson<{ v: number }>("/api/x"), { wrapper: wrapperWith(cache) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(second.result.current.data).toEqual({ v: 1 });
    expect(second.result.current.error).toBe(false);
  });

  it("offline with nothing cached: error, no data", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const { result } = renderHook(() => useCacheFirstJson<{ v: number }>("/api/x"), { wrapper: wrapperWith(new Map()) });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
