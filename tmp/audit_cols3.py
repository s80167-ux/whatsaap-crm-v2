import re, subprocess, os

tables = [
    ("leads", "organization_id"),
    ("activities", "organization_id"),
    ("sales_orders", "organization_id"),
    ("sales_order_items", "sales_order_id"),
    ("conversation_assignments", "organization_id"),
    ("media_assets", "organization_id"),
    ("message_status_events", "message_id"),
    ("message_dispatch_outbox", "organization_id"),
    ("quick_reply_templates", "organization_id"),
    ("quick_reply_message_events", "organization_id"),
    ("campaign_sender_accounts", "organization_id"),
    ("email_senders", "organization_id"),
    ("email_campaigns", "organization_id"),
    ("email_campaign_recipients", "organization_id"),
    ("email_suppression_list", "organization_id"),
    ("email_send_events", "organization_id"),
    ("whatsapp_account_user_access", "organization_id"),
    ("notification_reads", "auth_user_id"),
    ("audit_logs", "organization_id"),
    ("contact_identities", "organization_id"),
    ("social_channel_accounts", "organization_id"),
    ("contact_summary", "organization_id"),
    ("dashboard_metrics_daily", "organization_id"),
    ("ai_usage_events", "organization_id"),
    ("usage_daily", "organization_id"),
    ("campaign_audience_groups", "organization_id"),
    ("campaign_audience_contacts", "organization_id"),
    ("inbox_thread_summary", "organization_id"),
    ("notifications", "organization_id"),
    ("organization_user_permissions", "organization_user_id"),
    ("whatsapp_account_sessions", "whatsapp_account_id"),
    ("whatsapp_connection_events", "whatsapp_account_id"),
]

sql_files = []
for root, dirs, files in os.walk("database"):
    for f in files:
        if f.endswith(".sql"):
            sql_files.append(os.path.join(root, f))
for root, dirs, files in os.walk("infra/sql"):
    for f in files:
        if f.endswith(".sql"):
            sql_files.append(os.path.join(root, f))

contents = {}
for fp in sql_files:
    with open(fp, "r") as f:
        contents[fp] = f.read()

for tbl, expected in tables:
    found = False
    for fp, content in contents.items():
        m = re.search(
            rf"create table if not exists {tbl}\s*\((.*?)\);",
            content, re.DOTALL | re.IGNORECASE
        )
        if m:
            cols = m.group(1)
            has_col = re.search(rf"\b{expected}\b", cols, re.IGNORECASE) is not None
            status = "OK" if has_col else "MISSING"
            print(f"{status}: {tbl}.{expected}")
            if not has_col:
                col_names = re.findall(r"^\s*(\w+)", cols, re.MULTILINE)
                print(f"  Available cols: {', '.join(col_names[:15])}")
            found = True
            break
    if not found:
        print(f"NOT_FOUND: {tbl}")
