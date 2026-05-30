-- ============================================
-- Migration: 049_rls_critical_batch_2
-- Purpose: Enable and enforce row-level security
--          on the second critical batch of tenant tables.
-- NOTE: Defensive -- skips tables that do not yet exist.
-- ============================================


-- ============================================================
-- 1. leads
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    alter table leads enable row level security;
    create index if not exists idx_leads_org on leads (organization_id);
    drop policy if exists leads_select_policy on leads;
    create policy leads_select_policy on leads for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists leads_insert_policy on leads;
    create policy leads_insert_policy on leads for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists leads_update_policy on leads;
    create policy leads_update_policy on leads for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists leads_delete_policy on leads;
    create policy leads_delete_policy on leads for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 2. activities
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    alter table activities enable row level security;
    create index if not exists idx_activities_org on activities (organization_id);
    drop policy if exists activities_select_policy on activities;
    create policy activities_select_policy on activities for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists activities_insert_policy on activities;
    create policy activities_insert_policy on activities for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists activities_update_policy on activities;
    create policy activities_update_policy on activities for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists activities_delete_policy on activities;
    create policy activities_delete_policy on activities for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 3. sales_orders
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_orders') THEN
    alter table sales_orders enable row level security;
    create index if not exists idx_sales_orders_org on sales_orders (organization_id);
    drop policy if exists sales_orders_select_policy on sales_orders;
    create policy sales_orders_select_policy on sales_orders for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists sales_orders_insert_policy on sales_orders;
    create policy sales_orders_insert_policy on sales_orders for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists sales_orders_update_policy on sales_orders;
    create policy sales_orders_update_policy on sales_orders for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists sales_orders_delete_policy on sales_orders;
    create policy sales_orders_delete_policy on sales_orders for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 4. sales_order_items (joins through sales_orders)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_order_items') THEN
    alter table sales_order_items enable row level security;
    create index if not exists idx_sales_order_items_sales_order on sales_order_items (sales_order_id);
    drop policy if exists sales_order_items_select_policy on sales_order_items;
    create policy sales_order_items_select_policy on sales_order_items for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or sales_order_id in (
        select id from sales_orders
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists sales_order_items_insert_policy on sales_order_items;
    create policy sales_order_items_insert_policy on sales_order_items for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or sales_order_id in (
        select id from sales_orders
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists sales_order_items_update_policy on sales_order_items;
    create policy sales_order_items_update_policy on sales_order_items for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or sales_order_id in (
        select id from sales_orders
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    ) with check (
      is_platform_super_admin(auth.uid())
      or sales_order_id in (
        select id from sales_orders
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists sales_order_items_delete_policy on sales_order_items;
    create policy sales_order_items_delete_policy on sales_order_items for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or sales_order_id in (
        select id from sales_orders
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- ============================================================
-- 5. conversation_assignments
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_assignments') THEN
    alter table conversation_assignments enable row level security;
    create index if not exists idx_conversation_assignments_org on conversation_assignments (organization_id);
    drop policy if exists conversation_assignments_select_policy on conversation_assignments;
    create policy conversation_assignments_select_policy on conversation_assignments for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists conversation_assignments_insert_policy on conversation_assignments;
    create policy conversation_assignments_insert_policy on conversation_assignments for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists conversation_assignments_update_policy on conversation_assignments;
    create policy conversation_assignments_update_policy on conversation_assignments for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists conversation_assignments_delete_policy on conversation_assignments;
    create policy conversation_assignments_delete_policy on conversation_assignments for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 6. media_assets
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'media_assets') THEN
    alter table media_assets enable row level security;
    create index if not exists idx_media_assets_org on media_assets (organization_id);
    drop policy if exists media_assets_select_policy on media_assets;
    create policy media_assets_select_policy on media_assets for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists media_assets_insert_policy on media_assets;
    create policy media_assets_insert_policy on media_assets for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists media_assets_update_policy on media_assets;
    create policy media_assets_update_policy on media_assets for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists media_assets_delete_policy on media_assets;
    create policy media_assets_delete_policy on media_assets for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 7. message_status_events (joins through messages)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_status_events') THEN
    alter table message_status_events enable row level security;
    create index if not exists idx_message_status_events_message on message_status_events (message_id);
    drop policy if exists message_status_events_select_policy on message_status_events;
    create policy message_status_events_select_policy on message_status_events for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or message_id in (
        select id from messages
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists message_status_events_insert_policy on message_status_events;
    create policy message_status_events_insert_policy on message_status_events for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or message_id in (
        select id from messages
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists message_status_events_update_policy on message_status_events;
    create policy message_status_events_update_policy on message_status_events for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or message_id in (
        select id from messages
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    ) with check (
      is_platform_super_admin(auth.uid())
      or message_id in (
        select id from messages
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists message_status_events_delete_policy on message_status_events;
    create policy message_status_events_delete_policy on message_status_events for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or message_id in (
        select id from messages
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- ============================================================
-- 8. message_dispatch_outbox
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_dispatch_outbox') THEN
    alter table message_dispatch_outbox enable row level security;
    create index if not exists idx_message_dispatch_outbox_org on message_dispatch_outbox (organization_id);
    drop policy if exists message_dispatch_outbox_select_policy on message_dispatch_outbox;
    create policy message_dispatch_outbox_select_policy on message_dispatch_outbox for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists message_dispatch_outbox_insert_policy on message_dispatch_outbox;
    create policy message_dispatch_outbox_insert_policy on message_dispatch_outbox for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists message_dispatch_outbox_update_policy on message_dispatch_outbox;
    create policy message_dispatch_outbox_update_policy on message_dispatch_outbox for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists message_dispatch_outbox_delete_policy on message_dispatch_outbox;
    create policy message_dispatch_outbox_delete_policy on message_dispatch_outbox for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 9. quick_reply_templates
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quick_reply_templates') THEN
    alter table quick_reply_templates enable row level security;
    create index if not exists idx_quick_reply_templates_org on quick_reply_templates (organization_id);
    drop policy if exists quick_reply_templates_select_policy on quick_reply_templates;
    create policy quick_reply_templates_select_policy on quick_reply_templates for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_templates_insert_policy on quick_reply_templates;
    create policy quick_reply_templates_insert_policy on quick_reply_templates for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_templates_update_policy on quick_reply_templates;
    create policy quick_reply_templates_update_policy on quick_reply_templates for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_templates_delete_policy on quick_reply_templates;
    create policy quick_reply_templates_delete_policy on quick_reply_templates for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 10. quick_reply_message_events
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quick_reply_message_events') THEN
    alter table quick_reply_message_events enable row level security;
    create index if not exists idx_quick_reply_message_events_org on quick_reply_message_events (organization_id);
    drop policy if exists quick_reply_message_events_select_policy on quick_reply_message_events;
    create policy quick_reply_message_events_select_policy on quick_reply_message_events for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_message_events_insert_policy on quick_reply_message_events;
    create policy quick_reply_message_events_insert_policy on quick_reply_message_events for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_message_events_update_policy on quick_reply_message_events;
    create policy quick_reply_message_events_update_policy on quick_reply_message_events for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists quick_reply_message_events_delete_policy on quick_reply_message_events;
    create policy quick_reply_message_events_delete_policy on quick_reply_message_events for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 11. campaign_sender_accounts
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_sender_accounts') THEN
    alter table campaign_sender_accounts enable row level security;
    create index if not exists idx_campaign_sender_accounts_org on campaign_sender_accounts (organization_id);
    drop policy if exists campaign_sender_accounts_select_policy on campaign_sender_accounts;
    create policy campaign_sender_accounts_select_policy on campaign_sender_accounts for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_sender_accounts_insert_policy on campaign_sender_accounts;
    create policy campaign_sender_accounts_insert_policy on campaign_sender_accounts for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_sender_accounts_update_policy on campaign_sender_accounts;
    create policy campaign_sender_accounts_update_policy on campaign_sender_accounts for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_sender_accounts_delete_policy on campaign_sender_accounts;
    create policy campaign_sender_accounts_delete_policy on campaign_sender_accounts for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 12. email_senders
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_senders') THEN
    alter table email_senders enable row level security;
    create index if not exists idx_email_senders_org on email_senders (organization_id);
    drop policy if exists email_senders_select_policy on email_senders;
    create policy email_senders_select_policy on email_senders for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_senders_insert_policy on email_senders;
    create policy email_senders_insert_policy on email_senders for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_senders_update_policy on email_senders;
    create policy email_senders_update_policy on email_senders for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_senders_delete_policy on email_senders;
    create policy email_senders_delete_policy on email_senders for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 13. email_campaigns
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaigns') THEN
    alter table email_campaigns enable row level security;
    create index if not exists idx_email_campaigns_org on email_campaigns (organization_id);
    drop policy if exists email_campaigns_select_policy on email_campaigns;
    create policy email_campaigns_select_policy on email_campaigns for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaigns_insert_policy on email_campaigns;
    create policy email_campaigns_insert_policy on email_campaigns for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaigns_update_policy on email_campaigns;
    create policy email_campaigns_update_policy on email_campaigns for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaigns_delete_policy on email_campaigns;
    create policy email_campaigns_delete_policy on email_campaigns for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 14. email_campaign_recipients
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_recipients') THEN
    alter table email_campaign_recipients enable row level security;
    create index if not exists idx_email_campaign_recipients_org on email_campaign_recipients (organization_id);
    drop policy if exists email_campaign_recipients_select_policy on email_campaign_recipients;
    create policy email_campaign_recipients_select_policy on email_campaign_recipients for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaign_recipients_insert_policy on email_campaign_recipients;
    create policy email_campaign_recipients_insert_policy on email_campaign_recipients for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaign_recipients_update_policy on email_campaign_recipients;
    create policy email_campaign_recipients_update_policy on email_campaign_recipients for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_campaign_recipients_delete_policy on email_campaign_recipients;
    create policy email_campaign_recipients_delete_policy on email_campaign_recipients for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 15. email_suppression_list
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_suppression_list') THEN
    alter table email_suppression_list enable row level security;
    create index if not exists idx_email_suppression_list_org on email_suppression_list (organization_id);
    drop policy if exists email_suppression_list_select_policy on email_suppression_list;
    create policy email_suppression_list_select_policy on email_suppression_list for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_suppression_list_insert_policy on email_suppression_list;
    create policy email_suppression_list_insert_policy on email_suppression_list for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_suppression_list_update_policy on email_suppression_list;
    create policy email_suppression_list_update_policy on email_suppression_list for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_suppression_list_delete_policy on email_suppression_list;
    create policy email_suppression_list_delete_policy on email_suppression_list for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 16. email_send_events
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_send_events') THEN
    alter table email_send_events enable row level security;
    create index if not exists idx_email_send_events_org on email_send_events (organization_id);
    drop policy if exists email_send_events_select_policy on email_send_events;
    create policy email_send_events_select_policy on email_send_events for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_send_events_insert_policy on email_send_events;
    create policy email_send_events_insert_policy on email_send_events for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_send_events_update_policy on email_send_events;
    create policy email_send_events_update_policy on email_send_events for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists email_send_events_delete_policy on email_send_events;
    create policy email_send_events_delete_policy on email_send_events for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 17. whatsapp_account_user_access
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_account_user_access') THEN
    alter table whatsapp_account_user_access enable row level security;
    create index if not exists idx_whatsapp_account_user_access_org on whatsapp_account_user_access (organization_id);
    drop policy if exists whatsapp_account_user_access_select_policy on whatsapp_account_user_access;
    create policy whatsapp_account_user_access_select_policy on whatsapp_account_user_access for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists whatsapp_account_user_access_insert_policy on whatsapp_account_user_access;
    create policy whatsapp_account_user_access_insert_policy on whatsapp_account_user_access for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists whatsapp_account_user_access_update_policy on whatsapp_account_user_access;
    create policy whatsapp_account_user_access_update_policy on whatsapp_account_user_access for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists whatsapp_account_user_access_delete_policy on whatsapp_account_user_access;
    create policy whatsapp_account_user_access_delete_policy on whatsapp_account_user_access for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 18. notification_reads (self-scoped by auth_user_id)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_reads') THEN
    alter table notification_reads enable row level security;
    drop policy if exists notification_reads_select_policy on notification_reads;
    create policy notification_reads_select_policy on notification_reads for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or auth_user_id = auth.uid()
    );
    drop policy if exists notification_reads_insert_policy on notification_reads;
    create policy notification_reads_insert_policy on notification_reads for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or auth_user_id = auth.uid()
    );
    drop policy if exists notification_reads_update_policy on notification_reads;
    create policy notification_reads_update_policy on notification_reads for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or auth_user_id = auth.uid()
    ) with check (
      is_platform_super_admin(auth.uid())
      or auth_user_id = auth.uid()
    );
    drop policy if exists notification_reads_delete_policy on notification_reads;
    create policy notification_reads_delete_policy on notification_reads for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or auth_user_id = auth.uid()
    );
  END IF;
END $$;

-- ============================================================
-- 19. audit_logs (nullable org_id for platform events)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    alter table audit_logs enable row level security;
    create index if not exists idx_audit_logs_org on audit_logs (organization_id);
    drop policy if exists audit_logs_select_policy on audit_logs;
    create policy audit_logs_select_policy on audit_logs for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists audit_logs_insert_policy on audit_logs;
    create policy audit_logs_insert_policy on audit_logs for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      or organization_id is null
    );
    drop policy if exists audit_logs_update_policy on audit_logs;
    create policy audit_logs_update_policy on audit_logs for update to authenticated using (is_platform_super_admin(auth.uid()))
    with check (is_platform_super_admin(auth.uid()));
    drop policy if exists audit_logs_delete_policy on audit_logs;
    create policy audit_logs_delete_policy on audit_logs for delete to authenticated using (is_platform_super_admin(auth.uid()));
  END IF;
END $$;

-- ============================================================
-- 20. contact_identities
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_identities') THEN
    alter table contact_identities enable row level security;
    create index if not exists idx_contact_identities_org on contact_identities (organization_id);
    drop policy if exists contact_identities_select_policy on contact_identities;
    create policy contact_identities_select_policy on contact_identities for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_identities_insert_policy on contact_identities;
    create policy contact_identities_insert_policy on contact_identities for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_identities_update_policy on contact_identities;
    create policy contact_identities_update_policy on contact_identities for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_identities_delete_policy on contact_identities;
    create policy contact_identities_delete_policy on contact_identities for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 21. social_channel_accounts
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'social_channel_accounts') THEN
    alter table social_channel_accounts enable row level security;
    create index if not exists idx_social_channel_accounts_org on social_channel_accounts (organization_id);
    drop policy if exists social_channel_accounts_select_policy on social_channel_accounts;
    create policy social_channel_accounts_select_policy on social_channel_accounts for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists social_channel_accounts_insert_policy on social_channel_accounts;
    create policy social_channel_accounts_insert_policy on social_channel_accounts for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists social_channel_accounts_update_policy on social_channel_accounts;
    create policy social_channel_accounts_update_policy on social_channel_accounts for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists social_channel_accounts_delete_policy on social_channel_accounts;
    create policy social_channel_accounts_delete_policy on social_channel_accounts for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 22. contact_summary
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_summary') THEN
    alter table contact_summary enable row level security;
    create index if not exists idx_contact_summary_org on contact_summary (organization_id);
    drop policy if exists contact_summary_select_policy on contact_summary;
    create policy contact_summary_select_policy on contact_summary for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_summary_insert_policy on contact_summary;
    create policy contact_summary_insert_policy on contact_summary for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_summary_update_policy on contact_summary;
    create policy contact_summary_update_policy on contact_summary for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists contact_summary_delete_policy on contact_summary;
    create policy contact_summary_delete_policy on contact_summary for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 23. dashboard_metrics_daily
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dashboard_metrics_daily') THEN
    alter table dashboard_metrics_daily enable row level security;
    create index if not exists idx_dashboard_metrics_daily_org on dashboard_metrics_daily (organization_id);
    drop policy if exists dashboard_metrics_daily_select_policy on dashboard_metrics_daily;
    create policy dashboard_metrics_daily_select_policy on dashboard_metrics_daily for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists dashboard_metrics_daily_insert_policy on dashboard_metrics_daily;
    create policy dashboard_metrics_daily_insert_policy on dashboard_metrics_daily for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists dashboard_metrics_daily_update_policy on dashboard_metrics_daily;
    create policy dashboard_metrics_daily_update_policy on dashboard_metrics_daily for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists dashboard_metrics_daily_delete_policy on dashboard_metrics_daily;
    create policy dashboard_metrics_daily_delete_policy on dashboard_metrics_daily for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 24. ai_usage_events
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_usage_events') THEN
    alter table ai_usage_events enable row level security;
    create index if not exists idx_ai_usage_events_org on ai_usage_events (organization_id);
    drop policy if exists ai_usage_events_select_policy on ai_usage_events;
    create policy ai_usage_events_select_policy on ai_usage_events for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists ai_usage_events_insert_policy on ai_usage_events;
    create policy ai_usage_events_insert_policy on ai_usage_events for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists ai_usage_events_update_policy on ai_usage_events;
    create policy ai_usage_events_update_policy on ai_usage_events for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists ai_usage_events_delete_policy on ai_usage_events;
    create policy ai_usage_events_delete_policy on ai_usage_events for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 25. usage_daily
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage_daily') THEN
    alter table usage_daily enable row level security;
    create index if not exists idx_usage_daily_org on usage_daily (organization_id);
    drop policy if exists usage_daily_select_policy on usage_daily;
    create policy usage_daily_select_policy on usage_daily for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists usage_daily_insert_policy on usage_daily;
    create policy usage_daily_insert_policy on usage_daily for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists usage_daily_update_policy on usage_daily;
    create policy usage_daily_update_policy on usage_daily for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists usage_daily_delete_policy on usage_daily;
    create policy usage_daily_delete_policy on usage_daily for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 26. campaign_audience_groups
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_audience_groups') THEN
    alter table campaign_audience_groups enable row level security;
    create index if not exists idx_campaign_audience_groups_org on campaign_audience_groups (organization_id);
    drop policy if exists campaign_audience_groups_select_policy on campaign_audience_groups;
    create policy campaign_audience_groups_select_policy on campaign_audience_groups for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_groups_insert_policy on campaign_audience_groups;
    create policy campaign_audience_groups_insert_policy on campaign_audience_groups for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_groups_update_policy on campaign_audience_groups;
    create policy campaign_audience_groups_update_policy on campaign_audience_groups for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_groups_delete_policy on campaign_audience_groups;
    create policy campaign_audience_groups_delete_policy on campaign_audience_groups for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 27. campaign_audience_contacts (direct organization_id)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_audience_contacts') THEN
    alter table campaign_audience_contacts enable row level security;
    create index if not exists idx_campaign_audience_contacts_org on campaign_audience_contacts (organization_id);
    drop policy if exists campaign_audience_contacts_select_policy on campaign_audience_contacts;
    create policy campaign_audience_contacts_select_policy on campaign_audience_contacts for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_contacts_insert_policy on campaign_audience_contacts;
    create policy campaign_audience_contacts_insert_policy on campaign_audience_contacts for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_contacts_update_policy on campaign_audience_contacts;
    create policy campaign_audience_contacts_update_policy on campaign_audience_contacts for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists campaign_audience_contacts_delete_policy on campaign_audience_contacts;
    create policy campaign_audience_contacts_delete_policy on campaign_audience_contacts for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 28. inbox_thread_summary (missing I/U/D from Batch 1)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_thread_summary') THEN
    drop policy if exists inbox_thread_summary_insert_policy on inbox_thread_summary;
    create policy inbox_thread_summary_insert_policy on inbox_thread_summary for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists inbox_thread_summary_update_policy on inbox_thread_summary;
    create policy inbox_thread_summary_update_policy on inbox_thread_summary for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists inbox_thread_summary_delete_policy on inbox_thread_summary;
    create policy inbox_thread_summary_delete_policy on inbox_thread_summary for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 29. notifications (missing I/U/D -- already enabled in 027)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    drop policy if exists notifications_insert_policy on notifications;
    create policy notifications_insert_policy on notifications for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists notifications_update_policy on notifications;
    create policy notifications_update_policy on notifications for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
    drop policy if exists notifications_delete_policy on notifications;
    create policy notifications_delete_policy on notifications for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- ============================================================
-- 30. organization_user_permissions (joins through organization_users)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_user_permissions') THEN
    alter table organization_user_permissions enable row level security;
    drop policy if exists organization_user_permissions_select_policy on organization_user_permissions;
    create policy organization_user_permissions_select_policy on organization_user_permissions for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_user_id in (
        select id from organization_users
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists organization_user_permissions_insert_policy on organization_user_permissions;
    create policy organization_user_permissions_insert_policy on organization_user_permissions for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or organization_user_id in (
        select id from organization_users
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists organization_user_permissions_update_policy on organization_user_permissions;
    create policy organization_user_permissions_update_policy on organization_user_permissions for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_user_id in (
        select id from organization_users
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    ) with check (
      is_platform_super_admin(auth.uid())
      or organization_user_id in (
        select id from organization_users
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists organization_user_permissions_delete_policy on organization_user_permissions;
    create policy organization_user_permissions_delete_policy on organization_user_permissions for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or organization_user_id in (
        select id from organization_users
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- ============================================================
-- 31. whatsapp_account_sessions (joins through whatsapp_accounts)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_account_sessions') THEN
    alter table whatsapp_account_sessions enable row level security;
    drop policy if exists whatsapp_account_sessions_select_policy on whatsapp_account_sessions;
    create policy whatsapp_account_sessions_select_policy on whatsapp_account_sessions for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_account_sessions_insert_policy on whatsapp_account_sessions;
    create policy whatsapp_account_sessions_insert_policy on whatsapp_account_sessions for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_account_sessions_update_policy on whatsapp_account_sessions;
    create policy whatsapp_account_sessions_update_policy on whatsapp_account_sessions for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    ) with check (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_account_sessions_delete_policy on whatsapp_account_sessions;
    create policy whatsapp_account_sessions_delete_policy on whatsapp_account_sessions for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- ============================================================
-- 32. whatsapp_connection_events (joins through whatsapp_accounts)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_connection_events') THEN
    alter table whatsapp_connection_events enable row level security;
    drop policy if exists whatsapp_connection_events_select_policy on whatsapp_connection_events;
    create policy whatsapp_connection_events_select_policy on whatsapp_connection_events for select to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_connection_events_insert_policy on whatsapp_connection_events;
    create policy whatsapp_connection_events_insert_policy on whatsapp_connection_events for insert to authenticated with check (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_connection_events_update_policy on whatsapp_connection_events;
    create policy whatsapp_connection_events_update_policy on whatsapp_connection_events for update to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    ) with check (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
    drop policy if exists whatsapp_connection_events_delete_policy on whatsapp_connection_events;
    create policy whatsapp_connection_events_delete_policy on whatsapp_connection_events for delete to authenticated using (
      is_platform_super_admin(auth.uid())
      or whatsapp_account_id in (
        select id from whatsapp_accounts
        where organization_id in (select organization_id from organization_users where auth_user_id = auth.uid())
      )
    );
  END IF;
END $$;
