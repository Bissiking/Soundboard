const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    getVoiceConnection,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
} = require('@discordjs/voice');

const VOICE_DEBUG = process.env.VOICE_DEBUG === '1';

// Un seul player par guilde : Map<guildId, AudioPlayer>
const players = new Map();
// Timer d'auto-déconnexion après inactivité : Map<guildId, Timeout>
const idleDisconnectTimers = new Map();
const DEFAULT_IDLE_DISCONNECT_MS = 120_000;

function getIdleDisconnectMs() {
    const raw = Number.parseInt(process.env.BOT_AUTO_DISCONNECT_MS || '', 10);
    if (Number.isFinite(raw) && raw >= 0) return raw;
    return DEFAULT_IDLE_DISCONNECT_MS;
}

function debugLog(...args) {
    if (!VOICE_DEBUG) return;
    console.log('[VoiceDebug]', ...args);
}

function safeDestroyConnection(connection) {
    if (!connection) return;

    const status = String(connection.state?.status ?? '').toLowerCase();
    if (status === 'destroyed') return;

    try {
        connection.destroy();
    } catch (err) {
        if (!/already been destroyed/i.test(String(err?.message ?? ''))) {
            throw err;
        }
    }
}

function clearIdleDisconnectTimer(guildId) {
    const timer = idleDisconnectTimers.get(guildId);
    if (timer) {
        clearTimeout(timer);
        idleDisconnectTimers.delete(guildId);
    }
}

function scheduleIdleDisconnect(guildId) {
    clearIdleDisconnectTimer(guildId);

    const delay = getIdleDisconnectMs();
    if (delay <= 0) return;

    const timer = setTimeout(() => {
        const connection = getVoiceConnection(guildId);
        if (connection) {
            debugLog(`Auto-disconnect timeout reached for guild=${guildId}. Destroying voice connection.`);
            safeDestroyConnection(connection);
        }
        players.delete(guildId);
        idleDisconnectTimers.delete(guildId);
    }, delay);

    idleDisconnectTimers.set(guildId, timer);
}

/**
 * Rejoint un canal vocal et joue un fichier audio.
 * @param {import('discord.js').VoiceBasedChannel} voiceChannel
 * @param {string} filePath Chemin absolu du fichier MP3
 * @returns {Promise<void>}
 */
async function playSound(voiceChannel, filePath) {
    const { id: channelId, guild } = voiceChannel;
    clearIdleDisconnectTimer(guild.id);
    debugLog(`Play request guild=${guild.id} channel=${channelId} file=${filePath}`);

    // Récupère ou crée la connexion vocale
    let connection = getVoiceConnection(guild.id);

    if (!connection) {
        debugLog(`No connection found for guild=${guild.id}. Joining channel=${channelId}`);
        connection = joinVoiceChannel({
            channelId,
            guildId:        guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf:       true,
        });

        // Attendre que la connexion soit prête (timeout 5s)
        await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        debugLog(`Connection ready for guild=${guild.id}`);
    }

    // Récupère ou crée le player de la guilde
    let player = players.get(guild.id);
    if (!player) {
        player = createAudioPlayer();
        players.set(guild.id, player);

        // En fin de son, on lance le timer d'auto-déconnexion d'inactivité.
        player.on(AudioPlayerStatus.Idle, () => {
            debugLog(`Player idle guild=${guild.id}. Scheduling auto-disconnect.`);
            scheduleIdleDisconnect(guild.id);
        });

        player.on('error', (err) => {
            console.error(`[Audio] Erreur player (guild ${guild.id}):`, err.message);
        });
    }

    // Ré-abonne le player à la connexion active (utile après reconnexion).
    connection.subscribe(player);

    const resource = createAudioResource(filePath);
    player.play(resource);

    let playbackError = null;
    const onPlayerError = (err) => {
        playbackError = err;
    };
    player.once('error', onPlayerError);

    try {
        await entersState(player, AudioPlayerStatus.Playing, 10_000);
        debugLog(`Player started guild=${guild.id}`);
    } catch (err) {
        const reason = playbackError?.message ?? err?.message ?? 'unknown';
        throw new Error(`La lecture n'a pas démarré: ${reason}`);
    } finally {
        player.off('error', onPlayerError);
    }
}

/**
 * Stoppe la lecture et déconnecte le bot du canal vocal.
 * @param {string} guildId
 * @returns {boolean} true si un son était en cours, false sinon
 */
function stopSound(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) return false;

    clearIdleDisconnectTimer(guildId);
    safeDestroyConnection(connection);
    players.delete(guildId);
    return true;
}

/**
 * Indique si le bot joue actuellement un son dans une guilde.
 * @param {string} guildId
 * @returns {boolean}
 */
function isPlaying(guildId) {
    const player = players.get(guildId);
    return player?.state.status === AudioPlayerStatus.Playing;
}

module.exports = { playSound, stopSound, isPlaying };
