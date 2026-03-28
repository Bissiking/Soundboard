-- Créer la base de données (à exécuter manuellement une fois)
-- CREATE DATABASE luma_soundboard;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS soundboard_sounds (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    file_path   VARCHAR(500) NOT NULL,
    duration    FLOAT NOT NULL,
    uploaded_by VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved    BOOLEAN NOT NULL DEFAULT FALSE,
    plays_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sounds_approved ON soundboard_sounds (approved);
CREATE INDEX IF NOT EXISTS idx_sounds_name ON soundboard_sounds (name);
