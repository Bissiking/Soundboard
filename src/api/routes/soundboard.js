const express = require('express');
const multer  = require('multer');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { getVoiceConnection } = require('@discordjs/voice');

const soundService = require('../../services/soundService');
const { processAudio, removeFile } = require('../../utils/ffmpeg');
const { playSound } = require('../../bot/handlers/audio');
const botController = require('../../bot/controller');

const VOICE_DEBUG = process.env.VOICE_DEBUG === '1';
function debugLog(...args) {
    if (!VOICE_DEBUG) return;
    console.log('[PlayRouteDebug]', ...args);
}

const router = express.Router();

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '1') * 1024 * 1024;
const UPLOADS_DIR   = path.resolve(process.env.UPLOADS_DIR || './uploads/sounds');

// Multer : stockage temporaire dans le dossier système
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter(_req, file, cb) {
        const allowed = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Format non supporté. Utilisez MP3 ou WAV.'));
        }
        cb(null, true);
    },
});

// ─── POST /api/soundboard/upload ────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
    const tempPath = req.file?.path;

    try {
        const { name, uploaded_by = 'anonymous' } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Le champ "name" est requis.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier audio fourni.' });
        }

        // Nom de fichier sûr : alphanumérique + tirets uniquement
        const safeName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '_');

        const { outputPath, duration } = await processAudio(tempPath, UPLOADS_DIR, safeName);

        const sound = await soundService.createSound({
            name:       name.trim(),
            filePath:   outputPath,
            duration,
            uploadedBy: uploaded_by,
        });

        return res.status(201).json({
            message: 'Son uploadé avec succès. En attente de validation.',
            sound: {
                id:       sound.id,
                name:     sound.name,
                duration: sound.duration,
            },
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Un son avec ce nom existe déjà.' });
        }
        console.error('[upload]', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        // Nettoyage du fichier temporaire dans tous les cas
        if (tempPath) await removeFile(tempPath);
    }
});

// ─── GET /api/soundboard/list ────────────────────────────────────────────────

router.get('/list', async (_req, res) => {
    try {
        const sounds = await soundService.listApprovedSounds();
        return res.json({ count: sounds.length, sounds });
    } catch (err) {
        console.error('[list]', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération des sons.' });
    }
});

// ─── POST /api/soundboard/play/:id ───────────────────────────────────────────

router.post('/play/:id', async (req, res) => {
    try {
        const guildId = req.body.guildId ?? process.env.DEFAULT_GUILD_ID ?? null;
        if (!guildId) {
            return res.status(400).json({ error: 'guildId requis (body ou DEFAULT_GUILD_ID).' });
        }
        debugLog(`Incoming play request soundId=${req.params.id} guildId=${guildId}`);

        const client = botController.getClient();
        if (!client?.isReady?.()) {
            return res.status(503).json({ error: 'Bot non prêt.' });
        }

        const sound = await soundService.getSoundById(req.params.id);
        if (!sound) {
            return res.status(404).json({ error: 'Son introuvable.' });
        }
        debugLog(`Resolved sound name=${sound.name} path=${sound.file_path}`);

        let connection = getVoiceConnection(guildId);
        if (!connection) {
            const targetChannelId = req.body.channelId ?? process.env.DEFAULT_VOICE_CHANNEL_ID ?? null;
            if (!targetChannelId) {
                return res.status(400).json({
                    error: 'Bot non connecté. Fournis channelId dans le body ou configure DEFAULT_VOICE_CHANNEL_ID.',
                });
            }

            const connectResult = await botController.connect(guildId, targetChannelId);
            if (!connectResult.ok) {
                return res.status(400).json({ error: connectResult.error });
            }
            debugLog(`Auto-connect success guildId=${guildId} channelId=${targetChannelId}`);
            connection = getVoiceConnection(guildId);
        }

        if (!connection) {
            return res.status(400).json({ error: 'Impossible de récupérer la connexion vocale du bot.' });
        }

        const channelId = connection.joinConfig?.channelId ?? null;
        if (!channelId) {
            return res.status(400).json({ error: 'Canal vocal cible introuvable.' });
        }

        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return res.status(404).json({ error: `Guilde ${guildId} introuvable.` });
        }

        const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isVoiceBased?.()) {
            return res.status(400).json({ error: 'Le canal du bot n’est pas un canal vocal valide.' });
        }
        debugLog(`Using voice channel id=${channelId} name=${channel?.name ?? 'unknown'}`);

        await playSound(channel, sound.file_path);
        await soundService.incrementPlays(sound.id);
        debugLog(`Playback started for sound=${sound.name} guildId=${guildId}`);

        return res.json({
            message: 'Lecture lancée sur Discord.',
            sound: {
                id: sound.id,
                name: sound.name,
                duration: sound.duration,
            },
            guildId,
            channelId,
        });
    } catch (err) {
        console.error('[play]', err.message);
        return res.status(500).json({ error: 'Erreur lors de la lecture via le bot Discord.' });
    }
});

// ─── GET /api/soundboard/stream/:id ──────────────────────────────────────────
// Doit être AVANT /:id pour qu'Express ne traite pas "stream" comme un UUID

router.get('/stream/:id', async (req, res) => {
    try {
        const sound = await soundService.getSoundById(req.params.id);
        if (!sound) return res.status(404).json({ error: 'Son introuvable.' });

        let stat;
        try {
            stat = await fs.promises.stat(sound.file_path);
        } catch {
            return res.status(404).json({ error: `Fichier audio introuvable sur le disque : ${sound.file_path}` });
        }

        const fileSize = stat.size;
        const range    = req.headers.range;

        if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end   = endStr ? parseInt(endStr, 10) : fileSize - 1;
            const chunk = end - start + 1;

            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': chunk,
                'Content-Type':   'audio/mpeg',
            });
            fs.createReadStream(sound.file_path, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Accept-Ranges':  'bytes',
                'Content-Type':   'audio/mpeg',
            });
            fs.createReadStream(sound.file_path).pipe(res);
        }
    } catch (err) {
        console.error('[stream]', err.message);
        return res.status(500).json({ error: 'Erreur streaming.' });
    }
});

// ─── GET /api/soundboard/:id ─────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
    try {
        const sound = await soundService.getSoundById(req.params.id);
        if (!sound) {
            return res.status(404).json({ error: 'Son introuvable.' });
        }
        return res.json(sound);
    } catch (err) {
        console.error('[getById]', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération du son.' });
    }
});

// ─── Gestion erreur Multer ────────────────────────────────────────────────────

router.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: `Fichier trop volumineux. Maximum: ${process.env.MAX_FILE_SIZE_MB || 1}MB`,
        });
    }
    return res.status(400).json({ error: err.message });
});

module.exports = router;
