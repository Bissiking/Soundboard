const { randomUUID } = require('crypto');
const db = require('../db');

/**
 * Insère un nouveau son en base de données.
 * @param {{ name, filePath, duration, uploadedBy }} data
 * @returns {object} La ligne insérée
 */
function createSound({ name, filePath, duration, uploadedBy }) {
    const id = randomUUID();
    db.prepare(
        `INSERT INTO soundboard_sounds (id, name, file_path, duration, uploaded_by, approved)
         VALUES (?, ?, ?, ?, ?, 1)`
    ).run(id, name, filePath, duration, uploadedBy);
    return db.prepare('SELECT * FROM soundboard_sounds WHERE id = ?').get(id);
}

/**
 * Retourne tous les sons approuvés.
 * @returns {object[]}
 */
function listApprovedSounds() {
    return db.prepare(
        `SELECT id, name, duration, plays_count, created_at
         FROM soundboard_sounds
         WHERE approved = 1
         ORDER BY name ASC`
    ).all();
}

/**
 * Retourne un son par son id.
 * @param {string} id
 * @returns {object|null}
 */
function getSoundById(id) {
    return db.prepare('SELECT * FROM soundboard_sounds WHERE id = ?').get(id) ?? null;
}

/**
 * Retourne un son approuvé par son nom (insensible à la casse).
 * @param {string} name
 * @returns {object|null}
 */
function getSoundByName(name) {
    return db.prepare(
        `SELECT * FROM soundboard_sounds
         WHERE LOWER(name) = LOWER(?) AND approved = 1`
    ).get(name) ?? null;
}

/**
 * Retourne un son approuvé aléatoire.
 * @returns {object|null}
 */
function getRandomSound() {
    return db.prepare(
        `SELECT * FROM soundboard_sounds
         WHERE approved = 1
         ORDER BY RANDOM()
         LIMIT 1`
    ).get() ?? null;
}

/**
 * Incrémente le compteur de lectures d'un son.
 * @param {string} id
 */
function incrementPlays(id) {
    db.prepare(
        'UPDATE soundboard_sounds SET plays_count = plays_count + 1 WHERE id = ?'
    ).run(id);
}

module.exports = {
    createSound,
    listApprovedSounds,
    getSoundById,
    getSoundByName,
    getRandomSound,
    incrementPlays,
};
