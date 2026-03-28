const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState,
} = require('@discordjs/voice');
const { PermissionsBitField } = require('discord.js');

/** @type {import('discord.js').Client | null} */
let botClient = null;

// Map<guildId, { channelId: string, connectedAt: string }>
const connections = new Map();

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

function getLiveConnectionInfo(guildId) {
    if (!guildId) return null;

    const connection = getVoiceConnection(guildId);
    if (!connection) return null;

    const status = String(connection.state?.status ?? '').toLowerCase();
    if (!status || status === 'disconnected' || status === 'destroyed') {
        return null;
    }

    const channelId = connection.joinConfig?.channelId ?? null;
    if (!channelId) return null;

    const cachedInfo = connections.get(guildId) ?? null;
    const guild = botClient?.guilds?.cache?.get(guildId) ?? null;
    const channelName = guild?.channels?.cache?.get(channelId)?.name ?? cachedInfo?.channelName ?? null;

    return {
        channelId,
        channelName,
        connectedAt: cachedInfo?.connectedAt ?? null,
    };
}

function setClient(client) {
    botClient = client;
}

function getClient() {
    return botClient;
}

/**
 * Connecte le bot à un canal vocal.
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function connect(guildId, channelId) {
    if (!botClient?.isReady()) return { ok: false, error: 'Bot non prêt.' };

    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return { ok: false, error: `Guilde ${guildId} introuvable.` };

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return { ok: false, error: `Canal ${channelId} introuvable.` };
    if (!channel.isVoiceBased?.()) {
        return { ok: false, error: `Le canal ${channelId} n'est pas un canal vocal.` };
    }

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!me) {
        return { ok: false, error: 'Impossible de récupérer le membre bot dans la guilde.' };
    }

    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) {
        return { ok: false, error: 'Le bot ne peut pas voir ce canal vocal.' };
    }
    if (!perms.has(PermissionsBitField.Flags.Connect)) {
        return { ok: false, error: 'Le bot n’a pas la permission de se connecter à ce canal vocal.' };
    }
    if (!perms.has(PermissionsBitField.Flags.Speak)) {
        return { ok: false, error: 'Le bot n’a pas la permission de parler dans ce canal vocal.' };
    }

    // Déconnecter proprement si déjà connecté
    const existing = getVoiceConnection(guildId);
    if (existing) {
        if (existing.joinConfig.channelId === channelId && existing.state.status === VoiceConnectionStatus.Ready) {
            connections.set(guildId, {
                channelId,
                channelName: channel.name,
                connectedAt: new Date().toISOString(),
            });
            return { ok: true };
        }
        safeDestroyConnection(existing);
    }

    let connection = null;
    let lastError = null;

    // Discord voice peut échouer de façon transitoire (AbortError) lors du handshake.
    // On retente quelques fois avant d'abandonner.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
            lastError = null;
            break;
        } catch (err) {
            lastError = err;
            safeDestroyConnection(connection);
            connection = null;

            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 1_000));
            }
        }
    }

    if (!connection || lastError) {
        const msg = lastError?.message || 'Erreur inconnue de connexion vocale.';

        if (/aborted/i.test(msg)) {
            return {
                ok: false,
                error: 'Connexion vocale interrompue après plusieurs tentatives. Vérifie le salon vocal Discord (région auto/manuelle, restrictions de rôle, capacité) et la connexion réseau/firewall de la machine du bot.',
            };
        }

        return {
            ok: false,
            error: `Impossible de connecter le bot au vocal: ${msg}`,
        };
    }

    // Nettoyer la map si Discord déconnecte le bot côté serveur
    connection.on('stateChange', (_old, newState) => {
        if (newState.status === VoiceConnectionStatus.Disconnected) {
            connections.delete(guildId);
        }
    });

    connections.set(guildId, {
        channelId,
        channelName: channel.name,
        connectedAt: new Date().toISOString(),
    });

    return { ok: true };
}

/**
 * Déconnecte le bot d'une guilde.
 * @param {string} guildId
 * @returns {{ ok: boolean, error?: string }}
 */
function disconnect(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
        connections.delete(guildId);
        return { ok: true };
    }
    safeDestroyConnection(connection);
    connections.delete(guildId);
    return { ok: true };
}

/**
 * Retourne le statut de connexion pour une guilde.
 * @param {string} guildId
 */
function getStatus(guildId) {
    const liveInfo = guildId ? getLiveConnectionInfo(guildId) : null;

    if (guildId && liveInfo) {
        const previous = connections.get(guildId) ?? null;
        const merged = {
            channelId: liveInfo.channelId,
            channelName: liveInfo.channelName,
            connectedAt: previous?.connectedAt ?? liveInfo.connectedAt ?? new Date().toISOString(),
        };
        connections.set(guildId, merged);
        return {
            botReady: botClient?.isReady() ?? false,
            connected: true,
            channelId: merged.channelId,
            channelName: merged.channelName,
            connectedAt: merged.connectedAt,
        };
    }

    if (guildId) {
        connections.delete(guildId);
    }

    return {
        botReady:    botClient?.isReady() ?? false,
        connected:   false,
        channelId:   null,
        channelName: null,
        connectedAt: null,
    };
}

module.exports = { setClient, getClient, connect, disconnect, getStatus };
