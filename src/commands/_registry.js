const utilities = require('./utilities');
const moderation = require('./moderation');
const security = require('./security');
const minigames = require('./minigames');
const casino = require('./casino');
const economy = require('./economy');
const fun = require('./fun');
const devutils = require('./devutils');

const all = [
  ...utilities,
  ...moderation,
  ...security,
  ...minigames,
  ...casino,
  ...economy,
  ...fun,
  ...devutils
];

function buildSlashJSON() {
  return all
    .filter(c => c.slash?.data)
    .map(c => c.slash.data.toJSON());
}

function findCommand(name) {
  const n = String(name || '').toLowerCase();
  return all.find(c => c.name === n || (c.aliases || []).includes(n));
}

module.exports = { all, buildSlashJSON, findCommand };
