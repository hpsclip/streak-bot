const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');

const express = require('express');
const fs = require('fs');

// ===== WEB =====
const app = express();
app.get('/', (req, res) => res.send("Bot running ✅"));
app.listen(3000, () => console.log("Web online"));

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent]
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

function xpNeeded(level) {
  return 50 + level * 30;
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
    await p1.send(`⚔️ ${winner.username} won the fight`);
    await p2.send(`⚔️ ${winner.username} won the fight`);
  } catch {}
}

// ===== DEPLOY COMMANDS =====
async function deployCommands() {
  const commands = [

    new SlashCommandBuilder().setName('profile').setDescription('View profile'),
    new SlashCommandBuilder().setName('queue').setDescription('Join matchmaking'),
    new SlashCommandBuilder().setName('shop').setDescription('Open shop'),
    new SlashCommandBuilder().setName('daily').setDescription('Daily coins'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Top players'),
    new SlashCommandBuilder().setName('inventory').setDescription('View inventory'),

    new SlashCommandBuilder()
      .setName('addcoins')
      .setDescription('Admin only')
      .addUserOption(o => o.setName('user').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setRequired(true)),

    new SlashCommandBuilder()
      .setName('removecoins')
      .setDescription('Admin only')
      .addUserOption(o => o.setName('user').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setRequired(true)),

    new SlashCommandBuilder()
      .setName('giveitem')
      .setDescription('Admin only')
      .addUserOption(o => o.setName('user').setRequired(true))
      .addStringOption(o => o.setName('item').setRequired(true))
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

  console.log("✅ Commands deployed");
}

// ===== READY =====
client.on('ready', async () => {
  console.log(`✅ ${client.user.tag} online`);
  await deployCommands();
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async (i) => {

  if (!i.isChatInputCommand() && !i.isButton()) return;

  try {

    // ===== SLASH COMMANDS =====
    if (i.isChatInputCommand()) {
      await i.deferReply();

      const user = getUser(i.user.id);

      if (i.commandName === "profile") {
        return i.editReply(
`Level: ${user.level}
XP: ${user.xp}/${xpNeeded(user.level)}
Coins: ${user.coins}
Wins: ${user.wins} | Losses: ${user.losses}`
        );
      }

      if (i.commandName === "inventory") {
        return i.editReply(user.inventory.join(", ") || "Empty");
      }

      if (i.commandName === "leaderboard") {
        const top = Object.entries(data)
          .sort((a,b)=>b[1].level - a[1].level)
          .slice(0,10);

        return i.editReply(
          top.map((u,i)=>`#${i+1} <@${u[0]}> - Lv ${u[1].level}`).join("\n") || "No data"
        );
      }

      if (i.commandName === "queue") {
        if (!queue.find(p => p.id === i.user.id)) {
          queue.push(i.user);
          matchPlayers();
          return i.editReply("✅ Added to queue");
        } else {
          return i.editReply("⚠️ Already queued");
        }
      }

      if (i.commandName === "shop") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy_sword').setLabel('Sword (100)').setStyle(ButtonStyle.Primary)
        );

        return i.editReply({ content: "🛒 Shop:", components: [row] });
      }

      if (i.commandName === "daily") {
        user.coins += 50;
        save();
        return i.editReply("💰 +50 coins");
      }

      // ===== ADMIN =====
      if (
        ["addcoins","removecoins","giveitem"].includes(i.commandName) &&
        !i.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return i.editReply("❌ Admin only");
      }

      if (i.commandName === "addcoins") {
        const target = i.options.getUser("user");
        const amount = i.options.getInteger("amount");

        getUser(target.id).coins += amount;
        save();

        return i.editReply(`✅ Added ${amount} coins`);
      }

      if (i.commandName === "removecoins") {
        const target = i.options.getUser("user");
        const amount = i.options.getInteger("amount");

        getUser(target.id).coins -= amount;
        save();

        return i.editReply(`➖ Removed ${amount}`);
      }

      if (i.commandName === "giveitem") {
        const target = i.options.getUser("user");
        const item = i.options.getString("item");

        getUser(target.id).inventory.push(item);
        save();

        return i.editReply(`🎁 Gave ${item}`);
      }
    }

    // ===== BUTTONS =====
    if (i.isButton()) {
      const user = getUser(i.user.id);

      if (i.customId === "buy_sword") {
        if (user.coins < 100) {
          return i.reply({ content: "❌ Not enough coins", ephemeral: true });
        }

        user.coins -= 100;
        user.inventory.push("sword");
        save();

        return i.reply({ content: "🗡️ Bought sword", ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);

    if (i.deferred) {
      i.editReply("❌ Error");
    } else {
      i.reply({ content: "❌ Error", ephemeral: true });
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

    save();
  }
});

client.login(TOKEN);