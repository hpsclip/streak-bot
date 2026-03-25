const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const commands = [
  new SlashCommandBuilder().setName('streak').setDescription('Check streak'),
  new SlashCommandBuilder().setName('profile').setDescription('Your stats'),
  new SlashCommandBuilder().setName('daily').setDescription('Daily reward'),
  new SlashCommandBuilder().setName('shop').setDescription('Shop'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top players'),
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy item')
    .addStringOption(o => o.setName('item').setRequired(true)),
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set reminder')
    .addIntegerOption(o => o.setName('hours').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands deployed");
})();