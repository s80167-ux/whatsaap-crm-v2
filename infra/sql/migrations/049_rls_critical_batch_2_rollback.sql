-- ============================================
-- Rollback: 049_rls_critical_batch_2
-- Purpose: Disable RLS and drop all policies
--          created by Batch 2.
-- NOTE: Defensive -- skips tables that do not exist.
-- ============================================

-- 1. leads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    alter table leads disable row level security;
    drop policy if exists leads_select_policy on leads;
    drop policy if exists leads_insert_policy on leads;
    drop policy if exists leads_update_policy on leads;
    drop policy if exists leads_delete_policy on leads;
  END IF;
END $$;

-- 2. activities
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    alter table activities disable row level security;
    drop policy if exists activities_select_policy on activities;
    drop policy if exists activities_insert_policy on activities;
    drop policy if exists activities_update_policy on activities;
    drop policy if exists activities_delete_policy on activities;
  END IF;
END $$;

-- 3. sales_orders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_orders') THEN
    alter table sales_orders disable row level security;
    drop policy if exists sales_orders_select_policy on sales_orders;
    drop policy if exists sales_orders_insert_policy on sales_orders;
    drop policy if exists sales_orders_update_policy on sales_orders;
    drop policy if exists sales_orders_delete_policy on sales_orders;
  END IF;
END $$;

-- 4. sales_order_items
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_order_items') THEN
    alter table sales_order_items disable row level security;
    drop policy if exists sales_order_items_select_policy on sales_order_items;
    drop policy if exists sales_order_items_insert_policy on sales_order_items;
    drop policy if exists sales_order_items_update_policy on sales_order_items;
    drop policy if exists sales_order_items_delete_policy on sales_order_items;
  END IF;
END $$;

-- 5. conversation_assignments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversation_assignments') THEN
    alter table conversation_assignments disable row level security;
    drop policy if exists conversation_assignments_select_policy on conversation_assignments;
    drop policy if exists conversation_assignments_insert_policy on conversation_assignments;
    drop policy if exists conversation_assignments_update_policy on conversation_assignments;
    drop policy if exists conversation_assignments_delete_policy on conversation_assignments;
  END IF;
END $$;

-- 6. media_assets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'media_assets') THEN
    alter table media_assets disable row level security;
    drop policy if exists media_assets_select_policy on media_assets;
    drop policy if exists media_assets_insert_policy on media_assets;
    drop policy if exists media_assets_update_policy on media_assets;
    drop policy if exists media_assets_delete_policy on media_assets;
  END IF;
END $$;

-- 7. message_status_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_status_events') THEN
    alter table message_status_events disable row level security;
    drop policy if exists message_status_events_select_policy on message_status_events;
    drop policy if exists message_status_events_insert_policy on message_status_events;
    drop policy if exists message_status_events_update_policy on message_status_events;
    drop policy if exists message_status_events_delete_policy on message_status_events;
  END IF;
END $$;

-- 8. message_dispatch_outbox
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_dispatch_outbox') THEN
    alter table message_dispatch_outbox disable row level security;
    drop policy if exists message_dispatch_outbox_select_policy on message_dispatch_outbox;
    drop policy if exists message_dispatch_outbox_insert_policy on message_dispatch_outbox;
    drop policy if exists message_dispatch_outbox_update_policy on message_dispatch_outbox;
    drop policy if exists message_dispatch_outbox_delete_policy on message_dispatch_outbox;
  END IF;
END $$;

-- 9. quick_reply_templates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quick_reply_templates') THEN
    alter table quick_reply_templates disable row level security;
    drop policy if exists quick_reply_templates_select_policy on quick_reply_templates;
    drop policy if exists quick_reply_templates_insert_policy on quick_reply_templates;
    drop policy if exists quick_reply_templates_update_policy on quick_reply_templates;
    drop policy if exists quick_reply_templates_delete_policy on quick_reply_templates;
  END IF;
END $$;

-- 10. quick_reply_message_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quick_reply_message_events') THEN
    alter table quick_reply_message_events disable row level security;
    drop policy if exists quick_reply_message_events_select_policy on quick_reply_message_events;
    drop policy if exists quick_reply_message_events_insert_policy on quick_reply_message_events;
    drop policy if exists quick_reply_message_events_update_policy on quick_reply_message_events;
    drop policy if exists quick_reply_message_events_delete_policy on quick_reply_message_events;
  END IF;
END $$;

-- 11. campaign_sender_accounts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_sender_accounts') THEN
    alter table campaign_sender_accounts disable row level security;
    drop policy if exists campaign_sender_accounts_select_policy on campaign_sender_accounts;
    drop policy if exists campaign_sender_accounts_insert_policy on campaign_sender_accounts;
    drop policy if exists campaign_sender_accounts_update_policy on campaign_sender_accounts;
    drop policy if exists campaign_sender_accounts_delete_policy on campaign_sender_accounts;
  END IF;
