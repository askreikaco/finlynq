/**
 * LoadState — the shape a page's load hook returns to a template.
 *
 * Templates (FormPage, ListPage, ReportPage) take `useLoad` and render from
 * `status`. `fromRecord` maps a useRecord result onto it with the same rules
 * FormPage applies today:
 *   notFound -> "notFound"; record present -> "ready";
 *   error with no record -> "error"; otherwise -> "loading".
 * Pages keep their own fetch code; this file holds no fetch.
 */

export type LoadStatus = "loading" | "error" | "notFound" | "ready";

export interface LoadState<R, X = unknown> {
  status: LoadStatus;
  record?: R;
  extra?: X;
  retry: () => void;
}

export type UseLoad<R, X> = (route: {
  params: Record<string, string | undefined>;
  returnTo: string;
}) => LoadState<R, X>;

export interface RecordLike<R> {
  record: R | undefined;
  notFound: boolean;
  error?: unknown;
  isLoading?: boolean;
  mutate: () => unknown;
}

export function fromRecord<R, X = unknown>(rec: RecordLike<R>): LoadState<R, X> {
  const retry = () => {
    void rec.mutate();
  };
  if (rec.notFound) return { status: "notFound", retry };
  if (rec.record !== undefined) return { status: "ready", record: rec.record, retry };
  if (rec.error) return { status: "error", retry };
  return { status: "loading", retry };
}
