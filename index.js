const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== DATA =====
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// ===== RANK SYSTEM =====
function getRank(streak) {
  if (streak >= 25) return "🏆 Elite";
  if (streak >= 10) return "🔥 Grinder";
  if (streak >= 4) return "⚡ Active";
  return "🌱 Beginner";
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('settz')
    .setDescription('Set your timezone')
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Example: America/New_York')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Check your streak'),

  new SlashCommandBuilder()
    .setName('topstreaks')
    .setDescription('Leaderboard'),

  new SlashCommandBuilder()
    .setName('vacation')
    .setDescription('Pause your streak (max 7 days)')
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days to pause (1-7)')
        .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("✅ Slash commands registered");
})();

client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== SLASH COMMANDS =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const id = interaction.user.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      lastDate: null,
      timezone: null,
      best: 0,
      vacationUntil: null
    };
  }

  const user = data[id];

  // SET TIMEZONE
  if (interaction.commandName === 'settz') {
    const tz = interaction.options.getString('timezone');

    if (!moment.tz.zone(tz)) {
      return interaction.reply({ content: "❌ Invalid timezone", ephemeral: true });
    }

    user.timezone = tz;
    saveData();

    return interaction.reply("✅ Timezone set");
  }

  // STREAK
  if (interaction.commandName === 'streak') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🔥 Your Streak')
          .addFields(
            { name: 'Current', value: `${user.streak}`, inline: true },
            { name: 'Best', value: `${user.best}`, inline: true },
            { name: 'Rank', value: getRank(user.streak), inline: true }
          )
      ]
    });
  }

  // LEADERBOARD
  if (interaction.commandName === 'topstreaks') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].streak - a[1].streak)
      .slice(0, 10);

    let desc = '';

    for (let i = 0; i < sorted.length; i++) {
      const member = await interaction.guild.members.fetch(sorted[i][0]).catch(() => null);
      const name = member ? member.user.username : 'Unknown';
      desc += `**${i + 1}.** ${name} — 🔥 ${sorted[i][1].streak} (${getRank(sorted[i][1].streak)})\n`;
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('🏆 Leaderboard')
          .setDescription(desc || 'No data')
      ]
    });
  }

  // VACATION
  if (interaction.commandName === 'vacation') {
    const days = interaction.options.getInteger('days');

    if (days < 1 || days > 7) {
      return interaction.reply({ content: "❌ Max 7 days", ephemeral: true });
    }

    user.vacationUntil = moment().add(days, 'days').toISOString();
    saveData();

    return interaction.reply(`🌴 Vacation mode ON for ${days} days`);
  }
});

// ===== MESSAGE TRACKING =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.length < 3) return;

  const id = message.author.id;

  if (!data[id]) {
    data[id] = { streak: 0, lastDate: null, timezone: null, best: 0, vacationUntil: null };
  }

  const user = data[id];
  if (!user.timezone) return;

  const now = moment().tz(user.time