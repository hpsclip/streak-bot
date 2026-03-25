const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const moment = require('moment-timezone');
const fs = require('fs');
const { createCanvas } = require('canvas');

const TOKEN = process.env.TOKEN;

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
      lastDaily: 0
    };
  }
  return data[id];
}

// ===== RANK =====
function getRank(streak) {
  if (streak >= 50) return "Legend";
  if (streak >= 25) return "Pro";
  if (streak >= 10) return "Grinder";
  if (streak >= 5) return "Active";
  return "Beginner";
}

// ===== RANK CARD IMAGE =====
function generateRankCard(user, username) {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 600, 200);

  ctx.fillStyle = "#22c55e";
  ctx.font = "28px sans-serif";
  ctx.fillText(username, 20, 40);

  ctx.font = "20px sans-serif";
  ctx.fillText(`Rank: ${getRank(user.streak)}`, 20, 90);
  ctx.fillText(`Streak: ${user.streak}`, 20, 120);
  ctx.fillText(`Coins: ${user.coins}`, 20, 150);
  ctx.fillText(`Shields: ${user.shields}`, 20, 180);

  return canvas.toBuffer();
}

// ===== READY =====
client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== SLASH =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  // STREAK
  if (i.commandName === 'streak') {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔥 Streak")
          .setDescription(`Current: ${user.streak}\nBest: ${user.best}\nFails: ${user.fails}/3`)
      ]
    });
  }

  // DAILY
  if (i.commandName === 'daily') {
    const now = Date.now();

    if (now - user.lastDaily < 86400000) {
      return i.reply({ content: "⏳ Already claimed", ephemeral: true });
    }

    const reward = 10 + user.streak * 2;
    user.coins += reward;
    user.lastDaily = now;

    save();

    return i.reply(`💰 +${reward} coins`);
  }

  // RANK CARD
  if (i.commandName === 'rank') {
    const buffer = generateRankCard(user, i.user.username);
    const file = new AttachmentBuilder(buffer, { name: 'rank.png' });

    return i.reply({ files: [file] });
  }

  // SHOP
  if (i.commandName === 'shop') {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Shop")
          .setDescription("shield = 100 coins (prevents streak loss once)")
      ]
    });
  }

  // BUY
  if (i.commandName === 'buy') {
    const item = i.options.getString('item');

    if (item === "shield") {
      if (user.coins < 100) return i.reply("Not enough coins");

      user.coins -= 100;
      user.shields += 1;
      save();

      return i.reply("🛡️ Bought shield");
    }
  }

  // REMINDER
  if (i.commandName === 'remind') {
    const hours = i.options.getInteger('hours');

    setTimeout(() => {
      i.user.send("⏰ Reminder!");
    }, hours * 3600000);

    return i.reply("Reminder set");
  }
});

// ===== STREAK SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);

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