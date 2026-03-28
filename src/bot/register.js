/**
 * Script one-shot : enregistre les slash commands auprès de Discord.
 * À exécuter via : npm run register-commands
 */
require('dotenv').config();

const { REST, Routes } = require('discord.js');
const sbCommand = require('./commands/sb');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID  = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis dans .env');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Enregistrement des slash commands...');

        const body = [sbCommand.data.toJSON()];

        // GUILD_ID défini → enregistrement instantané sur le serveur de dev
        // Sinon → enregistrement global (peut prendre jusqu'à 1h)
        const route = GUILD_ID
            ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : Routes.applicationCommands(CLIENT_ID);

        await rest.put(route, { body });

        console.log('✅ Slash commands enregistrées avec succès.');
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement:', err);
        process.exit(1);
    }
})();