END $$;

-- 12. email_senders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_senders') THEN
    alter table email_senders disable row level security;
    drop policy if exists email_senders_select_policy on email_senders;
    drop policy if exists email_senders_insert_policy on email_senders;
    drop policy if exists email_senders_update_policy on email_senders;
    drop policy if exists email_senders_delete_policy on email_senders;
  END IF;
END $$;

-- 13. email_campaigns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaigns') THEN
    alter table email_campaigns disable row level security;
    drop policy if exists email_campaigns_select_policy on email_campaigns;
    drop policy if exists email_campaigns_insert_policy on email_campaigns;
    drop policy if exists email_campaigns_update_policy on email_campaigns;
    drop policy if exists email_campaigns_delete_policy on email_campaigns;
  END IF;
END $$;

-- 14. email_campaign_recipients
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaign_recipients') THEN
    alter table email_campaign_recipients disable row level security;
    drop policy if exists email_campaign_recipients_select_policy on email_campaign_recipients;
    drop policy if exists email_campaign_recipients_insert_policy on email_campaign_recipients;
    drop policy if exists email_campaign_recipients_update_policy on email_campaign_recipients;
    drop policy if exists email_campaign_recipients_delete_policy on email_campaign_recipients;
  END IF;
END $$;

-- 15. email_suppression_list
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_suppression_list') THEN
    alter table email_suppression_list disable row level security;
    drop policy if exists email_suppression_list_select_policy on email_suppression_list;
    drop policy if exists email_suppression_list_insert_policy on email_suppression_list;
    drop policy if exists email_suppression_list_update_policy on email_suppression_list;
    drop policy if exists email_suppression_list_delete_policy on email_suppression_list;
  END IF;
END $$;

-- 16. email_send_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_send_events') THEN
    alter table email_send_events disable row level security;
    drop policy if exists email_send_events_select_policy on email_send_events;
    drop policy if exists email_send_events_insert_policy on email_send_events;
    drop policy if exists email_send_events_update_policy on email_send_events;
    drop policy if exists email_send_events_delete_policy on email_send_events;
  END IF;
END $$;

-- 17. whatsapp_account_user_access
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_account_user_access') THEN
    alter table whatsapp_account_user_access disable row level security;
    drop policy if exists whatsapp_account_user_access_select_policy on whatsapp_account_user_access;
    drop policy if exists whatsapp_account_user_access_insert_policy on whatsapp_account_user_access;
    drop policy if exists whatsapp_account_user_access_update_policy on whatsapp_account_user_access;
    drop policy if exists whatsapp_account_user_access_delete_policy on whatsapp_account_user_access;
  END IF;
END $$;

-- 18. notification_reads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_reads') THEN
    alter table notification_reads disable row level security;
    drop policy if exists notification_reads_select_policy on notification_reads;
    drop policy if exists notification_reads_insert_policy on notification_reads;
    drop policy if exists notification_reads_update_policy on notification_reads;
    drop policy if exists notification_reads_delete_policy on notification_reads;
  END IF;
END $$;

-- 19. audit_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    alter table audit_logs disable row level security;
    drop policy if exists audit_logs_select_policy on audit_logs;
    drop policy if exists audit_logs_insert_policy on audit_logs;
    drop policy if exists audit_logs_update_policy on audit_logs;
    drop policy if exists audit_logs_delete_policy on audit_logs;
  END IF;
END $$;

-- 20. contact_identities
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_identities') THEN
    alter table contact_identities disable row level security;
    drop policy if exists contact_identities_select_policy on contact_identities;
    drop policy if exists contact_identities_insert_policy on contact_identities;
    drop policy if exists contact_identities_update_policy on contact_identities;
    drop policy if exists contact_identities_delete_policy on contact_identities;
  END IF;
END $$;

-- 21. social_channel_accounts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'social_channel_accounts') THEN
    alter table social_channel_accounts disable row level security;
    drop policy if exists social_channel_accounts_select_policy on social_channel_accounts;
    drop policy if exists social_channel_accounts_insert_policy on social_channel_accounts;
    drop policy if exists social_channel_accounts_update_policy on social_channel_accounts;
    drop policy if exists social_channel_accounts_delete_policy on social_channel_accounts;
  END IF;
END $$;

-- 22. contact_summary
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_summary') THEN
    alter table contact_summary disable row level security;
    drop policy if exists contact_summary_select_policy on contact_summary;
    drop policy if exists contact_summary_insert_policy on contact_summary;
    drop policy if exists contact_summary_update_policy on contact_summary;
    drop policy if exists contact_summary_delete_policy on contact_summary;
  END IF;
