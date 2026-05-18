import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRealtimeAccessToken } from "../api/realtime";
import { getStoredUser } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const userId = user?.id ?? null;
  const userRole = user?.role ?? null;
  const organizationId = user?.organizationId;

  useEffect(() => {
    const supabaseClient = supabase;

    if (!userId || !userRole || !supabaseClient) {
      return;
    }

    const realtimeClient = supabaseClient;
    let isSubscribed = true;
    const channels: Array<ReturnType<typeof realtimeClient.channel>> = [];

    async function subscribe() {
      try {
        const accessToken = await fetchRealtimeAccessToken();

        if (!isSubscribed) {
          return;
        }

        realtimeClient.realtime.setAuth(accessToken);
      } catch {
        return;
      }

      if (!isSubscribed) {
        return;
      }

      const changes = {
        event: "*",
        schema: "public",
        table: "notifications",
        ...(userRole === "super_admin" || !organizationId ? {} : { filter: `organization_id=eq.${organizationId}` })
      } as const;

      const channel = realtimeClient
        .channel(`crm-notifications-${userId}`)
        .on("postgres_changes", changes, () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        })
        .subscribe();

      channels.push(channel);
    }

    void subscribe();

    return () => {
      isSubscribed = false;
      channels.forEach((channel) => {
        void realtimeClient.removeChannel(channel);
      });
    };
  }, [organizationId, queryClient, userId, userRole]);
}
