require('dotenv').config();

const { startServer } = require('./src/api/server');
const { startBot }    = require('./src/bot');

(async () => {
    try {
        await startServer();
        await startBot();
    } catch (err) {
        console.error('[Démarrage] Erreur fatale:', err.message);
        process.exit(1);
    }
})();
