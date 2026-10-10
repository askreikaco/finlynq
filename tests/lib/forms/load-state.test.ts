import { describe, it, expect, vi } from "vitest";
import { fromRecord } from "@/lib/forms/load-state";

type Loan = { id: number };
const mutate = () => vi.fn();

describe("fromRecord", () => {
  it("is loading while nothing has arrived", () => {
    const s = fromRecord<Loan>({ record: undefined, notFound: false, mutate: mutate() });
    expect(s.status).toBe("loading");
    expect(s.record).toBeUndefined();
  });

  it("is ready with the record once loaded", () => {
    const s = fromRecord<Loan>({ record: { id: 2 }, notFound: false, mutate: mutate() });
    expect(s.status).toBe("ready");
    expect(s.record).toEqual({ id: 2 });
    expect(s.extra).toBeUndefined();
  });

  it("is notFound when loaded but no match", () => {
    const s = fromRecord<Loan>({ record: undefined, notFound: true, mutate: mutate() });
    expect(s.status).toBe("notFound");
  });

  it("is error when the request failed and no record exists", () => {
    const s = fromRecord<Loan>({ record: undefined, notFound: false, error: new Error("x"), mutate: mutate() });
    expect(s.status).toBe("error");
  });

  it("keeps ready over a revalidation error when a record is present", () => {
    const s = fromRecord<Loan>({ record: { id: 1 }, notFound: false, error: new Error("x"), mutate: mutate() });
    expect(s.status).toBe("ready");
  });

  it("notFound wins over a stray error", () => {
    const s = fromRecord<Loan>({ record: undefined, notFound: true, error: new Error("x"), mutate: mutate() });
    expect(s.status).toBe("notFound");
  });

  it("retry calls mutate", () => {
    const m = vi.fn();
    const s = fromRecord<Loan>({ record: undefined, notFound: false, error: new Error("x"), mutate: m });
    s.retry();
    expect(m).toHaveBeenCalledTimes(1);
  });
});
