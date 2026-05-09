import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getStoredUser } from "../lib/auth";

export function useRealtimeInbox(organizationIdOverride?: string | null, activeConversationId?: string) {
  const queryClient = useQueryClient();
  const organizationId = organizationIdOverride ?? getStoredUser()?.organizationId;

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
          void queryClient.refetchQueries({ queryKey: ["conversations"], type: "active" });
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
          void queryClient.refetchQueries({ queryKey: ["conversations"], type: "active" });
          void queryClient.refetchQueries({ queryKey: ["messages"], type: "active" });

          if (activeConversationId) {
            void queryClient.refetchQueries({
              queryKey: ["messages", activeConversationId],
              type: "active"
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(conversationsChannel);
      void supabaseClient.removeChannel(messagesChannel);
    };
  }, [activeConversationId, organizationId, queryClient]);
}
