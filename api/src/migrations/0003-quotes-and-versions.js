export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS quotes (
    id CHAR(36) PRIMARY KEY,
    request_id CHAR(36) NOT NULL,
    conversation_id CHAR(36) NOT NULL,
    provider_id CHAR(36) NOT NULL,
    title VARCHAR(120) NOT NULL,
    status ENUM('active','withdrawn','accepted','closed') NOT NULL DEFAULT 'active',
    current_version_id CHAR(36) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_quotes_request_status(request_id,status),
    INDEX idx_quotes_conversation(conversation_id,created_at),
    CONSTRAINT fk_quote_request FOREIGN KEY(request_id) REFERENCES service_requests(id),
    CONSTRAINT fk_quote_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id),
    CONSTRAINT fk_quote_provider FOREIGN KEY(provider_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await connection.query(`CREATE TABLE IF NOT EXISTS quote_versions (
    id CHAR(36) PRIMARY KEY,
    quote_id CHAR(36) NOT NULL,
    version_number INT UNSIGNED NOT NULL,
    amount_cents BIGINT UNSIGNED NOT NULL,
    description TEXT NOT NULL,
    included_items JSON NOT NULL,
    excluded_items JSON NOT NULL,
    estimated_days SMALLINT UNSIGNED NULL,
    conditions TEXT NOT NULL,
    valid_until DATETIME NULL,
    issued_at DATETIME NOT NULL,
    UNIQUE KEY uq_quote_version_number(quote_id,version_number),
    INDEX idx_quote_versions_issued(quote_id,issued_at),
    CONSTRAINT ck_quote_amount_positive CHECK(amount_cents > 0),
    CONSTRAINT ck_quote_version_positive CHECK(version_number > 0),
    CONSTRAINT fk_quote_version_quote FOREIGN KEY(quote_id) REFERENCES quotes(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  const [currentVersionConstraints] = await connection.execute(`SELECT CONSTRAINT_NAME
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='quotes' AND CONSTRAINT_NAME='fk_quote_current_version'`)
  if (!currentVersionConstraints.length) {
    await connection.query('ALTER TABLE quotes ADD CONSTRAINT fk_quote_current_version FOREIGN KEY(current_version_id) REFERENCES quote_versions(id)')
  }

  const [triggers] = await connection.execute(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('trg_quote_versions_no_update','trg_quote_versions_no_delete')`)
  const triggerNames = new Set(triggers.map(({ TRIGGER_NAME: name }) => name))
  if (!triggerNames.has('trg_quote_versions_no_update')) {
    await connection.query(`CREATE TRIGGER trg_quote_versions_no_update BEFORE UPDATE ON quote_versions
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Quote versions are immutable'`)
  }
  if (!triggerNames.has('trg_quote_versions_no_delete')) {
    await connection.query(`CREATE TRIGGER trg_quote_versions_no_delete BEFORE DELETE ON quote_versions
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Quote versions are immutable'`)
  }
}
