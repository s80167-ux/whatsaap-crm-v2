IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'whatsapp_accounts'
      AND COLUMN_NAME = 'name'
)
BEGIN
    UPDATE whatsapp_accounts
    SET name = COALESCE(name, label, display_name)
    WHERE name IS NULL;

    ALTER TABLE whatsapp_accounts
    ALTER COLUMN name NVARCHAR(255) NULL;
END

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'whatsapp_accounts'
      AND COLUMN_NAME = 'phone_number'
)
BEGIN
    UPDATE whatsapp_accounts
    SET phone_number = COALESCE(phone_number, account_phone_e164)
    WHERE phone_number IS NULL;
END

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'whatsapp_accounts'
      AND COLUMN_NAME = 'phone_number_normalized'
)
BEGIN
    UPDATE whatsapp_accounts
    SET phone_number_normalized = COALESCE(phone_number_normalized, account_phone_normalized)
    WHERE phone_number_normalized IS NULL;
END

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'whatsapp_accounts'
      AND COLUMN_NAME = 'status'
)
BEGIN
    UPDATE whatsapp_accounts
    SET status = COALESCE(status, connection_status, 'disconnected')
    WHERE status IS NULL;
END
