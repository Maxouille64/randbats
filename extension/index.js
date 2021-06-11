var DATA = {};

var SUPPORTED = [
  'gen1randombattle', 'gen2randombattle',  'gen3randombattle',
  'gen4randombattle', 'gen5randombattle', 'gen6randombattle',
  'gen7randombattle', 'gen7letsgorandombattle', 'gen7randomdoublesbattle',
  'gen8randombattlenodmax', 'gen8randombattle','gen8randomdoublesbattle',
];

// Random Battle sets are generated based on battle-only forms which makes disambiguating sets
// difficult sometimes. We first try searching by level as sometimes this is sufficient to
// differentiate and then by base species - if there is only one set then we can return it.
// Otherwise, if the Pokémon is not the base forme and there is only one set for that forme we can
// return that. However, if the Pokémon is still in its base forme we return multiple (labelled)
// sets.

for (var format of SUPPORTED) {
  (function (f) {
    var request = new XMLHttpRequest();
    request.addEventListener('load', function() {
      var data = {};
      var json = JSON.parse(request.responseText);
      for (var name in json) {
        var pokemon = json[name];
        data[pokemon.level] = data[pokemon.level] || {};
        var species = Dex.species.get(name);
        var id =
          toID(species.forme === 'Gmax' ? species.baseSpecies : species.battleOnly || species.name);
        data[pokemon.level][id] = data[pokemon.level][id] || [];
        data[pokemon.level][id].push({name, ...pokemon});
      }
      DATA[f] = data;
    });
    request.open('GET', 'https://pkmn.github.io/randbats/data/' + f + '.json');
    request.send(null);
  })(format);
}

var TOOLTIP = BattleTooltips.prototype.showPokemonTooltip;
BattleTooltips.prototype.showPokemonTooltip = function (clientPokemon, serverPokemon) {
  var original = TOOLTIP.apply(this, arguments);
  if (!clientPokemon || serverPokemon) return original;

  var format = toID(this.battle.tier);
  if (!format || !format.includes('random')) return original;

  var species = Dex.species.get(clientPokemon.speciesForme);
  if (!species) return original;

  var gen = Number(format.charAt(3));
  var letsgo = format.includes('letsgo');
  var gameType = this.battle.gameType;

  if (!['singles', 'doubles'].includes(gameType)) {
    format = 'gen' + gen + 'randomdoublesbattle';
  } else if (format.includes('monotype') || format.includes('unrated')) {
    format = 'gen' + gen + 'randombattle';
  }
  if (!DATA[format]) return original;

  var data = DATA[format][clientPokemon.level];
  if (!data) return original;
  var species = Dex.species.get(clientPokemon.speciesForme);
  var id =
    toID(species.forme === 'Gmax' ? species.baseSpecies : species.battleOnly || species.name);
  data = data[id];
  if (!data) return original;

  if (data.length === 1) return original + displaySet(gen, gameType, letsgo, species, data[0]);
  if (toID(clientPokemon.speciesForme) !== id) {
    var match = [];
    for (var set of data) {
      if (set.name === clientPokemon.speciesForme) {
        match.push(displaySet(gen, gameType, letsgo, species, set));
      }
    }
    if (match.length === 1) return original + match[0];
  }
  var buf = original;
  for (var set of data) {
    buf += displaySet(gen, gameType, letsgo, species, set, set.name);
  }
  return buf;
}

function displaySet(gen, gameType, letsgo, species, data, name) {
  var stats = {};
  for (var stat in species.baseStats) {
    stats[stat] = calc(
      gen,
      stat,
      species.baseStats[stat],
      'ivs' in data && stat in data.ivs ? data.ivs[stat] : (gen < 3 ? 30 : 31),
      'evs' in data && stat in data.evs ? data.evs[stat] : (gen < 3 ? 255 : 85),
      data.level);
  }

  var moves = data.moves;
  if (!['singles', 'doubles'].includes(gameType)) {
    var ms = [];
    for (var move of moves) {
      if (move !== 'Ally Switch') ms.push(move);
    }
    moves = ms;
  }

  var buf = '<div style="border-top: 1px solid #888; background: #dedede">';
  if (name) buf += '<p><b>' + name + '</b></p>';
  buf +=  '<p><small>Max HP:</small> ' + stats.hp + '</p>';
  if (gen >= 3 && !letsgo) buf += '<p><small>Abilities:</small> ' + data.abilities.join(', ') + '</p>';
  if (gen >= 2) buf += '<p><small>Items:</small> ' + (data.items ? data.items.join(', ') : '(None)') + '</p>';
  buf += '<p><small>Moves:</small> ' + moves.join(', ') + '</p>';

  buf += '<p>';
  for (var statName of Dex.statNamesExceptHP) {
    if (gen === 1 && statName === 'spd') continue;
    var statLabel = gen === 1 && statName === 'spa' ? 'spc' : statName;
    buf += statName === 'atk' ? '<small>' : '<small> / ';
    buf += '' + BattleText[statLabel].statShortName + '&nbsp;</small>';
    buf += '' + stats[statName];
  }
  buf += '</p>';
  buf += '</div>';
  return buf;
}

function tr(num) {
  return num >>> 0
}

function calc(gen, stat, base, iv, ev, level) {
  if (gen < 3) iv = Math.floor(iv / 2) * 2;
  if (stat === 'hp') {
    return base === 1 ? base : tr(tr(2 * base + iv + tr(ev / 4) + 100) * level / 100 + 10);
  } else {
    return tr(tr(2 * base + iv + tr(ev / 4)) * level / 100 + 5);
  }
}