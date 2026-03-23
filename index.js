const { Client, GatewayIntentBits } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Load data
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

// Save data
function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      lastDate: null,
      timezone: null,
      best: 0
    };
  }

  const user = data[id];

  // SET TIMEZONE
  if (message.content.startsWith('!settz')) {
    const tz = message.content.split(' ')[1];

    if (!moment.tz.zone(tz)) {
      return message.reply(
        '❌ Invalid timezone.\n' +
        'Example: `America/New_York`\n' +
        'Find your timezone here:\n' +
        'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'
      );
    }

    user.timezone = tz;
    saveData();
    return message.reply(`✅ Timezone set to ${tz}`);
  }

  // HELP COMMAND
  if (message.content === '!timezone') {
    return message.reply(
      '🌍 Use: `!settz Your/Timezone`\n\n' +
      'Example:\n`!settz America/New_York`\n\n' +
      'Find yours here:\n' +
      'https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'
    );
  }

  // SHOW STREAK
  if (message.content === '!streak') {
    return message.reply(
      `🔥 Current Streak: ${user.streak} days\n🏆 Best Streak: ${user.best}`
    );
  }

  // LEADERBOARD
  if (message.content === '!topstreaks') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    let msg = '🏆 Top Streaks:\n';

    for (let i = 0; i < sorted.length; i++) {
      const member = await message.guild.members.fetch(sorted[i][0]).catch(() => null);
      const name = member ? member.user.username : 'Unknown';
      msg += `${i + 1}. ${name} — ${sorted[i][1].streak} days\n`;
    }

    return message.reply(msg);
  }

  // MUST HAVE TIMEZONE
  if (!user.timezone) return;

  const now = moment().tz(user.timezone).format('YYYY-MM-DD');

  // FIRST MESSAGE EVER
  if (!user.lastDate) {
    user.lastDate = now;
    user.streak = 1;
    user.best = 1;
    saveData();
    return message.reply('✨ New streak started! (1 day)');
  }

  const yesterday = moment().tz(user.timezone).subtract(1, 'day').format('YYYY-MM-DD');

  // ALREADY COUNTED TODAY
  if (user.lastDate === now) return;

  // CONTINUE STREAK
  if (user.lastDate === yesterday) {
    user.streak += 1;

    if (user.streak > user.best) {
      user.best = user.streak;
    }

    user.lastDate = now;
    saveData();

    return message.reply(`🔥 Streak continued: ${user.streak} days`);
  }

  // STREAK BROKEN
  user.streak = 1;
  user.lastDate = now;
  saveData();

  return message.reply('💀 Streak reset. Back to 1 day');
});

client.login(process.env.TOKEN);