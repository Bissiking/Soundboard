// test-voice.js
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('clientReady', async () => {
  console.log('READY');

  console.log('ENV GUILD_ID =', process.env.GUILD_ID);
  console.log('ENV VOICE_CHANNEL_ID =', process.env.VOICE_CHANNEL_ID);
  console.log('Guilds cache:', client.guilds.cache.map(g => g.id));

  try {
    const guild = await client.guilds.fetch(process.env.DEFAULT_GUILD_ID);
    console.log('Guild:', guild?.name);

    const channel = await guild.channels.fetch(process.env.DEFAULT_VOICE_CHANNEL_ID);
    console.log('Channel:', channel?.name);

    // 🔥 Connexion voice
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    console.log('JOIN ATTEMPT');

    // 🔥 Vérif réelle
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      console.log('VOICE READY ✅');
    } catch (e) {
      console.error('VOICE FAILED ❌', e);
    }

  } catch (err) {
    console.error('ERROR:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);