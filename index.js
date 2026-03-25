const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

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
      timezone: null,
      fails: 0,
      coins: 0,
      lastDaily: 0
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

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('settz').setDescription('Select timezone'),
  new SlashCommandBuilder().setName('streak').setDescription('Check streak'),
  new SlashCommandBuilder().setName('rank').setDescription('View rank card'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily reward'),
  new SlashCommandBuilder().setName('help').setDescription('Help menu')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// REGISTER
(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

// ===== READY =====
client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async (i) => {

  // ===== SLASH =====
  if (i.isChatInputCommand()) {
    const user = getUser(i.user.id);

    // HELP
    if (i.commandName === 'help') {
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Help")
            .setDescription("Use /settz → chat daily → build streak → claim /daily")
        ]
      });
    }

    // TIMEZONE BUTTON FLOW
    if (i.commandName === 'settz') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('us').setLabel('USA').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('eu').setLabel('Europe').setStyle(ButtonStyle.Secondary)
      );

      return i.reply({ content: "Select region:", components: [row], ephemeral: true });
    }

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

    // RANK CARD
    if (i.commandName === 'rank') {
      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${i.user.username}'s Rank`)
            .setDescription(`Rank: ${getRank(user.streak)}\nStreak: ${user.streak}`)
            .setColor(0x00ffcc)
        ]
      });
    }

    // DAILY
    if (i.commandName === 'daily') {
      const now = Date.now();

      if (now - user.lastDaily < 86400000) {
        return i.reply({ content: "⏳ Already claimed today", ephemeral: true });
      }

      const reward = 10 + user.streak * 2;

      user.coins += reward;
      user.lastDaily = now;

      save();

      return i.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 Daily Reward")
            .setDescription(`+${reward} coins\nTotal: ${user.coins}`)
        ]
      });
    }
  }

  // ===== BUTTONS =====
  if (i.isButton()) {
    const user = getUser(i.user.id);

    // REGION → STATES
    if (i.customId === 'us') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fl').setLabel('Florida').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ca').setLabel('California').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ny').setLabel('New York').setStyle(ButtonStyle.Primary)
      );

      return i.update({ content: "Select your state:", components: [row] });
    }

    // STATE → TIMEZONE
    const map = {
      fl: "America/New_York",
      ny: "America/New_York",
      ca: "America/Los_Angeles"
    };

    if (map[i.customId]) {
      user.timezone = map[i.customId];
      save();

      return i.update({
        content: "✅ Timezone selected",
        components: []
      });
    }
  }
});

// ===== STREAK SYSTEM =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);
  if (!user.timezone) return;

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
    user.fails++;
    if (user.fails >= 3) {
      user.streak = 1;
      user.fails = 0;
    }
  }

  user.lastDate = today;
  if (user.streak > user.best) user.best = user.streak;

  save();
});

client.login(TOKEN);