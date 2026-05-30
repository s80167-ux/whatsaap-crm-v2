import re

with open("infra/sql/migrations/049_rls_critical_batch_2.sql", "r") as f:
    content = f.read()

# Extract all index definitions
index_pattern = re.compile(r"create index if not exists (\w+) on (\w+) \(([^)]+)\);\n")
indexes = {}
for m in index_pattern.finditer(content):
    idx_name, table, cols = m.groups()
    indexes[table] = f"    create index if not exists {idx_name} on {table} ({cols});\n"

# Remove the index section from the content
content = index_pattern.sub("", content)

# Remove the empty index header section
content = re.sub(r"-- =+\n-- 0\. INDEX:.*?-- =+\n", "", content, flags=re.DOTALL)

# For each DO block, find the table name and insert the index after ALTER TABLE
output_lines = []
for block in re.split(r"(?=DO \$\$)", content):
    if not block.strip().startswith("DO $$"):
        output_lines.append(block)
        continue

    # Find table name
    m = re.search(r"table_name = '([^']+)'", block)
    if not m:
        output_lines.append(block)
        continue
    table = m.group(1)

    idx_line = indexes.get(table, "")
    if idx_line:
        # Insert after ALTER TABLE ... enable row level security;
        block = re.sub(
            r"(alter table \w+ enable row level security;)\n",
            r"\1\n" + idx_line,
            block
        )

    output_lines.append(block)

with open("infra/sql/migrations/049_rls_critical_batch_2.sql", "w") as f:
    f.write("".join(output_lines))

print("Done. Moved indexes inside DO blocks.")
