const express    = require('express');
const controller = require('../../bot/controller');

const router = express.Router();

// ─── GET /api/bot/status ─────────────────────────────────────────────────────

router.get('/status', (req, res) => {
    const guildId = req.query.guildId ?? process.env.DEFAULT_GUILD_ID ?? null;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return res.json(controller.getStatus(guildId));
});

// ─── POST /api/bot/connect ───────────────────────────────────────────────────

router.post('/connect', async (req, res) => {
    const guildId   = req.body.guildId   ?? process.env.DEFAULT_GUILD_ID;
    const channelId = req.body.channelId ?? process.env.DEFAULT_VOICE_CHANNEL_ID;

    if (!guildId || !channelId) {
        return res.status(400).json({
            error: 'guildId et channelId requis (body ou DEFAULT_GUILD_ID / DEFAULT_VOICE_CHANNEL_ID dans .env).',
        });
    }

    try {
        const result = await controller.connect(guildId, channelId);
        if (!result.ok) return res.status(400).json({ error: result.error });
        return res.json({ message: 'Bot connecté.', ...controller.getStatus(guildId) });
    } catch (err) {
        console.error('[bot/connect]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/bot/disconnect ────────────────────────────────────────────────

router.post('/disconnect', (req, res) => {
    const guildId = req.body.guildId ?? process.env.DEFAULT_GUILD_ID;
    if (!guildId) return res.status(400).json({ error: 'guildId requis.' });

    const result = controller.disconnect(guildId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ message: 'Bot déconnecté.' });
});

module.exports = router;
