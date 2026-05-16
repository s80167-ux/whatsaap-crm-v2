import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRealtimeAccessToken } from "../api/realtime";
import { supabase } from "../lib/supabase";
import { getStoredUser } from "../lib/auth";
import {
  hasConversationInCache,
  inboxQueryKeys,
  patchConversationFromMessageInCache,
  refetchActiveInboxFallback,
  upsertConversationInCache,
  upsertMessageInCache
} from "../lib/inboxCache";
import type { Conversation, Message } from "../types/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isRealtimeMessage(value: unknown): value is Message {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.conversation_id === "string" &&
    typeof value.organization_id === "string" &&
    typeof value.contact_id === "string" &&
    typeof value.whatsapp_account_id === "string" &&
    typeof value.direction === "string" &&
    typeof value.message_type === "string" &&
    typeof value.sent_at === "string"
  );
}

function isRealtimeConversation(value: unknown): value is Conversation {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.organization_id === "string" &&
    typeof value.whatsapp_account_id === "string" &&
    typeof value.contact_id === "string"
  );
}

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
          (payload) => {
            const conversation = payload.eventType === "DELETE" ? null : payload.new;

            if (!isRealtimeConversation(conversation) || !upsertConversationInCache(queryClient, conversation)) {
              refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationsRoot);
            }
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
          (payload) => {
            const message = payload.eventType === "DELETE" ? null : payload.new;

            if (!isRealtimeMessage(message)) {
              refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationsRoot);
              if (activeConversationId) {
                refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationMessagesRoot(activeConversationId));
              }
              return;
            }

            const patchedMessages = upsertMessageInCache(queryClient, message);
            const patchedConversation = patchConversationFromMessageInCache(queryClient, message, {
              incrementUnread: payload.eventType === "INSERT"
            });

            // The conversation list is fetched from a projection-backed endpoint,
            // while realtime events come from base tables. Refetch the active
            // conversation queries so latest ordering and preview stay aligned.
            refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationsRoot);

            if (!patchedMessages && activeConversationId === message.conversation_id) {
              refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationMessagesRoot(message.conversation_id));
            }

            if (!patchedConversation || !hasConversationInCache(queryClient, message.conversation_id)) {
              refetchActiveInboxFallback(queryClient, inboxQueryKeys.conversationsRoot);
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
