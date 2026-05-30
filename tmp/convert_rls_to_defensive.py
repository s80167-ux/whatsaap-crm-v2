import re

# Read the original migration
with open("infra/sql/migrations/049_rls_critical_batch_2.sql", "r") as f:
    content = f.read()

# Split into sections: indexes first, then table sections
lines = content.splitlines()

# Extract indexes (CREATE INDEX IF NOT EXISTS lines)
indexes = [line for line in lines if line.strip().startswith("create index if not exists")]

# Extract table sections — each starts with "-- ==..." header followed by ALTER TABLE
# We'll find all content between "-- ===" headers
sections = []
current_section = []
for line in lines:
    if re.match(r"^-- ={10,}", line):
        if current_section:
            sections.append(current_section)
        current_section = [line]
    else:
        current_section.append(line)
if current_section:
    sections.append(current_section)

# First section is the preamble/indexes, rest are table sections
table_sections = sections[2:]  # Skip preamble and index header

def wrap_section(section_lines):
    # Find table name from ALTER TABLE line
    table_name = None
    for line in section_lines:
        m = re.search(r"alter table\s+(?:if exists\s+)?(\w+)", line, re.IGNORECASE)
        if m:
            table_name = m.group(1)
            break
    if not table_name:
        # For inbox_thread_summary and notifications (no ALTER TABLE)
        for line in section_lines:
            m = re.search(r"drop policy if exists\s+(\w+)_\w+_policy\s+on\s+(\w+)", line, re.IGNORECASE)
            if m:
                table_name = m.group(2)
                break
    if not table_name:
        return "\n".join(section_lines)

    # Build the body (remove ALTER TABLE IF EXISTS since we'll handle it inside)
    body_lines = []
    for line in section_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("--"):
            continue
        # Skip the outer ALTER TABLE line (we'll add it inside)
        if re.match(r"^alter table\s+(?!if exists)", stripped, re.IGNORECASE):
            body_lines.append(f"    alter table {table_name} enable row level security;")
            continue
        if re.match(r"^alter table if exists", stripped, re.IGNORECASE):
            body_lines.append(f"    alter table if exists {table_name} enable row level security;")
            continue
        # Indent the rest
        body_lines.append("    " + line)

    body = "\n".join(body_lines)

    return f"""DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '{table_name}') THEN
{body}
  END IF;
END $$;
"""

output_lines = [
    "-- ============================================",
    "-- Migration: 049_rls_critical_batch_2",
    "-- Purpose: Enable and enforce row-level security",
    "--          on the second critical batch of tenant tables.",
    "-- NOTE: Defensive — skips tables that do not yet exist.",
    "-- ============================================",
    "",
    "-- ============================================================",
    "-- 0. INDEX: accelerate RLS org-membership subqueries",
    "-- ============================================================",
]

for idx in indexes:
    output_lines.append(idx)

output_lines.append("")

for section in table_sections:
    wrapped = wrap_section(section)
    output_lines.append(wrapped)
    output_lines.append("")

with open("infra/sql/migrations/049_rls_critical_batch_2.sql", "w") as f:
    f.write("\n".join(output_lines))

print("Done. Converted to defensive DO blocks.")
