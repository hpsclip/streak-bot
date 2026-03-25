const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require('discord.js');

const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;

const COLORS = {
  primary: 0x22c55e,
  gold: 0xffcc00,
  error: 0xff4444,
  warn: 0xffaa00
};

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

function save() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      lastDate: null,
      timezone: "America/New_York",
      fails: 0,
      coins: 0,
      shields: 0,
      lastDaily: 0,
      lastMessage: 0
    };
  }
  return data[id];
}

// ===== RANK =====
function getRank(streak) {
  if (streak >= 50) return "👑 Legend";
  if (streak >= 25) return "🏆 Pro";
  if (streak >= 10) return "🔥 Grinder";
  if (streak >= 5) return "⚡ Active";
  return "🌱 Beginner";
}

// ===== READY =====
client.on('clientReady', () => {
  console.log(`✅ ${client.user.tag} online`);
});

// ===== COMMAND HANDLER =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  try {
    await i.deferReply();

    // ===== STREAK =====
    if (i.commandName === 'streak') {
      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("🔥 Streak")
            .setDescription(
              `Current: **${user.streak}**\nBest: **${user.best}**\nFails: **${user.fails}/3**`
            )
        ]
      });
    }

    // ===== PROFILE =====
    if (i.commandName === 'profile') {
      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`${i.user.username}'s Profile`)
            .addFields(
              { name: "Rank", value: getRank(user.streak), inline: true },
              { name: "Streak", value: `${user.streak}`, inline: true },
              { name: "Best", value: `${user.best}`, inline: true },
              { name: "Coins", value: `${user.coins}`, inline: true },
              { name: "Shields", value: `${user.shields}`, inline: true }
            )
        ]
      });
    }

    // ===== DAILY =====
    if (i.commandName === 'daily') {
      const now = Date.now();

      if (now - user.lastDaily < 86400000) {
        return i.editReply("⏳ Already claimed today");
      }

      const reward = 10 + user.streak * 2;

      user.coins += reward;
      user.lastDaily = now;

      save();

      return i.editReply(`💰 You got **${reward} coins**`);
    }

    // ===== SHOP =====
    if (i.commandName === 'shop') {
      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle("🛒 Shop")
            .setDescription("shield — 100 coins\nPrevents streak loss once")
        ]
      });
    }

    // ===== BUY =====
    if (i.commandName === 'buy') {
      const item = i.options.getString('item');

      if (item !== "shield") {
        return i.editReply("❌ Invalid item");
      }

      if (user.coins < 100) {
        return i.editReply("❌ Not enough coins");
      }

      user.coins -= 100;
      user.shields++;

      save();

      return i.editReply("🛡️ Shield purchased");
    }

    // ===== LEADERBOARD =====
    if (i.commandName === 'leaderboard') {
      const top = Object.entries(data)
        .sort((a, b) => b[1].streak - a[1].streak)
        .slice(0, 10);

      const text = top
        .map((u, i) => `#${i + 1} <@${u[0]}> — ${u[1].streak}`)
        .join("\n");

      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle("🏆 Leaderboard")
            .setDescription(text || "No data")
        ]
      });
    }

    // ===== REMINDER =====
    if (i.commandName === 'remind') {
      const hours = i.options.getInteger('hours');

      setTimeout(() => {
        i.user.send("⏰ Reminder to keep your streak!").catch(() => {});
      }, hours * 3600000);

      return i.editReply(`⏰ Reminder set for ${hours} hour(s)`);
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("❌ Error occurred");
  }
});

// ===== STREAK SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);

  // anti spam
  if (Date.now() - user.lastMessage < 5000) return;
  user.lastMessage = Date.now();

  const now = moment().tz(user.timezone);
  const today = now.format('YYYY-MM-DD');

  if (user.lastDate === today) return;

  const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

  if (!user.lastDate) {
    user.streak = 1;
    user.fails = 0;

  } else if (user.lastDate === yesterday) {
    user.streak++;
    user.fails = 0;

  } else {
    if (user.shields > 0) {
      user.shields--;
    } else {
      user.fails++;

      if (user.fails >= 3) {
        user.streak = 1;
        user.fails = 0;
      }
    }
  }

  user.lastDate = today;
  if (user.streak > user.best) user.best = user.streak;

  save();
});

client.login(TOKEN);