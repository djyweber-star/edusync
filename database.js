'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL absente : configure-la dans Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', error => {
  console.error('[SCHOOL FLOW] Erreur PostgreSQL :', error.message);
});

async function initDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schoolflow_documents (
        document_key TEXT PRIMARY KEY,
        school_id TEXT,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS schoolflow_documents_school_idx
      ON schoolflow_documents (school_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schoolflow_whatsapp_auth (
        namespace TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        auth_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (namespace, auth_key)
      )
    `);

    await client.query('COMMIT');

    console.log('[SCHOOL FLOW] PostgreSQL initialisé.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getDocument(documentKey) {
  const result = await pool.query(
    'SELECT data FROM schoolflow_documents WHERE document_key = $1',
    [String(documentKey)]
  );

  return result.rows[0]?.data ?? null;
}

async function setDocument(documentKey, data, schoolId = null) {
  await pool.query(`
    INSERT INTO schoolflow_documents
      (document_key, school_id, data, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (document_key)
    DO UPDATE SET
      school_id = EXCLUDED.school_id,
      data = EXCLUDED.data,
      updated_at = NOW()
  `, [
    String(documentKey),
    schoolId === null ? null : String(schoolId),
    JSON.stringify(data)
  ]);
}

async function deleteDocument(documentKey) {
  await pool.query(
    'DELETE FROM schoolflow_documents WHERE document_key = $1',
    [String(documentKey)]
  );
}

async function getAuthValue(namespace, authKey) {
  const result = await pool.query(`
    SELECT auth_value
    FROM schoolflow_whatsapp_auth
    WHERE namespace = $1 AND auth_key = $2
  `, [String(namespace), String(authKey)]);

  return result.rows[0]?.auth_value ?? null;
}

async function setAuthValue(namespace, authKey, value) {
  await pool.query(`
    INSERT INTO schoolflow_whatsapp_auth
      (namespace, auth_key, auth_value, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (namespace, auth_key)
    DO UPDATE SET
      auth_value = EXCLUDED.auth_value,
      updated_at = NOW()
  `, [
    String(namespace),
    String(authKey),
    JSON.stringify(value)
  ]);
}

async function deleteAuthValue(namespace, authKey) {
  await pool.query(`
    DELETE FROM schoolflow_whatsapp_auth
    WHERE namespace = $1 AND auth_key = $2
  `, [String(namespace), String(authKey)]);
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  initDatabase,
  getDocument,
  setDocument,
  deleteDocument,
  getAuthValue,
  setAuthValue,
  deleteAuthValue,
  closeDatabase
};
