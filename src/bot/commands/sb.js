const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const soundService = require('../../services/soundService');
const { playSound, stopSound }  = require('../handlers/audio');

// Cooldown par utilisateur : Map<userId, timestamp>
const cooldowns = new Map();
const COOLDOWN_MS = 3_000;

/**
 * Vérifie et applique le cooldown pour un utilisateur.
 * @param {string} userId
 * @returns {{ ok: boolean, remaining?: number }}
 */
function checkCooldown(userId) {
    const last = cooldowns.get(userId);
    if (last) {
        const remaining = COOLDOWN_MS - (Date.now() - last);
        if (remaining > 0) return { ok: false, remaining };
    }
    cooldowns.set(userId, Date.now());
    return { ok: true };
}

const data = new SlashCommandBuilder()
    .setName('sb')
    .setDescription('Soundboard — joue des sons dans le canal vocal')
    .addSubcommand((sub) =>
        sub.setName('list').setDescription('Affiche la liste des sons disponibles')
    )
    .addSubcommand((sub) =>
        sub
            .setName('play')
            .setDescription('Joue un son dans le canal vocal')
            .addStringOption((opt) =>
                opt.setName('name').setDescription('Nom du son').setRequired(true)
            )
    )
    .addSubcommand((sub) =>
        sub.setName('random').setDescription('Joue un son aléatoire')
    )
    .addSubcommand((sub) =>
        sub.setName('stop').setDescription('Arrête la lecture en cours')
    );

/**
 * Exécute la commande /sb.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /sb list ────────────────────────────────────────────────────────────
    if (sub === 'list') {
        await interaction.deferReply({ ephemeral: true });

        const sounds = await soundService.listApprovedSounds();

        if (sounds.length === 0) {
            return interaction.editReply('Aucun son disponible pour le moment.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🎵 Soundboard — Sons disponibles')
            .setColor(0x5865f2)
            .setDescription(
                sounds
                    .map((s) => `• **${s.name}** — ${s.duration.toFixed(1)}s (joué ${s.plays_count}x)`)
                    .join('\n')
            )
            .setFooter({ text: `${sounds.length} son(s) disponible(s)` });

        return interaction.editReply({ embeds: [embed] });
    }

    // ── /sb stop ─────────────────────────────────────────────────────────────
    if (sub === 'stop') {
        const stopped = stopSound(interaction.guildId);
        return interaction.reply({
            content: stopped ? '⏹️ Lecture arrêtée.' : 'Aucun son en cours.',
            ephemeral: true,
        });
    }

    // ── /sb play & /sb random — nécessitent un canal vocal ───────────────────
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({
            content: '❌ Vous devez être dans un canal vocal pour utiliser cette commande.',
            ephemeral: true,
        });
    }

    // Cooldown
    const { ok, remaining } = checkCooldown(interaction.user.id);
    if (!ok) {
        return interaction.reply({
            content: `⏳ Cooldown actif. Réessayez dans **${(remaining / 1000).toFixed(1)}s**.`,
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    let sound;

    if (sub === 'random') {
        sound = await soundService.getRandomSound();
        if (!sound) {
            return interaction.editReply('❌ Aucun son disponible.');
        }
    } else {
        // sub === 'play'
        const name = interaction.options.getString('name', true);
        sound = await soundService.getSoundByName(name);
        if (!sound) {
            return interaction.editReply(`❌ Son introuvable : **${name}**. Utilisez \`/sb list\` pour voir les sons disponibles.`);
        }
    }

    try {
        await playSound(voiceChannel, sound.file_path);
        await soundService.incrementPlays(sound.id);

        return interaction.editReply(`▶️ Lecture : **${sound.name}** (${sound.duration.toFixed(1)}s)`);
    } catch (err) {
        console.error('[sb play]', err.message);
        return interaction.editReply('❌ Impossible de rejoindre le canal vocal ou de lire le son.');
    }
}

module.exports = { data, execute };
