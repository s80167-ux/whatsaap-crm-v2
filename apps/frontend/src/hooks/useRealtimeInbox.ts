import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getStoredUser } from "../lib/auth";

export function useRealtimeInbox() {
  const queryClient = useQueryClient();
  const organizationId = getStoredUser()?.organizationId;

  useEffect(() => {
    const supabaseClient = supabase;

    if (!organizationId || !supabaseClient) {
      return;
    }

    const conversationsChannel = supabaseClient
      .channel("crm-conversations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    const messagesChannel = supabaseClient
      .channel("crm-messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(conversationsChannel);
      void supabaseClient.removeChannel(messagesChannel);
    };
  }, [organizationId, queryClient]);
}
