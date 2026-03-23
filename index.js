const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Load data
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// Anti-spam cooldown
let cooldown = {};

// REGISTER COMMANDS
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
    .setDescription('View leaderboard')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error(err);
  }
})();

client.on('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const id = interaction.user.id;

  if (!data[id]) {
    data[id] = {
      streak: 0,
      lastDate: null,
      timezone: null,
      best: 0
    };
  }

  const user = data[id];

  // COOLDOWN (anti spam)
  if (cooldown[id] && Date.now() - cooldown[id] < 5000) {
    return interaction.reply({ content: '⏳ Slow down...', ephemeral: true });
  }
  cooldown[id] = Date.now();

  // SET TIMEZONE
  if (interaction.commandName === 'settz') {
    const tz = interaction.options.getString('timezone');

    if (!moment.tz.zone(tz)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Invalid Timezone')
            .setDescription(
              'Example: `America/New_York`\n\nFind yours:\nhttps://en.wikipedia.org/wiki/List_of_tz_database_time_zones'
            )
        ],
        ephemeral: true
      });
    }

    user.timezone = tz;
    saveData();

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Timezone Set')
          .setDescription(`Set to **${tz}**`)
      ]
    });
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
            { name: 'Best', value: `${user.best}`, inline: true }
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
      desc += `**${i + 1}.** ${name} — 🔥 ${sorted[i][1].streak}\n`;
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('🏆 Leaderboard')
          .setDescription(desc || 'No data yet')
      ]
    });
  }

  // AUTO STREAK UPDATE
  if (!user.timezone) return;

  const today = moment().tz(user.timezone).format('YYYY-MM-DD');

  if (!user.lastDate) {
    user.lastDate = today;
    user.streak = 1;
    user.best = 1;
    saveData();
    return;
  }

  const yesterday = moment().tz(user.timezone).subtract(1, 'day').format('YYYY-MM-DD');

  if (user.lastDate === today) return;

  if (user.lastDate === yesterday) {
    user.streak++;
    if (user.streak > user.best) user.best = user.streak;
    user.lastDate = today;
    saveData();
    return;
  }

  user.streak = 1;
  user.lastDate = today;
  saveData();
});

client.login(TOKEN);