const utilities = require('./utilities');
const moderation = require('./moderation');
const security = require('./security');
const minigames = require('./minigames');
const casino = require('./casino');

const all = [
  ...utilities,
  ...moderation,
  ...security,
  ...minigames,
  ...casino
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
