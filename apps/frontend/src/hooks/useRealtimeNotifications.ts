import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredUser } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const organizationId = user?.organizationId;

  useEffect(() => {
    const supabaseClient = supabase;

    if (!user || !supabaseClient) {
      return;
    }

    const changes = {
      event: "*",
      schema: "public",
      table: "notifications",
      ...(user.role === "super_admin" || !organizationId ? {} : { filter: `organization_id=eq.${organizationId}` })
    } as const;

    const channel = supabaseClient
      .channel(`crm-notifications-${user.authUserId ?? user.id ?? "current"}`)
      .on("postgres_changes", changes, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [organizationId, queryClient, user]);
}
