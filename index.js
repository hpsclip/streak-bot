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
      timezone: "UTC"
    };
  }
  return data[id];
}

// ===== TIME =====
function getLocalTime(tz) {
  try {
    return new Date().toLocaleString("en-US", { timeZone: tz });
  } catch {
    return "Invalid timezone";
  }
}

// ===== XP =====
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
    await p1.send(`⚔️ ${winner.username} won`);
    await p2.send(`⚔️ ${winner.username} won`);
  } catch {}
}

// ===== DEPLOY COMMANDS =====
async function deployCommands() {
  const commands = [

    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View profile'),

    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Join matchmaking'),

    new SlashCommandBuilder()
      .setName('shop')
      .setDescription('Open shop'),

    new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Daily coins'),

    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Top players'),

    new SlashCommandBuilder()
      .setName('inventory')
      .setDescription('View inventory'),

    // ===== TIMEZONE =====
    new SlashCommandBuilder()
      .setName('settz')
      .setDescription('Set your timezone')
      .addStringOption(o =>
        o.setName('zone')
         .setDescription('Example: America/New_York')
         .setRequired(true)
      ),

    // ===== ADMIN =====
    new SlashCommandBuilder()
      .setName('addcoins')
      .setDescription('Admin only')
      .addUserOption(o =>
        o.setName('user')
         .setDescription('Target')
         .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName('amount')
         .setDescription('Amount')
         .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('removecoins')
      .setDescription('Admin only')
      .addUserOption(o =>
        o.setName('user')
         .setDescription('Target')
         .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName('amount')
         .setDescription('Amount')
         .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('giveitem')
      .setDescription('Admin only')
      .addUserOption(o =>
        o.setName('user')
         .setDescription('Target')
         .setRequired(true)
      )
      .addStringOption(o =>
        o.setName('item')
         .setDescription('Item name')
         .setRequired(true)
      )
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

    if (i.isChatInputCommand()) {
      await i.deferReply();

      const user = getUser(i.user.id);

      if (i.commandName === "profile") {
        return i.editReply(
`Level: ${user.level}
XP: ${user.xp}/${xpNeeded(user.level)}
Coins: ${user.coins}
Time: ${getLocalTime(user.timezone)}`
        );
      }

      if (i.commandName === "settz") {
        const tz = i.options.getString("zone");

        try {
          new Date().toLocaleString("en-US", { timeZone: tz });
          user.timezone = tz;
          save();
          return i.editReply(`🌍 Timezone set to ${tz}`);
        } catch {
          return i.editReply("❌ Invalid timezone");
        }
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
        queue.push(i.user);
        matchPlayers();
        return i.editReply("✅ Queued");
      }

      if (i.commandName === "shop") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy_sword').setLabel('Sword (100)').setStyle(ButtonStyle.Primary)
        );
        return i.editReply({ content: "🛒 Shop", components: [row] });
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
        const u = i.options.getUser("user");
        const amt = i.options.getInteger("amount");
        getUser(u.id).coins += amt;
        save();
        return i.editReply("✅ Added coins");
      }

    }

    if (i.isButton()) {
      const user = getUser(i.user.id);

      if (i.customId === "buy_sword") {
        if (user.coins < 100) return i.reply({ content: "❌ Not enough", ephemeral: true });

        user.coins -= 100;
        user.inventory.push("sword");
        save();

        return i.reply({ content: "🗡️ Bought sword", ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ===== XP =====
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