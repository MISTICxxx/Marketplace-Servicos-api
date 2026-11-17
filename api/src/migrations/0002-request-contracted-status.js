export async function up(connection) {
  const [columns] = await connection.execute(`SELECT COLUMN_TYPE AS columnType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_requests' AND COLUMN_NAME='status'`)
  if (!columns[0]) throw new Error('Coluna service_requests.status não encontrada; o schema base não corresponde à aplicação.')

  if (!String(columns[0].columnType).includes("'contracted'")) {
    await connection.query("ALTER TABLE service_requests MODIFY status ENUM('open','cancelled','contracted') NOT NULL DEFAULT 'open'")
  }
}
