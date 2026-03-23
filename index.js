const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// Anti-spam (track last message time)
let messageCooldown = {};

client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const id = message.author.id;

  // Ignore very short spam messages
  if (message.content.length < 3) return;

  // Cooldown (10 seconds per message for streak counting)
  const nowTime = Date.now();
  if (messageCooldown[id] && nowTime - messageCooldown[id] < 10000) return;
  messageCooldown[id] = nowTime;

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
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Invalid Timezone')
            .setDescription(
              'Example: `America/New_York`\n\nFind yours here:\nhttps://en.wikipedia.org/wiki/List_of_tz_database_time_zones'
            )
        ]
      });
    }

    user.timezone = tz;
    saveData();

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Timezone Set')
          .setDescription(`Your timezone is now **${tz}**`)
      ]
    });
  }

  // SHOW STREAK
  if (message.content === '!streak') {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🔥 Your Streak')
          .addFields(
            { name: 'Current', value: `${user.streak} days`, inline: true },
            { name: 'Best', value: `${user.best} days`, inline: true }
          )
      ]
    });
  }

  // LEADERBOARD
  if (message.content === '!topstreaks') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    let desc = '';

    for (let i = 0; i < sorted.length; i++) {
      const member = await message.guild.members.fetch(sorted[i][0]).catch(() => null);
      const name = member ? member.user.username : 'Unknown';
      desc += `**${i + 1}.** ${name} — 🔥 ${sorted[i][1].streak} days\n`;
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('🏆 Top Streaks')
          .setDescription(desc || 'No data yet.')
      ]
    });
  }

  // TIMEZONE REQUIRED
  if (!user.timezone) return;

  const today = moment().tz(user.timezone).format('YYYY-MM-DD');

  if (!user.lastDate) {
    user.lastDate = today;
    user.streak = 1;
    user.best = 1;
    saveData();

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✨ New Streak Started')
          .setDescription('You are now on a **1 day streak**')
      ]
    });
  }

  const yesterday = moment().tz(user.timezone).subtract(1, 'day').format('YYYY-MM-DD');

  if (user.lastDate === today) return;

  if (user.lastDate === yesterday) {
    user.streak++;

    if (user.streak > user.best) {
      user.best = user.streak;
    }

    user.lastDate = today;
    saveData();

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ffcc)
          .setTitle('🔥 Streak Continued')
          .setDescription(`You are now on a **${user.streak} day streak**`)
      ]
    });
  }

  // RESET
  user.streak = 1;
  user.lastDate = today;
  saveData();

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('💀 Streak Reset')
        .setDescription('You missed a day. Back to **1**.')
    ]
  });
});

client.login(process.env.TOKEN);