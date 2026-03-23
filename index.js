const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== DATA =====
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}
function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// ===== COMMANDS (SAFE) =====
const commands = [
  new SlashCommandBuilder()
    .setName('settz')
    .setDescription('Set your timezone')
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Example: America/New_York')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Check your streak'),

  new SlashCommandBuilder()
    .setName('topstreaks')
    .setDescription('View leaderboard'),

  new SlashCommandBuilder()
    .setName('vacation')
    .setDescription('Pause your streak temporarily')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Number of days (max 7)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use the bot'),

  new SlashCommandBuilder()
    .setName('setupdateschannel')
    .setDescription('Set updates channel (admin only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel for updates')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Send an update message (admin only)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What was added/changed')
        .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// REGISTER COMMANDS
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered');
  } catch (err) {
    console.error(err);
  }
})();

// ===== READY =====
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== SLASH COMMANDS =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const id = interaction.user.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      lastDate: null,
      timezone: null,
      vacationUntil: null
    };
  }

  const user = data[id];

  // HELP
  if (interaction.commandName === 'help') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📘 Help Menu')
          .setDescription(
            '**Commands:**\n' +
            '/settz – set timezone\n' +
            '/streak – view streak\n' +
            '/topstreaks – leaderboard\n' +
            '/vacation – pause streak\n\n' +
            '**How it works:**\n' +
            'Talk once per day to keep your streak.\n\n' +
            '**Support:**\n' +
            'Contact mods if something is broken.'
          )
      ]
    });
  }

  // SET TZ
  if (interaction.commandName === 'settz') {
    const tz = interaction.options.getString('timezone');

    if (!moment.tz.zone(tz)) {
      return interaction.reply({ content: '❌ Invalid timezone', ephemeral: true });
    }

    user.timezone = tz;
    saveData();

    return interaction.reply(`✅ Timezone set to ${tz}`);
  }

  // STREAK
  if (interaction.commandName === 'streak') {
    return interaction.reply(`🔥 Current: ${user.streak} | Best: ${user.best}`);
  }

  // LEADERBOARD
  if (interaction.commandName === 'topstreaks') {
    const sorted = Object.entries(data)
      .filter(([k]) => k !== '_config')
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    const text = sorted.map((u, i) =>
      `${i + 1}. <@${u[0]}> — ${u[1].streak}`
    ).join('\n') || 'No data';

    return interaction.reply(text);
  }

  // VACATION
  if (interaction.commandName === 'vacation') {
    const days = interaction.options.getInteger('days');

    if (days > 7) {
      return interaction.reply({ content: 'Max 7 days', ephemeral: true });
    }

    user.vacationUntil = moment().add(days, 'days').valueOf();
    saveData();

    return interaction.reply(`✈️ Vacation for ${days} days`);
  }

  // SET UPDATE CHANNEL
  if (interaction.commandName === 'setupdateschannel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Admin only', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');

    data._config = data._config || {};
    data._config.updatesChannel = channel.id;
    saveData();

    return interaction.reply('✅ Updates channel set');
  }

  // SEND UPDATE
  if (interaction.commandName === 'update') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Admin only', ephemeral: true });
    }

    const msg = interaction.options.getString('message');
    const chId = data._config?.updatesChannel;

    if (!chId) {
      return interaction.reply({ content: '❌ No updates channel set', ephemeral: true });
    }

    const ch = await client.channels.fetch(chId);

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ffcc)
          .setTitle('🚀 New Update')
          .setDescription(msg)
          .setTimestamp()
      ]
    });

    return interaction.reply({ content: '✅ Update sent', ephemeral: true });
  }
});

// ===== MESSAGE TRACKING =====
client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content.length < 3) return;

  const id = message.author.id;
  const user = data[id];

  if (!user || !user.timezone) return;

  const now = moment().tz(user.timezone);
  const today = now.format('YYYY-MM-DD');

  if (user.vacationUntil && Date.now() < user.vacationUntil) return;
  if (user.lastDate === today) return;

  const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

  if (!user.lastDate) {
    user.streak = 1;
    user.best = 1;
  } else if (user.lastDate === yesterday) {
    user.streak++;
    if (user.streak > user.best) user.best = user.streak;
  } else {
    user.streak = 1;
  }

  user.lastDate = today;
  saveData();

  message.reply(`🔥 Streak: ${user.streak}`);
});

client.login(TOKEN);