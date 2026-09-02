const { neon } = require('@neondatabase/serverless');
const { Pool } = require('pg');

let pool = null;
let isConnected = false;

// Initialize database connection
function initDatabase() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.log('ℹ️ DATABASE_URL not set. Running in memory-only mode.');
      return false;
    }

    // Use neon serverless or standard pg pool
    if (databaseUrl.includes('neon.tech')) {
      pool = neon(databaseUrl);
      console.log('✅ Using Neon serverless driver');
    } else {
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false
        }
      });
      console.log('✅ Using PostgreSQL pool');
    }

    isConnected = true;
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.warn('⚠️ Database connection failed:', error.message);
    isConnected = false;
    return false;
  }
}

// Initialize on module load
initDatabase();

// Check if database is connected
function isConnectedFn() {
  return isConnected && pool !== null;
}

// Create tables if they don't exist
async function initializeTables() {
  if (!isConnectedFn()) return;

  try {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS diagnoses (
        id UUID PRIMARY KEY,
        disease VARCHAR(100) NOT NULL,
        confidence FLOAT NOT NULL,
        healthy BOOLEAN DEFAULT FALSE,
        image_size INTEGER,
        image_url TEXT,
        image_public_id VARCHAR(255),
        predictions JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_diagnoses_timestamp ON diagnoses(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_diagnoses_disease ON diagnoses(disease);
    `;

    // Fix: Use pool() not pool.query() for Neon
    await pool(createTableSQL);
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.warn('⚠️ Table initialization failed:', error.message);
  }
}

// Initialize tables
initializeTables();

// Save diagnosis record
async function saveDiagnosis(record) {
  if (!isConnectedFn()) {
    console.log('ℹ️ Database not connected. Skipping save.');
    return false;
  }

  try {
    const sql = `
      INSERT INTO diagnoses (id, disease, confidence, healthy, image_size, image_url, image_public_id, predictions, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const values = [
      record.id,
      record.disease,
      record.confidence,
      record.healthy,
      record.image_size || 0,
      record.image_url || null,
      record.image_public_id || null,
      JSON.stringify(record.predictions || []),
      record.timestamp || new Date().toISOString()
    ];

    // Fix: Use pool() not pool.query() for Neon
    const result = await pool(sql, values);
    return result[0]?.id || false;  // Neon returns array
  } catch (error) {
    console.error('❌ Save diagnosis error:', error.message);
    return false;
  }
}

// Get history records
async function getHistory(limit = 10, offset = 0) {
  if (!isConnectedFn()) {
    console.log('ℹ️ Database not connected. Returning empty.');
    return { records: [], total: 0 };
  }

  try {
    // Get total count
    const countResult = await pool('SELECT COUNT(*) FROM diagnoses');
    const total = parseInt(countResult[0]?.count || 0);

    // Get records
    const sql = `
      SELECT id, disease, confidence, healthy, image_url, timestamp
      FROM diagnoses
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool(sql, [limit, offset]);
    
    return {
      records: result || [],
      total: total
    };
  } catch (error) {
    console.error('❌ Get history error:', error.message);
    return { records: [], total: 0 };
  }
}

// Get single record
async function getRecord(id) {
  if (!isConnectedFn()) {
    console.log('ℹ️ Database not connected. Cannot fetch record.');
    return null;
  }

  try {
    const sql = `
      SELECT id, disease, confidence, healthy, image_size, image_url, image_public_id, predictions, timestamp
      FROM diagnoses
      WHERE id = $1
    `;

    const result = await pool(sql, [id]);
    return result[0] || null;
  } catch (error) {
    console.error('❌ Get record error:', error.message);
    return null;
  }
}

// Delete record
async function deleteRecord(id) {
  if (!isConnectedFn()) {
    console.log('ℹ️ Database not connected. Cannot delete.');
    return false;
  }

  try {
    const sql = 'DELETE FROM diagnoses WHERE id = $1 RETURNING id';
    const result = await pool(sql, [id]);
    return (result[0]?.id || false);
  } catch (error) {
    console.error('❌ Delete record error:', error.message);
    return false;
  }
}

module.exports = {
  isConnected: isConnectedFn,
  saveDiagnosis,
  getHistory,
  getRecord,
  deleteRecord,
  initDatabase,
  initializeTables
};