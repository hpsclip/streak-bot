const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const express = require('express');
const fs = require('fs');

// ===== WEB (Railway keep-alive) =====
const app = express();
app.get('/', (req, res) => res.send("Bot running ✅"));
app.listen(3000, () => console.log("Web online"));

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ===== DATA =====
let data = {};
if (fs.existsSync('data.json')) {
  try { data = JSON.parse(fs.readFileSync('data.json')); }
  catch { data = {}; }
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
      lastXp: 0,
      achievements: []
    };
  }
  return data[id];
}

// ===== SYSTEMS =====
function xpNeeded(level) {
  return 50 + level * 30;
}

// ===== ACHIEVEMENTS =====
const achievements = {
  level5: u => u.level >= 5,
  rich: u => u.coins >= 200,
  winner: u => u.wins >= 3
};

function checkAchievements(user) {
  for (let key in achievements) {
    if (!user.achievements.includes(key) && achievements[key](user)) {
      user.achievements.push(key);
    }
  }
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

  let winner = p1Power >= p2Power ? p1 : p2;
  let loser = winner === p1 ? p2 : p1;

  getUser(winner.id).wins++;
  getUser(loser.id).losses++;

  save();

  try {
    await p1.send(`⚔️ Match result: ${winner.username} won`);
    await p2.send(`⚔️ Match result: ${winner.username} won`);
  } catch {}
}

// ===== DEPLOY SLASH COMMANDS =====
async function deployCommands() {
  const commands = [
    new SlashCommandBuilder().setName('profile').setDescription('View profile'),
    new SlashCommandBuilder().setName('queue').setDescription('Join matchmaking'),
    new SlashCommandBuilder().setName('shop').setDescription('Open shop'),
    new SlashCommandBuilder().setName('daily').setDescription('Daily coins')
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // 🔥 CLEAR OLD COMMANDS
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [] }
  );

  // ✅ DEPLOY NEW COMMANDS
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands deployed clean");
}

// ===== READY =====
client.on('ready', async () => {
  console.log(`✅ ${client.user.tag} online`);
  await deployCommands();
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async (i) => {

  // ===== SLASH COMMANDS =====
  if (i.isChatInputCommand()) {
    const user = getUser(i.user.id);

    if (i.commandName === "profile") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stats').setLabel('Stats').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('inventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('achievements').setLabel('Achievements').setStyle(ButtonStyle.Success)
      );

      return i.reply({
        content:
`Level: ${user.level}
XP: ${user.xp}/${xpNeeded(user.level)}
Coins: ${user.coins}
Wins: ${user.wins} | Losses: ${user.losses}`,
        components: [row]
      });
    }

    if (i.commandName === "queue") {
      if (!queue.find(p => p.id === i.user.id)) {
        queue.push(i.user);
        i.reply("✅ Added to matchmaking queue");
      } else {
        i.reply("⚠️ Already in queue");
      }

      matchPlayers();
    }

    if (i.commandName === "shop") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('buy_sword').setLabel('Sword (100)').setStyle(ButtonStyle.Primary)
      );

      i.reply({ content: "🛒 Shop:", components: [row] });
    }

    if (i.commandName === "daily") {
      user.coins += 50;
      save();
      i.reply("💰 +50 coins");
    }
  }

  // ===== BUTTONS =====
  if (i.isButton()) {
    const user = getUser(i.user.id);

    if (i.customId === "buy_sword") {
      if (user.coins < 100)
        return i.reply({ content: "❌ Not enough coins", ephemeral: true });

      user.coins -= 100;
      user.inventory.push("sword");
      save();

      return i.reply({ content: "🗡️ Sword purchased", ephemeral: true });
    }

    if (i.customId === "inventory") {
      return i.reply({
        content: user.inventory.join(", ") || "Empty",
        ephemeral: true
      });
    }

    if (i.customId === "achievements") {
      return i.reply({
        content: user.achievements.join(", ") || "None",
        ephemeral: true
      });
    }

    if (i.customId === "stats") {
      return i.reply({
        content:
`Level: ${user.level}
XP: ${user.xp}
Wins: ${user.wins}
Losses: ${user.losses}`,
        ephemeral: true
      });
    }
  }
});

// ===== XP SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);
  const now = Date.now();

  if (!user.lastXp || now - user.lastXp > 60000) {
    user.xp += 10;
    user.lastXp = now;

    if (user.xp >= xpNeeded(user.level)) {
      user.xp = 0;
      user.level++;
    }

    checkAchievements(user);
    save();
  }
});

client.login(TOKEN);