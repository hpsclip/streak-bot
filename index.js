const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const express = require('express');
const fs = require('fs');
const { createCanvas } = require('canvas');

const app = express();

// ===== WEB DASHBOARD =====
app.get('/', (req, res) => {
  res.send("Bot is running ✅");
});

app.listen(3000, () => console.log("Web panel running"));

// ===== DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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
      xp: 0,
      level: 1,
      coins: 0,
      inventory: [],
      wins: 0,
      losses: 0,
      lastXp: 0
    };
  }
  return data[id];
}

// ===== MATCHMAKING =====
let queue = [];

function matchPlayers() {
  if (queue.length >= 2) {
    const p1 = queue.shift();
    const p2 = queue.shift();

    startFight(p1, p2);
  }
}

async function startFight(p1, p2) {
  const u1 = getUser(p1.id);
  const u2 = getUser(p2.id);

  let p1Power = u1.level + (u1.inventory.includes("sword") ? 5 : 0);
  let p2Power = u2.level + (u2.inventory.includes("sword") ? 5 : 0);

  let winner = p1Power > p2Power ? p1 : p2;
  let loser = winner === p1 ? p2 : p1;

  getUser(winner.id).wins++;
  getUser(loser.id).losses++;

  save();

  p1.send(`⚔️ Match result: ${winner.username} won`);
  p2.send(`⚔️ Match result: ${winner.username} won`);
}

// ===== RANK CARD =====
function rankCard(user, name) {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 600, 200);

  ctx.fillStyle = "#0f0";
  ctx.fillText(name, 20, 40);
  ctx.fillText(`Level: ${user.level}`, 20, 80);
  ctx.fillText(`XP: ${user.xp}`, 20, 110);

  return canvas.toBuffer();
}

// ===== READY =====
client.on('ready', () => {
  console.log("Bot ready");
});

// ===== COMMANDS =====
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);
  const now = Date.now();

  // XP SYSTEM
  if (now - user.lastXp > 60000) {
    user.xp += 10;
    user.lastXp = now;

    if (user.xp >= 100) {
      user.level++;
      user.xp = 0;
    }
  }

  // COMMANDS (TEXT → YOU CAN SWITCH TO SLASH LATER)
  if (msg.content === "!profile") {
    return msg.reply(`Level: ${user.level}\nCoins: ${user.coins}`);
  }

  if (msg.content === "!rank") {
    const img = rankCard(user, msg.author.username);
    return msg.reply({ files: [new AttachmentBuilder(img)] });
  }

  if (msg.content === "!queue") {
    if (!queue.find(p => p.id === msg.author.id)) {
      queue.push(msg.author);
      msg.reply("✅ Added to matchmaking queue");
    }
    matchPlayers();
  }

  if (msg.content === "!shop") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('buy_sword').setLabel('Sword (100)').setStyle(ButtonStyle.Primary)
    );

    msg.reply({ content: "Shop:", components: [row] });
  }
});

// ===== BUTTONS =====
client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;

  const user = getUser(i.user.id);

  if (i.customId === "buy_sword") {
    if (user.coins < 100) return i.reply({ content: "❌ Not enough", ephemeral: true });

    user.coins -= 100;
    user.inventory.push("sword");
    save();

    return i.reply({ content: "🗡️ Sword bought", ephemeral: true });
  }
});

client.login(process.env.TOKEN);