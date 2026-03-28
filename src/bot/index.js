const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const sbCommand = require('./commands/sb');

/**
 * Crée et connecte le bot Discord.
 * @returns {Promise<Client>}
 */
async function startBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    // Charger les commandes dans une collection
    client.commands = new Collection();
    client.commands.set(sbCommand.data.name, sbCommand);

    client.once(Events.ClientReady, (c) => {
        console.log(`[Bot] Connecté en tant que ${c.user.tag}`);
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`[Bot] Erreur lors de l'exécution de /${interaction.commandName}:`, err.message);

            const reply = { content: '❌ Une erreur est survenue.', ephemeral: true };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    });

    await client.login(process.env.DISCORD_TOKEN);
    require('./controller').setClient(client);
    return client;
}

module.exports = { startBot };
