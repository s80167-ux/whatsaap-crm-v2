import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredUser } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function useRealtimeCampaigns(organizationIdOverride?: string | null) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const organizationId = organizationIdOverride ?? getStoredUser()?.organizationId;

  useEffect(() => {
    const supabaseClient = supabase;

    if (!organizationId || !supabaseClient) {
      return;
    }

    const scheduleRefresh = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      }, 300);
    };

    const campaignsChannel = supabaseClient
      .channel(`crm-campaigns-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaigns",
          filter: `organization_id=eq.${organizationId}`
        },
        scheduleRefresh
      )
      .subscribe();

    const recipientsChannel = supabaseClient
      .channel(`crm-campaign-recipients-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_recipients",
          filter: `organization_id=eq.${organizationId}`
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      void supabaseClient.removeChannel(campaignsChannel);
      void supabaseClient.removeChannel(recipientsChannel);
    };
  }, [organizationId, queryClient]);
}