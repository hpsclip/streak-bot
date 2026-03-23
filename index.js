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

// ===== RANK =====
function getRank(streak) {
  if (streak >= 25) return '🏆 No Life';
  if (streak >= 10) return '🔥 Grinder';
  if (streak >= 4) return '⚡ Active';
  return '🌱 Beginner';
}

// ===== COMMANDS (100% SAFE) =====
const commands = [
  new SlashCommandBuilder()
    .setName('settz')
    .setDescription('Set your timezone')
    .addStringOption(option =>
      option
        .setName('timezone')
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
    .setDescription('Pause your streak')
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Number of days (max 7)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help menu'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your stats'),

  new SlashCommandBuilder()
    .setName('setupdateschannel')
    .setDescription('Set updates channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where updates will be sent')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Send update message')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Update details')
        .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// REGISTER COMMANDS
(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
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
      vacationUntil: null,
      history: [],
      lastActiveHour: null
    };
  }

  const user = data[id];

  // HELP
  if (interaction.commandName === 'help') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('📘 Help')
          .setDescription(
            '/settz – set timezone\n' +
            '/streak – check streak\n' +
            '/stats – stats\n' +
            '/topstreaks – leaderboard\n' +
            '/vacation – pause streak\n\n' +
            'Talk once daily to keep streak.\n\n' +
            'Contact mods if bugs.'
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
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🔥 Streak')
          .addFields(
            { name: 'Current', value: `${user.streak}`, inline: true },
            { name: 'Best', value: `${user.best}`, inline: true },
            { name: 'Rank', value: getRank(user.streak), inline: true }
          )
      ]
    });
  }

  // STATS
  if (interaction.commandName === 'stats') {
    const hist = user.history.slice(-7).map(v => v ? '✅' : '❌').join(' ') || 'No data';

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ccff)
          .setTitle('📊 Stats')
          .addFields(
            { name: 'Current', value: `${user.streak}`, inline: true },
            { name: 'Best', value: `${user.best}`, inline: true },
            { name: 'Rank', value: getRank(user.streak), inline: true },
            { name: 'Last 7 Days', value: hist }
          )
      ]
    });
  }

  // LEADERBOARD
  if (interaction.commandName === 'topstreaks') {
    const sorted = Object.entries(data)
      .filter(([k]) => k !== '_config')
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    const desc = sorted.map((u, i) =>
      `**${i + 1}.** <@${u[0]}> — 🔥 ${u[1].streak}`
    ).join('\n') || 'No data';

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle('🏆 Leaderboard').setDescription(desc)]
    });
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

    const ch = interaction.options.getChannel('channel');

    data._config = data._config || {};
    data._config.updatesChannel = ch.id;
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
      return interaction.reply({ content: 'No updates channel set', ephemeral: true });
    }

    const ch = await client.channels.fetch(chId);

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ffcc)
          .setTitle('🚀 Update')
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

  user.lastActiveHour = now.hour();

  user.history.push(user.lastDate === yesterday);
  if (user.history.length > 7) user.history.shift();

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
});

client.login(TOKEN);