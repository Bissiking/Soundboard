const express         = require('express');
const path            = require('path');
const soundboardRoutes = require('./routes/soundboard');
const botRoutes        = require('./routes/bot');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Servir l'interface web (public/ à la racine du projet)
app.use(express.static(path.join(__dirname, '../../public')));

// Routes API
app.use('/api/soundboard', soundboardRoutes);
app.use('/api/bot', botRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// 404 générique
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable.' }));

// Gestionnaire d'erreurs global
app.use((err, _req, res, _next) => {
    console.error('[API]', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
});

/**
 * Démarre le serveur HTTP.
 * @returns {Promise<import('http').Server>}
 */
async function startServer() {
    const port = parseInt(process.env.PORT || '3000');

    return new Promise((resolve, reject) => {
        const server = app.listen(port, (err) => {
            if (err) return reject(err);
            console.log(`[API] Serveur démarré sur http://localhost:${port}`);
            resolve(server);
        });
    });
}

module.exports = { startServer };
