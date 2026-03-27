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

const fs = require('fs');

// ===== ENV =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ===== CLIENT =====
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
      timezone: null,
      streak: 0,
      best: 0,
      lastDay: null
    };
  }
  return data[id];
}

// ===== HELPERS =====
function xpNeeded(level) {
  return 50 + level * 30;
}

function getUserDay(user) {
  const tz = user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date().toLocaleString("en-US", { timeZone: tz });
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ===== LOGS =====
let LOG_CHANNEL = null;

async function log(guild, msg) {
  if (!LOG_CHANNEL) return;
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch) ch.send(msg).catch(()=>{});
}

// ===== COMMAND DEPLOY =====
async function deployCommands() {
  const commands = [

    // CORE
    new SlashCommandBuilder().setName('profile').setDescription('Profile'),
    new SlashCommandBuilder().setName('streak').setDescription('Streak'),
    new SlashCommandBuilder().setName('daily').setDescription('Daily'),
    new SlashCommandBuilder().setName('shop').setDescription('Shop'),
    new SlashCommandBuilder().setName('inventory').setDescription('Inventory'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Leaderboard'),

    // ADMIN PANEL
    new SlashCommandBuilder().setName('adminpanel').setDescription('Open admin UI'),

    // ADMIN COMMANDS
    new SlashCommandBuilder()
      .setName('givecoins')
      .setDescription('Give coins')
      .addUserOption(o=>o.setName('user').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setlevel')
      .setDescription('Set level')
      .addUserOption(o=>o.setName('user').setRequired(true))
      .addIntegerOption(o=>o.setName('level').setRequired(true)),

    new SlashCommandBuilder()
      .setName('resetuser')
      .setDescription('Reset user')
      .addUserOption(o=>o.setName('user').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setlogchannel')
      .setDescription('Set logs channel')
      .addChannelOption(o=>o.setName('channel').setRequired(true)),

    // MODERATION
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban user')
      .addUserOption(o=>o.setName('user').setRequired(true)),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick user')
      .addUserOption(o=>o.setName('user').setRequired(true)),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout user')
      .addUserOption(o=>o.setName('user').setRequired(true))
      .addIntegerOption(o=>o.setName('minutes').setRequired(true)),

    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clear messages')
      .addIntegerOption(o=>o.setName('amount').setRequired(true))
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log("✅ Commands deployed");
}

// ===== READY =====
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} online`);
  await deployCommands();
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() && !i.isButton()) return;

  try {

    // ===== SLASH =====
    if (i.isChatInputCommand()) {
      await i.deferReply();
      const user = getUser(i.user.id);

      // ===== BASIC =====
      if (i.commandName === "profile") {
        return i.editReply(
`Level: ${user.level}
XP: ${user.xp}/${xpNeeded(user.level)}
Coins: ${user.coins}`
        );
      }

      if (i.commandName === "streak") {
        return i.editReply(`🔥 ${user.streak} (Best: ${user.best})`);
      }

      if (i.commandName === "daily") {
        user.coins += 50;
        save();
        return i.editReply("💰 +50");
      }

      if (i.commandName === "inventory") {
        return i.editReply(user.inventory.join(", ") || "Empty");
      }

      if (i.commandName === "leaderboard") {
        const top = Object.entries(data)
          .sort((a,b)=>b[1].level - a[1].level)
          .slice(0,10);

        return i.editReply(
          top.map((u,i)=>`#${i+1} <@${u[0]}> Lv${u[1].level}`).join("\n")
        );
      }

      // ===== SHOP =====
      if (i.commandName === "shop") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy_sword').setLabel('Sword (100)').setStyle(ButtonStyle.Primary)
        );
        return i.editReply({ content: "🛒 Shop", components: [row] });
      }

      // ===== ADMIN CHECK =====
      const isAdmin = i.member.permissions.has(PermissionsBitField.Flags.Administrator);

      // ===== ADMIN PANEL =====
      if (i.commandName === "adminpanel") {
        if (!isAdmin) return i.editReply("❌ Admin only");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_give').setLabel('Give Coins').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('panel_reset').setLabel('Reset User').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('panel_logs').setLabel('Logs Info').setStyle(ButtonStyle.Secondary)
        );

        return i.editReply({ content: "🛠️ Admin Panel", components: [row] });
      }

      // ===== ADMIN COMMANDS =====
      if (i.commandName === "givecoins") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");
        const amt = i.options.getInteger("amount");

        getUser(u.id).coins += amt;
        save();

        log(i.guild, `💰 ${u.tag} +${amt}`);

        return i.editReply("✅ Done");
      }

      if (i.commandName === "setlevel") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");
        const lvl = i.options.getInteger("level");

        getUser(u.id).level = lvl;
        save();

        log(i.guild, `📊 ${u.tag} level set to ${lvl}`);

        return i.editReply("✅ Done");
      }

      if (i.commandName === "resetuser") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");

        data[u.id] = undefined;
        save();

        log(i.guild, `♻️ Reset ${u.tag}`);

        return i.editReply("✅ Reset");
      }

      if (i.commandName === "setlogchannel") {
        if (!isAdmin) return i.editReply("❌");

        LOG_CHANNEL = i.options.getChannel("channel").id;

        return i.editReply("✅ Logs channel set");
      }

      // ===== MODERATION =====
      if (i.commandName === "ban") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");
        await i.guild.members.ban(u.id);

        log(i.guild, `🔨 Banned ${u.tag}`);

        return i.editReply("✅ Banned");
      }

      if (i.commandName === "kick") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");
        await i.guild.members.kick(u.id);

        log(i.guild, `👢 Kicked ${u.tag}`);

        return i.editReply("✅ Kicked");
      }

      if (i.commandName === "timeout") {
        if (!isAdmin) return i.editReply("❌");

        const u = i.options.getUser("user");
        const mins = i.options.getInteger("minutes");

        const member = await i.guild.members.fetch(u.id);
        await member.timeout(mins * 60000);

        log(i.guild, `⏱️ Timeout ${u.tag} ${mins}m`);

        return i.editReply("✅ Timeout");
      }

      if (i.commandName === "clear") {
        if (!isAdmin) return i.editReply("❌");

        const amt = i.options.getInteger("amount");
        await i.channel.bulkDelete(amt);

        log(i.guild, `🧹 Cleared ${amt}`);

        return i.editReply("✅ Cleared");
      }
    }

    // ===== BUTTONS =====
    if (i.isButton()) {
      if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return i.reply({ content: "❌ Admin only", ephemeral: true });
      }

      if (i.customId === "buy_sword") {
        const user = getUser(i.user.id);

        if (user.coins < 100) {
          return i.reply({ content: "❌ Not enough", ephemeral: true });
        }

        user.coins -= 100;
        user.inventory.push("sword");
        save();

        return i.reply({ content: "🗡️ Bought", ephemeral: true });
      }

      if (i.customId === "panel_give") {
        return i.reply({ content: "Use /givecoins", ephemeral: true });
      }

      if (i.customId === "panel_reset") {
        return i.reply({ content: "Use /resetuser", ephemeral: true });
      }

      if (i.customId === "panel_logs") {
        return i.reply({ content: `Logs channel: ${LOG_CHANNEL || "Not set"}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (i.deferred) i.editReply("❌ Error");
    else i.reply({ content: "❌ Error", ephemeral: true });
  }
});

// ===== XP + FIXED STREAK =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);

  // XP
  const now = Date.now();
  if (!user.lastXp || now - user.lastXp > 60000) {
    user.xp += 10;
    user.lastXp = now;

    if (user.xp >= xpNeeded(user.level)) {
      user.xp = 0;
      user.level++;
    }
  }

  // STREAK (FIXED)
  const today = getUserDay(user);

  if (!user.lastDay) {
    user.streak = 1;
  } else if (user.lastDay === today) {
    // same day, do nothing
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yDay = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

    if (user.lastDay === yDay) {
      user.streak++;
    } else {
      user.streak = 1;
    }
  }

  user.lastDay = today;

  if (user.streak > user.best) user.best = user.streak;

  save();
});

client.login(TOKEN);