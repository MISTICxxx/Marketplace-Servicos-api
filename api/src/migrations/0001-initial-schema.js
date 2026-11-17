export async function up(connection) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL, role ENUM('customer','provider') NOT NULL,
      city VARCHAR(100) NOT NULL DEFAULT '', region VARCHAR(50) NOT NULL DEFAULT '',
      bio VARCHAR(2000) NOT NULL DEFAULT '', created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS provider_profiles (
      user_id CHAR(36) PRIMARY KEY, specialty VARCHAR(100) NOT NULL DEFAULT '',
      summary VARCHAR(300) NOT NULL DEFAULT '', categories JSON NOT NULL,
      neighborhoods JSON NOT NULL, services JSON NOT NULL, active TINYINT(1) NOT NULL DEFAULT 0,
      CONSTRAINT fk_provider_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS service_requests (
      id CHAR(36) PRIMARY KEY, owner_id CHAR(36) NOT NULL, title VARCHAR(120) NOT NULL,
      category_id VARCHAR(40) NOT NULL, description TEXT NOT NULL, city VARCHAR(100) NOT NULL,
      region VARCHAR(50) NOT NULL, neighborhood VARCHAR(100) NULL, desired_date DATE NULL,
      availability VARCHAR(200) NULL, budget_min DECIMAL(12,2) NULL, budget_max DECIMAL(12,2) NULL,
      prefers_proposals TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('open','cancelled') NOT NULL DEFAULT 'open', created_at VARCHAR(30) NOT NULL,
      updated_at VARCHAR(30) NOT NULL, INDEX idx_requests_owner_created(owner_id,created_at),
      CONSTRAINT fk_request_owner FOREIGN KEY(owner_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS request_history (
      id CHAR(36) PRIMARY KEY, request_id CHAR(36) NOT NULL, event VARCHAR(20) NOT NULL,
      description VARCHAR(255) NOT NULL, created_at VARCHAR(30) NOT NULL,
      CONSTRAINT fk_history_request FOREIGN KEY(request_id) REFERENCES service_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id CHAR(36) PRIMARY KEY, request_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
      provider_id CHAR(36) NOT NULL, created_at VARCHAR(30) NOT NULL, updated_at VARCHAR(30) NOT NULL,
      last_message_at VARCHAR(30) NULL, UNIQUE KEY uq_request_provider(request_id,provider_id),
      CONSTRAINT fk_conversation_request FOREIGN KEY(request_id) REFERENCES service_requests(id),
      CONSTRAINT fk_conversation_owner FOREIGN KEY(owner_id) REFERENCES users(id),
      CONSTRAINT fk_conversation_provider FOREIGN KEY(provider_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS messages (
      id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, sender_id CHAR(36) NOT NULL,
      sender_type ENUM('customer','provider') NOT NULL, text VARCHAR(2000) NOT NULL,
      sent_at VARCHAR(30) NOT NULL, read_at VARCHAR(30) NULL, INDEX idx_messages_conversation(conversation_id,sent_at),
      CONSTRAINT fk_message_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_message_sender FOREIGN KEY(sender_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ]

  for (const statement of statements) await connection.query(statement)
}
