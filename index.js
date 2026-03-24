const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // 👈 ADD THIS IN RAILWAY

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
  if (streak >= 50) return '👑 Legend';
  if (streak >= 25) return '🏆 Pro';
  if (streak >= 10) return '🔥 Grinder';
  if (streak >= 5) return '⚡ Active';
  return '🌱 Beginner';
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('settz').setDescription('Set timezone')
    .addStringOption(o => o.setName('timezone').setDescription('America/New_York').setRequired(true)),

  new SlashCommandBuilder().setName('streak').setDescription('Check streak'),

  new SlashCommandBuilder().setName('topstreaks').setDescription('Leaderboard'),

  new SlashCommandBuilder().setName('vacation').setDescription('Pause streak')
    .addIntegerOption(o => o.setName('days').setDescription('Days').setRequired(true)),

  new SlashCommandBuilder().setName('help').setDescription('Help menu'),

  new SlashCommandBuilder().setName('resetstreak').setDescription('Admin reset')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder().setName('setstreak').setDescription('Admin set streak')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),

  new SlashCommandBuilder().setName('setupdateschannel').setDescription('Set update channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)),

  new SlashCommandBuilder().setName('update').setDescription('Send update')
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ===== REGISTER (INSTANT) =====
(async () => {
  console.log("REGISTERING COMMANDS...");
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commands registered instantly");
})();

// ===== READY =====
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== SLASH =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const id = i.user.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      lastDate: null,
      timezone: null,
      vacationUntil: null,
      achievements: []
    };
  }

  const user = data[id];

  // HELP
  if (i.commandName === 'help') {
    return i.reply("Use /settz → then talk daily to build streak");
  }

  // SET TZ
  if (i.commandName === 'settz') {
    const tz = i.options.getString('timezone');

    if (!moment.tz.zone(tz)) {
      return i.reply({ content: 'Invalid timezone', ephemeral: true });
    }

    user.timezone = tz;
    saveData();

    return i.reply(`Timezone set to ${tz}`);
  }

  // STREAK
  if (i.commandName === 'streak') {
    return i.reply(`🔥 ${user.streak} | Best: ${user.best} | ${getRank(user.streak)}`);
  }

  // TOP
  if (i.commandName === 'topstreaks') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    const text = sorted.map((u, i) =>
      `${i + 1}. <@${u[0]}> — ${u[1].streak}`
    ).join('\n') || 'No data';

    return i.reply(text);
  }

  // VACATION
  if (i.commandName === 'vacation') {
    const days = i.options.getInteger('days');
    user.vacationUntil = moment().add(days, 'days').valueOf();
    saveData();
    return i.reply(`Vacation for ${days} days`);
  }

  // ADMIN CHECK
  const isAdmin = i.member.permissions.has(PermissionsBitField.Flags.Administrator);

  if (i.commandName === 'resetstreak') {
    if (!isAdmin) return i.reply({ content: 'Admin only', ephemeral: true });

    const u = i.options.getUser('user');
    if (data[u.id]) data[u.id].streak = 0;
    saveData();

    return i.reply('Reset done');
  }

  if (i.commandName === 'setstreak') {
    if (!isAdmin) return i.reply({ content: 'Admin only', ephemeral: true });

    const u = i.options.getUser('user');
    const amount = i.options.getInteger('amount');

    if (!data[u.id]) data[u.id] = {};
    data[u.id].streak = amount;

    saveData();
    return i.reply('Set done');
  }

  if (i.commandName === 'setupdateschannel') {
    if (!isAdmin) return i.reply({ content: 'Admin only', ephemeral: true });

    data._config = data._config || {};
    data._config.channel = i.options.getChannel('channel').id;

    saveData();
    return i.reply('Channel set');
  }

  if (i.commandName === 'update') {
    if (!isAdmin) return i.reply({ content: 'Admin only', ephemeral: true });

    const ch = await client.channels.fetch(data._config?.channel);
    if (!ch) return i.reply('No channel set');

    await ch.send(`🚀 Update: ${i.options.getString('message')}`);
    return i.reply('Sent');
  }
});

// ===== MESSAGE SYSTEM (FIXED) =====
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  console.log("MESSAGE:", message.content);

  const id = message.author.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      lastDate: null,
      timezone: null,
      vacationUntil: null,
      achievements: []
    };
  }

  const user = data[id];

  if (!user.timezone) {
    message.reply("⚠️ Use /settz first");
    return;
  }

  const now = moment().tz(user.timezone);
  const today = now.format('YYYY-MM-DD');

  if (user.lastDate === today) return;

  const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

  if (!user.lastDate) {
    user.streak = 1;
  } else if (user.lastDate === yesterday) {
    user.streak++;
  } else {
    user.streak = 1;
  }

  user.lastDate = today;

  // ACHIEVEMENT
  if (user.streak === 7 && !user.achievements.includes('7')) {
    user.achievements.push('7');
    message.reply("🏆 7 Day Streak!");
  }

  saveData();

  message.reply(`🔥 Streak: ${user.streak}`);
});

client.login(TOKEN);