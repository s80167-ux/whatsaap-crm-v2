import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export function useRealtimeWhatsAppAccounts(organizationId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabaseClient = supabase;

    if (!organizationId || !supabaseClient) {
      return;
    }

    const accountsChannel = supabaseClient
      .channel(`crm-whatsapp-accounts-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_accounts",
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts", organizationId] });
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(accountsChannel);
    };
  }, [organizationId, queryClient]);
}
