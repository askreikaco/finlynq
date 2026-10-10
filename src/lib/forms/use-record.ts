"use client";

/**
 * useRecord(key, select) — one record for an edit form, on top of useApi.
 *
 * Some entities have no single GET (loans and goals read the list), so the
 * caller passes `select` to pick the record out of the response:
 *
 *   const { record, isLoading, error } = useRecord(
 *     "/api/loans", (list: Loan[]) => list.find((l) => l.id === id));
 *
 * - `key` null skips the request (e.g. while the id is unknown).
 * - `record` is undefined until loaded, and also when the list has no match.
 *   Check `notFound` to tell "no match" apart from "still loading".
 */
import { useApi } from "@/lib/data/use-api";

export function useRecord<T, R>(
  key: string | null,
  select: (data: T) => R | undefined,
) {
  const swr = useApi<T>(key);
  const record = swr.data === undefined ? undefined : select(swr.data);
  const notFound = swr.data !== undefined && record === undefined;
  return {
    record,
    notFound,
    data: swr.data,
    error: swr.error as unknown,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
  };
}
