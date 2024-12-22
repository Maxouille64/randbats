var DATA = {};

var SUPPORTED = [
  'gen9randombattle', 'gen9randomdoublesbattle', 'gen9babyrandombattle',
  'gen8randombattle', 'gen8randomdoublesbattle', 'gen8bdsprandombattle',
  'gen7randombattle', 'gen7letsgorandombattle',
  'gen6randombattle', 'gen5randombattle', 'gen4randombattle', 'gen3randombattle',
  'gen2randombattle', 'gen1randombattle',
];

// Random Battle sets are generated based on battle-only forms which makes disambiguating sets
// difficult sometimes. We first try searching by level as sometimes this is sufficient to
// differentiate and then by base species - if there is only one set then we can return it.
// Otherwise, if the Pokémon is not the base forme and there is only one set for that forme we can
// return that. However, if the Pokémon is still in its base forme we return multiple (labelled)
// sets.

var TOOLTIP = undefined;
try { TOOLTIP = BattleTooltips.prototype.showPokemonTooltip; } catch {}
var TOOLTIPMOVE = undefined;
try { TOOLTIPMOVE = BattleTooltips.prototype.showMoveTooltip; } catch {}
if (TOOLTIP) {
  for (var format of SUPPORTED) {
    (function (f) {
      var request = new XMLHttpRequest();
      request.addEventListener('load', function() {
        try {
          var data = {};
          var json = JSON.parse(request.responseText);
          for (var name in json) {
            var pokemon = json[name];
            // Zoroark has an actual level but the "Illusion Level Mod" means the server will lie
            // about its level making it difficult to find. Instead we special case things here and
            // below to always just set Zoroark's level to 0 for searching (the actual clientPokemon
            // level gets used for computing stats)
            if (name.startsWith('Zoroark')) pokemon.level = 0;
            data[pokemon.level] = data[pokemon.level] || {};
            // Dex.forGen not important here because we're not looking at stats
            var species = Dex.species.get(name);
            var id = toID(species.forme === 'Gmax'
              ? species.baseSpecies
              : species.battleOnly || species.name);
            data[pokemon.level][id] = data[pokemon.level][id] || [];
            data[pokemon.level][id].push(Object.assign({name: name}, pokemon));
          }
          DATA[f] = data;
        } catch (err) {
          console.error('Unable to load data for ' + f +
            ' - please check to see if your Pokémon Showdown Randbats Tooltip is up to date.');
        }
      });
      request.open('GET', 'https://pkmn.github.io/randbats/data/stats/' + f + '.json');
      request.send(null);
    })(format);
  }

  BattleTooltips.prototype.showPokemonTooltip = function (clientPokemon, serverPokemon) {
    var original = TOOLTIP.apply(this, arguments);
    if (!clientPokemon || serverPokemon) return original;

    var format = toID(this.battle.tier);
    if (!format || !format.includes('random')) return original;

    var gen = Number(format.charAt(3));
    var letsgo = format.includes('letsgo');
    var gameType = this.battle.gameType;

    var species = Dex.forGen(gen).species.get(
      clientPokemon.volatiles.formechange
      ? clientPokemon.volatiles.formechange[1]
      : clientPokemon.speciesForme);
    if (!species) return original;

    if (!['singles', 'doubles'].includes(gameType)) {
      format = 'gen' + gen + 'randomdoublesbattle';
    } else if (format.includes('monotype') || format.includes('unrated')) {
      format = 'gen' + gen + 'randombattle';
    } else if (format.endsWith('blitz')) {
      format = format.slice(0, -5);
    }
    if (!DATA[format]) return original;

    var data = DATA[format][species.baseSpecies === 'Zoroark' ? 0 : clientPokemon.level];
    if (!data) return original;

    var cosmetic = species.cosmeticFormes && species.cosmeticFormes.includes(species.name);
    var id = toID((species.forme === 'Gmax' || cosmetic)
      ? species.baseSpecies : species.battleOnly || species.name);
    if (id.startsWith('pikachu')) id = id.endsWith('gmax') ? 'pikachugmax' : 'pikachu';
    var forme = cosmetic ? species.baseSpecies : clientPokemon.speciesForme;
    if (forme.startsWith('Pikachu')) forme = forme.endsWith('Gmax') ? 'Pikachu-Gmax' : 'Pikachu';

    var d = data;
    data = data[id];
    if (!data) return original;

    if (id === 'greninja' && 'greninjabond' in d) {
      data = data.concat(d['greninjabond']);
    }

    if (data.length === 1) {
      data[0].level = clientPokemon.level;
      return original + displaySet(gen, gameType, letsgo, species, data[0], undefined, clientPokemon);
    }
    if (toID(forme) !== id) {
      var match = [];
      for (var set of data) {
        set.level = clientPokemon.level;
        if (set.name === forme) {
          match.push(displaySet(gen, gameType, letsgo, species, set, undefined, clientPokemon));
        }
      }
      if (match.length === 1) return original + match[0];
    }
    var buf = original;
    for (var set of data) {
      set.level = clientPokemon.level;
      // Technically different formes will have different base stats, but given at this stage
      // we're still in the base forme we simply use the base forme base stats for everything.
      buf += displaySet(gen, gameType, letsgo, species, set, set.name, clientPokemon);
    }
    return buf;
  }

  function displaySet(gen, gameType, letsgo, species, data, name, clientPokemon) {
    var noHP = true;
    if (data.moves) {
      for (var move in data.moves) {
        if (move.startsWith('Hidden Power')) {
          noHP = false;
          break;
        }
      }
    }

    var buf = '<div style="border-top: 1px solid #888; background: #dedede">';
    if (name) buf += '<p><b>' + name + '</b></p>';

    var multi = !['singles', 'doubles'].includes(gameType);
    if (data.roles) {
      var roles = filter(data.roles, clientPokemon);
      if (!roles.length) return '';
      var i = 0;
      for (var role of roles) {
        buf += (i == 0 ? '<div>' : '<div style="border-top: 1px solid #888;">');
        buf += '<p><span style="text-decoration: underline;">' + role[0] + '</span> ' +
          '<small>(' + Math.round(role[1].weight * 100) + '%)</small>';
          if (gen >= 3 && !letsgo) {
            buf += '<p><small>Abilities:</small> ' + display(role[1].abilities) + '</p>';
          }
          if (gen >= 2 && !(letsgo && !role[1].items)) {
            buf += '<p><small>Items:</small> ' +
              (role[1].items ? display(role[1].items) : '(No Item)') + '</p>';
          }
        if (gen === 9) {
          buf += '<p><small>Tera Types:</small> ' + display(role[1].teraTypes) + '</p>';
        }
        buf += '<p><small>Moves:</small> ' + display(role[1].moves, multi) + '</p>';
        buf += displayStats(gen, letsgo, species, role[1], data.level, noHP, clientPokemon) + '</div>';
        i++;
      }
    } else {
      if (gen >= 3 && !letsgo) {
        buf += '<p><small>Abilities:</small> ' + display(data.abilities) + '</p>';
      }
      if (gen >= 2 && !(letsgo && !data.items)) {
        buf += '<p><small>Items:</small> ' +
          (data.items ? display(data.items) : '(No Item)') + '</p>';
      }
      buf += '<p><small>Moves:</small> ' + display(data.moves, multi) + '</p>';
      buf += displayStats(gen, letsgo, species, data, data.level, noHP, clientPokemon);
    }

    buf += '</div>';
    return buf;
  }

  function displayStats(gen, letsgo, species, data, level, noHP, pokemon) {
    var stats = {};
    for (var stat in species.baseStats) {
      stats[stat] = calcStat(
        gen,
        stat,
        species.baseStats[stat],
        'ivs' in data && stat in data.ivs ? data.ivs[stat] : (gen < 3 ? 30 : 31),
        'evs' in data && stat in data.evs ? data.evs[stat] : (gen < 3 ? 255 : letsgo ? 0 : 85),
        level,
        letsgo);
    }

    buf ='<p>';
    //todo
    if(Object.keys(pokemon.boosts).length != 0){
      for (var statName of Dex.statNamesExceptHP) {
        if (gen === 1 && statName === 'spd') continue;
        var known = gen === 1 || (gen === 2 && noHP) ||
          ('ivs' in data && statName in data.ivs) || ('evs' in data && statName in data.evs);
        var statLabel = gen === 1 && statName === 'spa' ? 'spc' : statName;
        buf += statName === 'atk' ? '<small>' : '<small> / ';
        buf += '' + BattleText[statLabel].statShortName + '&nbsp;</small>';
        var italic = !known && (statName === 'atk' || statName === 'spe');
        if (pokemon.boosts[statName] && pokemon.boosts[statName]<0) {
          buf += (italic ? '<i style="color:red">' : '<a style="color:red">') + Math.floor(stats[statName] / (1 - pokemon.boosts[statName]*0.5)) + (italic ? '</i>' : '</a>');
        } else if (pokemon.boosts[statName]) {
          buf += (italic ? '<i style="color:green">' : '<a style="color:green">') + Math.floor(stats[statName] * (1 + pokemon.boosts[statName]*0.5) ) + (italic ? '</i>' : '</a>');
        } else {
          buf += (italic ? '<i>' : '') + stats[statName] + (italic ? '</i>' : '')
        }
      }
    } else {
      for (var statName of Dex.statNamesExceptHP) {
        if (gen === 1 && statName === 'spd') continue;
        var known = gen === 1 || (gen === 2 && noHP) ||
          ('ivs' in data && statName in data.ivs) || ('evs' in data && statName in data.evs);
        var statLabel = gen === 1 && statName === 'spa' ? 'spc' : statName;
        buf += statName === 'atk' ? '<small>' : '<small> / ';
        buf += '' + BattleText[statLabel].statShortName + '&nbsp;</small>';
        var italic = !known && (statName === 'atk' || statName === 'spe');
        buf += (italic ? '<i>' : '') + stats[statName] + (italic ? '</i>' : '');
      }
    }

    buf += '</p>';
    return buf;
  }

  function compare(a, b) {
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  }

  function filter(roles, clientPokemon) {
    var all = Object.entries(roles);
    if (!clientPokemon) return all;

    var possible = [];
    outer: for (var role of all) {
      if (clientPokemon.terastallized && !role[1].teraTypes[clientPokemon.terastallized]) continue;
      for (var moveslot of clientPokemon.moveTrack) {
        if (!role[1].moves[moveslot[0]] &&
            (moveslot[0] !== 'Hidden Power' || !hasHiddenPower(role[1].moves))) {
          continue outer;
        }
      }
      possible.push(role);
    }
    return possible;
  }

  function hasHiddenPower(moves) {
    for (var move in moves) {
      if (move.startsWith('Hidden Power')) return true;
    }
    return false;
  }

  function display(stats, multi) {
    var buf = [];
    for (var key in stats) {
      if (stats[key] === 0 || (multi && key === 'Ally Switch')) continue;
      buf.push(key + (stats[key] >= 1
        ? '' : ' <small>(' + Math.round(stats[key] * 100) + '%)</small>'));
    }
    return buf.join(', ');
  }

  function tr(num) {
    return num >>> 0
  }

  function calcStat(gen, stat, base, iv, ev, level, letsgo) {
    if (gen < 3) iv = Math.floor(iv / 2) * 2;
    if (stat === 'hp') {
      var val = base === 1 ? base : tr(tr(2 * base + iv + tr(ev / 4) + 100) * level / 100 + 10);
      return letsgo ? val + 20 : val;
    } else {
      var val = tr(tr(2 * base + iv + tr(ev / 4)) * level / 100 + 5);
      return letsgo ? tr(val * 102 / 100) + 20 : val;
    }
  };
};
if (TOOLTIP&&TOOLTIPMOVE) {
  BattleTooltips.prototype.showMoveTooltip = function (clientMove, serverMove, clientPokemon, serverPokemon) {
    var original = TOOLTIPMOVE.apply(this, arguments);
    try {
      if(clientMove.basePower == 0 ||clientMove.basePower == null || clientMove.basePower > undefined){
        return original;
      }
      var farSide = this.battle.farSide;
      var mySide = this.battle.mySide;
      var enemy = farSide.active[0];
      var me = mySide.active[0];
      var format = toID(this.battle.tier);
      if (!format || !format.includes('random')) return original;


      var speciesEnemy = Dex.species.get(enemy.speciesForme);
      if (!speciesEnemy) return original;
      var speciesMe = Dex.species.get(me.speciesForme);
      if (!speciesMe) return original;

      var gen = Number(format.charAt(3));
      var letsgo = format.includes('letsgo');
      var gameType = this.battle.gameType;

      if (!['singles', 'doubles'].includes(gameType)) {
        format = 'gen' + gen + 'randomdoublesbattle';
      } else if (format.includes('monotype') || format.includes('unrated')) {
        format = 'gen' + gen + 'randombattle';
      }
      if (!DATA[format]) return original;


      // Enemy Stats
      var dataEnemy = DATA[format][speciesEnemy.name === 'Zoroark' ? 0 : enemy.level];
      if (!dataEnemy) return original;

      var cosmetic = speciesEnemy.cosmeticFormes && speciesEnemy.cosmeticFormes.includes(speciesEnemy.name);
      var idEnemy = toID((speciesEnemy.forme === 'Gmax' || cosmetic)
        ? speciesEnemy.baseSpecies : speciesEnemy.battleOnly || speciesEnemy.name);
      if (idEnemy.startsWith('pikachu')) idEnemy = idEnemy.endsWith('gmax') ? 'pikachugmax' : 'pikachu';
      var forme = cosmetic ? speciesEnemy.baseSpecies : enemy.speciesForme;
      if (forme.startsWith('Pikachu')) forme = forme.endsWith('Gmax') ? 'Pikachu-Gmax' : 'Pikachu';

      dataEnemy = dataEnemy[idEnemy];
      if (!dataEnemy) return original;





      // Me
      //var statsEnemy = getStats(gen, gameType, letsgo, speciesEnemy, dataEnemy[0], null , this.getPokemonTypes(enemy),enemy);

      var dataMe = DATA[format][speciesMe.name === 'Zoroark' ? 0 : me.level];
      if (!dataMe) return original;

      var cosmetic = speciesMe.cosmeticFormes && speciesMe.cosmeticFormes.includes(speciesMe.name);
      var idMe = toID((speciesMe.forme === 'Gmax' || cosmetic)
        ? speciesMe.baseSpecies : speciesMe.battleOnly || speciesMe.name);
      if (idMe.startsWith('pikachu')) idMe = idMe.endsWith('gmax') ? 'pikachugmax' : 'pikachu';
      var forme = cosmetic ? speciesMe.baseSpecies : me.speciesForme;
      if (forme.startsWith('Pikachu')) forme = forme.endsWith('Gmax') ? 'Pikachu-Gmax' : 'Pikachu';
      dataMe = dataMe[idMe];
      if (!dataMe) return original;
      var buf = original;


      console.debug("~~~");
      console.debug(speciesMe);
      console.debug(dataMe);
      console.debug(clientPokemon);
      console.debug(serverPokemon);
      console.debug(dataEnemy);

      console.debug(clientMove);
      console.debug(speciesMe.name);
      console.debug("~~~")


      const calcGen = calc.Generations.get(gen);

      function getStats(stats, data, pokemonBoosts) {
        var evs = {};
        var ivs = {};
        var boosts = {};
        //todo
        if(Object.keys(pokemonBoosts).length != 0){
          for (var stat in stats) {
            ivs[stat] = 'ivs' in data && stat in data.ivs ? data.ivs[stat] : (gen < 3 ? 30 : 31);
            evs[stat] = 'evs' in data && stat in data.evs ? data.evs[stat] : (gen < 3 ? 255 : letsgo ? 0 : 85);
            if (pokemonBoosts[stat]) boosts[stat] = pokemonBoosts[stat];
          }
        } else {
          for (var stat in stats) {
            ivs[stat] = 'ivs' in data && stat in data.ivs ? data.ivs[stat] : (gen < 3 ? 30 : 31);
            evs[stat] = 'evs' in data && stat in data.evs ? data.evs[stat] : (gen < 3 ? 255 : letsgo ? 0 : 85);
          }
        }
        return {evs,ivs,boosts}
      }

      const statsMe = getStats(speciesMe.baseStats, dataMe[0], clientPokemon.boosts);
      const statsEnemy = getStats(speciesEnemy.baseStats, dataEnemy[0], enemy.boosts);

      const result = calc.calculate(
        calcGen,
        new calc.Pokemon(calcGen, speciesMe.name, {
          item: BattleItems[serverPokemon.item].name,
          ability: BattleAbilities[serverPokemon.baseAbility].name,
          level: dataMe[0].level,
          evs: statsMe["evs"],
          ivs: statsMe["ivs"],
          boosts: statsMe["boosts"]
        }),
        new calc.Pokemon(calcGen, speciesEnemy.name, {
          item: "mail",
          level: dataEnemy[0].level,
          evs: statsEnemy["evs"],
          ivs: statsEnemy["ivs"],
          boosts: statsEnemy["boosts"]
        }),
        new calc.Move(calcGen, clientMove.name),
        new calc.Field({
          attackerSide: {
            isLightScreen: (mySide.sideConditions.auroraveil || mySide.sideConditions.lightscreen) ? true : false,
            isReflect: (mySide.sideConditions.auroraveil || mySide.sideConditions.reflect) ? true : false
          },
          defenderSide: {
            isLightScreen: (farSide.sideConditions.auroraveil || farSide.sideConditions.lightscreen) ? true : false,
            isReflect: (farSide.sideConditions.auroraveil || farSide.sideConditions.reflect) ? true : false
          },
          weather: this.battle.weather,
          terrain: (this.battle.pseudoWeather.lenght!=0) ? this.battle.pseudoWeather[0] : ""
        })
      );

      const dmg = new Array(2);
      dmg[0] = Math.round(parseInt(result["damage"][0])/parseInt(result["defender"]["stats"]["hp"])*1000)/10;
      dmg[1] = Math.round(parseInt(result["damage"][result["damage"].length-1])/parseInt(result["defender"]["stats"]["hp"])*1000)/10;
      console.debug(result);
      /*
      TODO: dynamax and tera
      var bp = clientMove.basePower;
      if(serverMove === 'maxmove'){
        clientMove.basePower = clientMove.maxMove.basePower;
        buf += getItemModi(statsMe,statsEnemy,dataEnemy, dataMe, serverPokemon, me, enemy, this.getPokemonTypes(me), this.getPokemonTypes(enemy),clientMove,this.battle, true)
        clientMove.basePower = bp;
      }
      else{
        buf += getItemModi(statsMe,statsEnemy,dataEnemy, dataMe, serverPokemon, me, enemy, this.getPokemonTypes(me), this.getPokemonTypes(enemy),clientMove,this.battle, false)
      }
      */
      buf += '<div style="border-top: 1px solid #888; background: #dedede">';
      buf += '<p><small>Damage:</small> ' + dmg[0] + '% - ' + dmg[1] + '% </p>';

      return buf;
    } catch(e) {
      console.debug(e);
      return original;
    };
  };
};