END $$;

-- 23. dashboard_metrics_daily
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dashboard_metrics_daily') THEN
    alter table dashboard_metrics_daily disable row level security;
    drop policy if exists dashboard_metrics_daily_select_policy on dashboard_metrics_daily;
    drop policy if exists dashboard_metrics_daily_insert_policy on dashboard_metrics_daily;
    drop policy if exists dashboard_metrics_daily_update_policy on dashboard_metrics_daily;
    drop policy if exists dashboard_metrics_daily_delete_policy on dashboard_metrics_daily;
  END IF;
END $$;

-- 24. ai_usage_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_usage_events') THEN
    alter table ai_usage_events disable row level security;
    drop policy if exists ai_usage_events_select_policy on ai_usage_events;
    drop policy if exists ai_usage_events_insert_policy on ai_usage_events;
    drop policy if exists ai_usage_events_update_policy on ai_usage_events;
    drop policy if exists ai_usage_events_delete_policy on ai_usage_events;
  END IF;
END $$;

-- 25. usage_daily
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage_daily') THEN
    alter table usage_daily disable row level security;
    drop policy if exists usage_daily_select_policy on usage_daily;
    drop policy if exists usage_daily_insert_policy on usage_daily;
    drop policy if exists usage_daily_update_policy on usage_daily;
    drop policy if exists usage_daily_delete_policy on usage_daily;
  END IF;
END $$;

-- 26. campaign_audience_groups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_audience_groups') THEN
    alter table campaign_audience_groups disable row level security;
    drop policy if exists campaign_audience_groups_select_policy on campaign_audience_groups;
    drop policy if exists campaign_audience_groups_insert_policy on campaign_audience_groups;
    drop policy if exists campaign_audience_groups_update_policy on campaign_audience_groups;
    drop policy if exists campaign_audience_groups_delete_policy on campaign_audience_groups;
  END IF;
END $$;

-- 27. campaign_audience_contacts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_audience_contacts') THEN
    alter table campaign_audience_contacts disable row level security;
    drop policy if exists campaign_audience_contacts_select_policy on campaign_audience_contacts;
    drop policy if exists campaign_audience_contacts_insert_policy on campaign_audience_contacts;
    drop policy if exists campaign_audience_contacts_update_policy on campaign_audience_contacts;
    drop policy if exists campaign_audience_contacts_delete_policy on campaign_audience_contacts;
    drop index if exists idx_campaign_audience_contacts_org;
  END IF;
END $$;

-- 28. inbox_thread_summary
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_thread_summary') THEN
    drop policy if exists inbox_thread_summary_insert_policy on inbox_thread_summary;
    drop policy if exists inbox_thread_summary_update_policy on inbox_thread_summary;
    drop policy if exists inbox_thread_summary_delete_policy on inbox_thread_summary;
  END IF;
END $$;

-- 29. notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    drop policy if exists notifications_insert_policy on notifications;
    drop policy if exists notifications_update_policy on notifications;
    drop policy if exists notifications_delete_policy on notifications;
  END IF;
END $$;

-- 30. organization_user_permissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_user_permissions') THEN
    alter table organization_user_permissions disable row level security;
    drop policy if exists organization_user_permissions_select_policy on organization_user_permissions;
    drop policy if exists organization_user_permissions_insert_policy on organization_user_permissions;
    drop policy if exists organization_user_permissions_update_policy on organization_user_permissions;
    drop policy if exists organization_user_permissions_delete_policy on organization_user_permissions;
  END IF;
END $$;

-- 31. whatsapp_account_sessions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_account_sessions') THEN
    alter table whatsapp_account_sessions disable row level security;
    drop policy if exists whatsapp_account_sessions_select_policy on whatsapp_account_sessions;
    drop policy if exists whatsapp_account_sessions_insert_policy on whatsapp_account_sessions;
    drop policy if exists whatsapp_account_sessions_update_policy on whatsapp_account_sessions;
    drop policy if exists whatsapp_account_sessions_delete_policy on whatsapp_account_sessions;
  END IF;
END $$;

-- 32. whatsapp_connection_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_connection_events') THEN
    alter table whatsapp_connection_events disable row level security;
    drop policy if exists whatsapp_connection_events_select_policy on whatsapp_connection_events;
    drop policy if exists whatsapp_connection_events_insert_policy on whatsapp_connection_events;
    drop policy if exists whatsapp_connection_events_update_policy on whatsapp_connection_events;
    drop policy if exists whatsapp_connection_events_delete_policy on whatsapp_connection_events;
  END IF;
END $$;
