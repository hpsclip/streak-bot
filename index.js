const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
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

// ===== RANK SYSTEM =====
function getRank(streak) {
  if (streak >= 25) return '🏆 No Life';
  if (streak >= 10) return '🔥 Grinder';
  if (streak >= 4) return '⚡ Active';
  return '🌱 Beginner';
}

// ===== COMMANDS =====
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
    .setDescription('Leaderboard'),

  new SlashCommandBuilder()
    .setName('vacation')
    .setDescription('Pause your streak')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days to pause (max 7)')
        .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Commands registered');
})();

// ===== READY =====
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== SLASH =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const id = interaction.user.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      lastDate: null,
      timezone: null,
      best: 0,
      vacationUntil: null
    };
  }

  const user = data[id];

  // SET TIMEZONE
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
          .setTitle('🔥 Your Streak')
          .addFields(
            { name: 'Current', value: `${user.streak}`, inline: true },
            { name: 'Best', value: `${user.best}`, inline: true },
            { name: 'Rank', value: getRank(user.streak), inline: true }
          )
      ]
    });
  }

  // LEADERBOARD
  if (interaction.commandName === 'topstreaks') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    let desc = '';
    for (let i = 0; i < sorted.length; i++) {
      desc += `**${i + 1}.** <@${sorted[i][0]}> — 🔥 ${sorted[i][1].streak}\n`;
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('🏆 Leaderboard')
          .setDescription(desc || 'No data')
      ]
    });
  }

  // VACATION
  if (interaction.commandName === 'vacation') {
    const days = interaction.options.getInteger('days');

    if (days > 7) {
      return interaction.reply({ content: 'Max 7 days', ephemeral: true });
    }

    const until = moment().add(days, 'days').valueOf();
    user.vacationUntil = until;
    saveData();

    return interaction.reply(`✈️ Vacation mode enabled for ${days} days`);
  }
});

// ===== MESSAGE TRACKING =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.length < 3) return;

  const id = message.author.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      lastDate: null,
      timezone: null,
      best: 0,
      vacationUntil: null
    };
  }

  const user = data[id];

  if (!user.timezone) return;

  const now = moment().tz(user.timezone);
  const today = now.format('YYYY-MM-DD');
  const tomorrowTime = now.clone().add(1, 'day').startOf('day').format('h:mm A');

  // VACATION PROTECTION
  if (user.vacationUntil && Date.now() < user.vacationUntil) return;

  if (user.lastDate === today) return;

  const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

  let msg;

  if (!user.lastDate) {
    user.streak = 1;
    user.best = 1;
    msg = `✨ New streak (1)\nCome back at ${tomorrowTime}`;
  } else if (user.lastDate === yesterday) {
    user.streak++;
    if (user.streak > user.best) user.best = user.streak;
    msg = `🔥 ${user.streak} day streak\nCome back at ${tomorrowTime}`;
  } else {
    user.streak = 1;
    msg = `💀 Reset (1)\nCome back at ${tomorrowTime}`;
  }

  user.lastDate = today;
  saveData();

  message.reply(msg);
});

// ===== DAILY REMINDER LOOP =====
setInterval(async () => {
  const now = Date.now();

  for (const id in data) {
    const user = data[id];

    if (!user.timezone) continue;
    if (user.vacationUntil && now < user.vacationUntil) continue;

    const userTime = moment().tz(user.timezone);
    const today = userTime.format('YYYY-MM-DD');

    // If they haven’t talked today → remind at 8 PM
    if (user.lastDate !== today && userTime.hour() === 20) {
      try {
        const userObj = await client.users.fetch(id);
        userObj.send('⚠️ Don’t lose your streak today!');
      } catch {}
    }
  }
}, 60000); // runs every minute

client.login(TOKEN);