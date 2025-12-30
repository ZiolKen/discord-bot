const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, c => {
  console.log('READY:', c.user.tag);
});

console.log('LOGIN');
client.login(process.env.TOKEN).catch(console.error);
