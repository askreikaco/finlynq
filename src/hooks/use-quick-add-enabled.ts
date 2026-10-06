import useSWR from "swr";

interface SessionData {
  quickAddEnabled?: boolean;
}

/**
 * Hook to fetch quickAddEnabled flag from /api/auth/session
 */
export function useQuickAddEnabled(): boolean {
  const { data: sessionData } = useSWR<SessionData>(
    "/api/auth/session",
    (url) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  // Default to false if flag not found in session
  return sessionData?.quickAddEnabled === true;
}
