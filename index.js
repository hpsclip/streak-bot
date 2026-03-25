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
  warning: 0xffaa00,
  error: 0xff4444,
  gold: 0xffcc00
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
try {
  if (fs.existsSync('data.json')) {
    data = JSON.parse(fs.readFileSync('data.json'));
  }
} catch {
  data = {};
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
  console.log(`✅ ${client.user.tag} is online`);
});

// ===== COMMAND HANDLER =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  // ===== STREAK =====
  if (i.commandName === 'streak') {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("🔥 Streak Overview")
          .setDescription(
            `**Current:** ${user.streak}\n**Best:** ${user.best}\n**Fails:** ${user.fails}/3`
          )
      ]
    });
  }

  // ===== DAILY =====
  if (i.commandName === 'daily') {
    const now = Date.now();

    if (now - user.lastDaily < 86400000) {
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setDescription("⏳ You already claimed your daily reward.")
        ],
        ephemeral: true
      });
    }

    const reward = 10 + user.streak * 2;
    user.coins += reward;
    user.lastDaily = now;

    save();

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle("💰 Daily Reward")
          .setDescription(`You earned **${reward} coins**\nTotal: **${user.coins}**`)
      ]
    });
  }

  // ===== RANK =====
  if (i.commandName === 'rank') {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`${i.user.username}'s Profile`)
          .addFields(
            { name: "Rank", value: getRank(user.streak), inline: true },
            { name: "Streak", value: `${user.streak}`, inline: true },
            { name: "Coins", value: `${user.coins}`, inline: true },
            { name: "Shields", value: `${user.shields}`, inline: true }
          )
      ]
    });
  }

  // ===== SHOP =====
  if (i.commandName === 'shop') {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle("🛒 Shop")
          .setDescription(
            "**shield** — 100 coins\nPrevents streak loss once"
          )
      ]
    });
  }

  // ===== BUY =====
  if (i.commandName === 'buy') {
    const item = i.options.getString('item');

    if (item !== "shield") {
      return i.reply({ content: "❌ Invalid item", ephemeral: true });
    }

    if (user.coins < 100) {
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setDescription("❌ Not enough coins")
        ]
      });
    }

    user.coins -= 100;
    user.shields++;

    save();

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setDescription("🛡️ Shield purchased successfully")
      ]
    });
  }

  // ===== REMINDER =====
  if (i.commandName === 'remind') {
    const hours = i.options.getInteger('hours');

    setTimeout(() => {
      i.user.send("⏰ Reminder: Stay active to keep your streak!")
        .catch(() => {});
    }, hours * 3600000);

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setDescription(`⏰ Reminder set for ${hours} hour(s)`)
      ]
    });
  }
});

// ===== STREAK SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);

  // Anti spam (5 sec cooldown)
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