import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRealtimeAccessToken } from "../api/realtime";
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

      const conversationsChannel = realtimeClient
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

      const messagesChannel = realtimeClient
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

      channels.push(conversationsChannel, messagesChannel);
    }

    void subscribe();

    return () => {
      isSubscribed = false;
      channels.forEach((channel) => {
        void realtimeClient.removeChannel(channel);
      });
    };
  }, [activeConversationId, organizationId, queryClient]);
}
