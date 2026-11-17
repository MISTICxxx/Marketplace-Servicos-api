export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS service_orders (
    id CHAR(36) PRIMARY KEY,
    request_id CHAR(36) NOT NULL UNIQUE,
    customer_id CHAR(36) NOT NULL,
    provider_id CHAR(36) NOT NULL,
    quote_id CHAR(36) NOT NULL,
    quote_version_id CHAR(36) NOT NULL UNIQUE,
    quote_title VARCHAR(120) NOT NULL,
    version_number INT UNSIGNED NOT NULL,
    amount_cents BIGINT UNSIGNED NOT NULL,
    description TEXT NOT NULL,
    included_items JSON NOT NULL,
    excluded_items JSON NOT NULL,
    estimated_days SMALLINT UNSIGNED NULL,
    conditions TEXT NOT NULL,
    valid_until DATETIME NULL,
    status ENUM('contracted','in_progress','completed','cancelled') NOT NULL DEFAULT 'contracted',
    accepted_at DATETIME NOT NULL,
    INDEX idx_orders_customer(customer_id,accepted_at),
    INDEX idx_orders_provider(provider_id,accepted_at),
    CONSTRAINT ck_order_amount_positive CHECK(amount_cents > 0),
    CONSTRAINT fk_order_request FOREIGN KEY(request_id) REFERENCES service_requests(id),
    CONSTRAINT fk_order_customer FOREIGN KEY(customer_id) REFERENCES users(id),
    CONSTRAINT fk_order_provider FOREIGN KEY(provider_id) REFERENCES users(id),
    CONSTRAINT fk_order_quote FOREIGN KEY(quote_id) REFERENCES quotes(id),
    CONSTRAINT fk_order_quote_version FOREIGN KEY(quote_version_id) REFERENCES quote_versions(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}
