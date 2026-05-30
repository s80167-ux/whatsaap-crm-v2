import re, subprocess, json

# Tables in the migration and their policy column references
tables = {
    "leads": "organization_id",
    "activities": "organization_id",
    "sales_orders": "organization_id",
    "sales_order_items": "sales_order_id",
    "conversation_assignments": "organization_id",
    "media_assets": "organization_id",
    "message_status_events": "message_id",
    "message_dispatch_outbox": "organization_id",
    "quick_reply_templates": "organization_id",
    "quick_reply_message_events": "organization_id",
    "campaign_sender_accounts": "organization_id",
    "email_senders": "organization_id",
    "email_campaigns": "organization_id",
    "email_campaign_recipients": "organization_id",
    "email_suppression_list": "organization_id",
    "email_send_events": "organization_id",
    "whatsapp_account_user_access": "organization_id",
    "notification_reads": "auth_user_id",
    "audit_logs": "organization_id",
    "contact_identities": "organization_id",
    "social_channel_accounts": "organization_id",
    "contact_summary": "organization_id",
    "dashboard_metrics_daily": "organization_id",
    "ai_usage_events": "organization_id",
    "usage_daily": "organization_id",
    "campaign_audience_groups": "organization_id",
    "campaign_audience_contacts": "organization_id",
    "inbox_thread_summary": "organization_id",
    "notifications": "organization_id",
    "organization_user_permissions": "organization_user_id",
    "whatsapp_account_sessions": "whatsapp_account_id",
    "whatsapp_connection_events": "whatsapp_account_id",
}

# Find CREATE TABLE for each
for tbl, expected_col in tables.items():
    result = subprocess.run(
        ["grep", "-ri", f"create table.*{tbl}", "database/", "infra/sql/"],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().splitlines()
    found = False
    for line in lines:
        if tbl in line and "create table" in line.lower():
            # Get the file and show next 20 lines
            filepath = line.split(":")[0]
            # find line number
            m = re.search(r"^(\d+)", "".join(line.split(":")[1:]))
            # Just grep the table definition
            grep_res = subprocess.run(
                ["grep", "-n", f"create table.*{tbl}", filepath],
                capture_output=True, text=True
            )
            print(f"\n=== {tbl} (expected: {expected_col}) ===")
            print(grep_res.stdout.strip())
            found = True
            break
    if not found:
        print(f"\n=== {tbl} (expected: {expected_col}) === NOT FOUND")
