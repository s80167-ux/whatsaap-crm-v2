import { useEffect, useRef } from "react";

export function useRefetchOnPageActive(refetch: () => void, enabled = true, minIntervalMs = 1000) {
  const lastRefetchAt = useRef(0);
  const refetchRef = useRef(refetch);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refetchIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastRefetchAt.current < minIntervalMs) {
        return;
      }

      lastRefetchAt.current = now;
      refetchRef.current();
    };

    document.addEventListener("visibilitychange", refetchIfVisible);
    window.addEventListener("focus", refetchIfVisible);

    return () => {
      document.removeEventListener("visibilitychange", refetchIfVisible);
      window.removeEventListener("focus", refetchIfVisible);
    };
  }, [enabled, minIntervalMs]);
}
