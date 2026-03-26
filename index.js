const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===== DATA =====
let data = {};
if (fs.existsSync('data.json')) {
  try {
    data = JSON.parse(fs.readFileSync('data.json'));
  } catch {
    data = {};
  }
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      last: 0,
      fails: 0,
      coins: 0,
      shields: 0,
      lastDaily: 0
    };
  }
  return data[id];
}

// ===== RANK =====
function getRank(s) {
  if (s >= 50) return "👑 Legend";
  if (s >= 25) return "🏆 Pro";
  if (s >= 10) return "🔥 Grinder";
  if (s >= 5) return "⚡ Active";
  return "🌱 Beginner";
}

// ===== AUTO DEPLOY COMMANDS =====
async function deployCommands() {
  const commands = [
    new SlashCommandBuilder().setName('streak').setDescription('Check streak'),
    new SlashCommandBuilder().setName('profile').setDescription('Profile'),
    new SlashCommandBuilder().setName('daily').setDescription('Daily reward'),
    new SlashCommandBuilder().setName('shop').setDescription('Shop'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Leaderboard'),
    new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Buy item')
      .addStringOption(o => o.setName('item').setRequired(true))
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands deployed");
}

// ===== READY =====
client.on('clientReady', async () => {
  console.log(`✅ ${client.user.tag} online`);
  await deployCommands();
});

// ===== COMMANDS =====
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  try {
    await i.deferReply();

    if (i.commandName === 'streak') {
      return i.editReply(`🔥 Streak: ${user.streak} | Best: ${user.best}`);
    }

    if (i.commandName === 'profile') {
      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(i.user.username)
            .setDescription(
              `Rank: ${getRank(user.streak)}\nStreak: ${user.streak}\nCoins: ${user.coins}\nShields: ${user.shields}`
            )
        ]
      });
    }

    if (i.commandName === 'daily') {
      const now = Date.now();

      if (now - user.lastDaily < 86400000) {
        return i.editReply("⏳ Already claimed");
      }

      const reward = 10 + user.streak * 2;
      user.coins += reward;
      user.lastDaily = now;

      save();
      return i.editReply(`💰 +${reward} coins`);
    }

    if (i.commandName === 'shop') {
      return i.editReply("🛒 shield = 100 coins");
    }

    if (i.commandName === 'buy') {
      const item = i.options.getString('item');

      if (item !== "shield") return i.editReply("❌ Invalid item");
      if (user.coins < 100) return i.editReply("❌ Not enough coins");

      user.coins -= 100;
      user.shields++;

      save();
      return i.editReply("🛡️ Shield bought");
    }

    if (i.commandName === 'leaderboard') {
      const top = Object.entries(data)
        .sort((a, b) => b[1].streak - a[1].streak)
        .slice(0, 10);

      const text = top.map((u, i) =>
        `#${i + 1} <@${u[0]}> - ${u[1].streak}`
      ).join("\n") || "No data";

      return i.editReply(text);
    }

  } catch (err) {
    console.error(err);
    i.editReply("❌ Error");
  }
});

// ===== STREAK SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);
  const now = Date.now();
  const day = 86400000;

  if (!user.last) {
    user.streak = 1;
    user.last = now;
    save();
    return;
  }

  if (now - user.last < day) return;

  if (now - user.last < day * 2) {
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

  user.last = now;
  if (user.streak > user.best) user.best = user.streak;

  save();
});

client.login(TOKEN);