const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
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

// ===== DATA SAFE LOAD =====
let data = {};
try {
  if (fs.existsSync('data.json')) {
    data = JSON.parse(fs.readFileSync('data.json'));
  }
} catch {
  console.log("Data reset (corrupt)");
  data = {};
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// ===== USER DEFAULT =====
function getUser(id) {
  if (!data[id]) {
    data[id] = {
      streak: 0,
      best: 0,
      lastDate: null,
      timezone: null,
      fails: 0,
      vacationUntil: 0,
      vacationUsed: 0
    };
  }
  return data[id];
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('settz').setDescription('Set timezone with buttons'),
  new SlashCommandBuilder().setName('streak').setDescription('Check streak'),
  new SlashCommandBuilder().setName('top').setDescription('Leaderboard'),
  new SlashCommandBuilder().setName('vacation')
    .setDescription('Pause streak')
    .addIntegerOption(o => o.setName('days').setDescription('Max 3').setRequired(true)),

  new SlashCommandBuilder().setName('resetstreak')
    .setDescription('Admin reset')
    .addUserOption(o => o.setName('user').setRequired(true)),

  new SlashCommandBuilder().setName('setstreak')
    .setDescription('Admin set')
    .addUserOption(o => o.setName('user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setRequired(true)),

  new SlashCommandBuilder().setName('help').setDescription('Help')
];

// ===== REGISTER CLEAN =====
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  console.log("Refreshing commands...");

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Commands ready");
})();

// ===== READY =====
client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== SLASH =====
client.on('interactionCreate', async (i) => {
  if (i.isChatInputCommand()) {
    const user = getUser(i.user.id);

    // HELP
    if (i.commandName === 'help') {
      return i.reply("Use /settz → then chat daily to build streak.");
    }

    // TIMEZONE BUTTONS
    if (i.commandName === 'settz') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tz_est').setLabel('EST').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tz_cst').setLabel('CST').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tz_pst').setLabel('PST').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('tz_gmt').setLabel('GMT').setStyle(ButtonStyle.Secondary)
      );

      return i.reply({ content: "Select your timezone:", components: [row] });
    }

    // STREAK
    if (i.commandName === 'streak') {
      return i.reply(`🔥 ${user.streak} | Best: ${user.best} | Fails: ${user.fails}/3`);
    }

    // TOP
    if (i.commandName === 'top') {
      const sorted = Object.entries(data)
        .filter(([k]) => k !== '_config')
        .sort((a, b) => b[1].streak - a[1].streak)
        .slice(0, 10);

      return i.reply(sorted.map((u, i) =>
        `${i + 1}. <@${u[0]}> — ${u[1].streak}`
      ).join('\n') || 'No data');
    }

    // VACATION (ANTI ABUSE)
    if (i.commandName === 'vacation') {
      const days = i.options.getInteger('days');

      if (days > 3) return i.reply("Max 3 days");

      if (user.vacationUsed >= 2) {
        return i.reply("❌ Vacation limit reached");
      }

      user.vacationUntil = Date.now() + days * 86400000;
      user.vacationUsed++;

      save();
      return i.reply(`Vacation for ${days} days`);
    }

    // ADMIN
    const admin = i.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (i.commandName === 'resetstreak') {
      if (!admin) return i.reply("Admin only");

      const u = i.options.getUser('user');
      getUser(u.id).streak = 0;
      save();

      return i.reply("Reset done");
    }

    if (i.commandName === 'setstreak') {
      if (!admin) return i.reply("Admin only");

      const u = i.options.getUser('user');
      const amount = i.options.getInteger('amount');

      getUser(u.id).streak = amount;
      save();

      return i.reply("Set done");
    }
  }

  // BUTTON HANDLER
  if (i.isButton()) {
    const user = getUser(i.user.id);

    const map = {
      tz_est: "America/New_York",
      tz_cst: "America/Chicago",
      tz_pst: "America/Los_Angeles",
      tz_gmt: "Etc/UTC"
    };

    user.timezone = map[i.customId];
    save();

    return i.reply({ content: `Timezone set to ${user.timezone}`, ephemeral: true });
  }
});

// ===== STREAK SYSTEM (FIXED + FAILS) =====
client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;

  console.log("MSG:", msg.content);

  const user = getUser(msg.author.id);

  if (!user.timezone) return;

  if (user.vacationUntil > Date.now()) return;

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
      msg.reply("💀 Streak lost (3 misses)");
    } else {
      msg.reply(`⚠️ Miss ${user.fails}/3`);
    }
  }

  user.lastDate = today;
  if (user.streak > user.best) user.best = user.streak;

  save();

  msg.reply(`🔥 Streak: ${user.streak}`);
});

client.login(TOKEN);