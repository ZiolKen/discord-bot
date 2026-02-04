const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function isOwner(userId) {
  return Boolean(process.env.OWNER_ID) && String(process.env.OWNER_ID) === String(userId);
}

function formatGuild(g) {
  return `• **${g.name}** (\`${g.id}\`) — ${g.memberCount ?? '?'} members`;
}

function buildEmbed(page, totalPages, list) {
  const embed = new EmbedBuilder()
    .setTitle('🏠 Guilds')
    .setDescription(list.length ? list.join('\n') : 'No guilds found.')
    .setFooter({ text: `Page ${page}/${totalPages}` });
  return embed;
}

async function runList({ guilds, userId, reply, page, search }) {
  if (!isOwner(userId)) return reply({ content: '🚫 Owner only.', ephemeral: true });

  const q = String(search || '').trim().toLowerCase();
  const all = guilds
    .filter(g => !q || g.name.toLowerCase().includes(q) || String(g.id).includes(q))
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));

  const per = 10;
  const totalPages = Math.max(1, Math.ceil(all.length / per));
  const p = Math.min(Math.max(1, page || 1), totalPages);
  const slice = all.slice((p - 1) * per, p * per).map(formatGuild);

  return reply({ embeds: [buildEmbed(p, totalPages, slice)], ephemeral: true });
}

module.exports = [
  {
    name: 'guilds',
    category: 'owner',
    description: 'List all guilds (owner only)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('guilds')
        .setDescription('List all guilds the bot is in (owner only)')
        .addIntegerOption(o => o.setName('page').setDescription('Page number').setRequired(false))
        .addStringOption(o => o.setName('search').setDescription('Search by name or ID').setRequired(false)),
      async run(interaction, ctx) {
        const page = interaction.options.getInteger('page') || 1;
        const search = interaction.options.getString('search') || '';
        return runList({
          guilds: Array.from(ctx.client.guilds.cache.values()),
          userId: interaction.user.id,
          page,
          search,
          reply: (payload) => interaction.reply(payload)
        });
      }
    },
    prefix: {
      async run(message, args, ctx) {
        const page = Number(args[0] || 1);
        const search = args.slice(1).join(' ');
        return runList({
          guilds: Array.from(ctx.client.guilds.cache.values()),
          userId: message.author.id,
          page: Number.isFinite(page) ? page : 1,
          search,
          reply: (payload) => message.reply(payload)
        });
      }
    }
  }
];
