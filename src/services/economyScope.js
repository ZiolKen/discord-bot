const ECONOMY_GLOBAL_GUILD_ID = String(process.env.ECONOMY_GLOBAL_GUILD_ID || '__global_economy__');

function economyGuildId() {
  return ECONOMY_GLOBAL_GUILD_ID;
}

module.exports = {
  ECONOMY_GLOBAL_GUILD_ID,
  economyGuildId
};
