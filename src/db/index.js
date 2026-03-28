const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.resolve(process.env.SQLITE_PATH || './data/soundboard.db');

// Crée le répertoire si nécessaire
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// WAL mode pour de meilleures performances en lecture concurrente
db.exec('PRAGMA journal_mode = WAL');

// Créer la table au premier démarrage
db.exec(`
    CREATE TABLE IF NOT EXISTS soundboard_sounds (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL UNIQUE,
        file_path   TEXT    NOT NULL,
        duration    REAL    NOT NULL,
        uploaded_by TEXT    NOT NULL DEFAULT 'anonymous',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        approved    INTEGER NOT NULL DEFAULT 1,
        plays_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sounds_approved ON soundboard_sounds (approved);
    CREATE INDEX IF NOT EXISTS idx_sounds_name     ON soundboard_sounds (name);
`);

console.log(`[DB] SQLite connecté : ${DB_PATH}`);

module.exports = db;
