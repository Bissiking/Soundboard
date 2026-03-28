require('dotenv').config();
const {
    Client,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioResource,
    getVoiceConnection,
    AudioPlayerStatus,
    createAudioPlayer
} = require('@discordjs/voice');

const client = new Client({
    intents: GatewayIntentBits.Guilds
});

client.once(Events.ClientReady, c => {
    console.log(`Connecté avec ${c.user.tag}`);

    const ping = new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Tu connais la réponse ...')

    const hello = new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Je vais juste te répondre HELLO')

    const soundboardCommand = new SlashCommandBuilder()
        .setName('soundboard')
        .setDescription('Jouer un son de la soundboard');

    const soundboardCommandData = client.application.commands.create(soundboardCommand);
    console.log('Commande soundboard créée :', soundboardCommandData);


    client.application.commands.create(ping, "1129724936622198816")
    client.application.commands.create(hello, "1129724936622198816")
    client.application.commands.create(soundboardCommand, "1129724936622198816")
})

client.on(Events.InteractionCreate, interaction => {
    if (!interaction.isChatInputCommand()) return

    // Commande PING
    if (interaction.commandName === 'ping') {
        interaction.reply("Pong!");
    }

    //Commande Hello
    if (interaction.commandName === 'hello') {
        interaction.reply(`C'est qui le bouffon ? C'est toi -> ${interaction.user.username}`);
    }

    // Soundboard
    if (interaction.commandName === 'soundboard') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply('Vous devez être dans un canal vocal pour utiliser cette commande.');
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource('./audio/02.mp3');
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy();
        });

        interaction.reply('Son diffusé dans le canal vocal.');
    }
})

client.login(process.env.DISCORD_TOKEN)