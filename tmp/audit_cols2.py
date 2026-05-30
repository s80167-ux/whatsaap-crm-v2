import re, subprocess

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

for tbl, expected in tables:
    res = subprocess.run(
        ["grep", "-riz", f"create table.*{tbl}\b"],
        capture_output=True, text=True
    )
    files = set()
    for line in res.stdout.splitlines():
        if ":" in line:
            files.add(line.split(":")[0])
    
    found = False
    for filepath in files:
        with open(filepath, "r") as f:
            content = f.read()
        m = re.search(
            rf"create table if not exists {tbl}\s*\((.*?)\);",
            content, re.DOTALL | re.IGNORECASE
        )
        if m:
            cols = m.group(1)
            # Check if expected column exists
            has_col = re.search(rf"\b{expected}\b", cols, re.IGNORECASE) is not None
            status = "OK" if has_col else "MISSING"
            print(f"{status}: {tbl}.{expected}")
            if not has_col:
                # Print all column names
                col_names = re.findall(r"^\s*(\w+)", cols, re.MULTILINE)
                print(f"  Available: {', '.join(col_names[:10])}")
            found = True
            break
    if not found:
        print(f"NOT_FOUND: {tbl}")
