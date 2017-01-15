var populateComponents = require('./populate-components');
var compactOverrides = require('./override-compactor');
var compactShorthands = require('./shorthand-compactor');

var compactable = require('../compactable');
var restoreWithComponents = require('../restore-with-components');

var wrapForOptimizing = require('../../wrap-for-optimizing').all;
var removeUnused = require('../../remove-unused');
var restoreFromOptimizing = require('../../restore-from-optimizing');

var OptimizationLevel = require('../../../options/optimization-level').OptimizationLevel;

var serializeProperty = require('../../../writer/one-time').property;

var shorthands = {
  'border-color': ['border'],
  'border-style': ['border'],
  'border-width': ['border'],
  'border-bottom': ['border'],
  'border-bottom-color': ['border-bottom', 'border-color', 'border'],
  'border-bottom-style': ['border-bottom', 'border-style', 'border'],
  'border-bottom-width': ['border-bottom', 'border-width', 'border'],
  'border-left': ['border'],
  'border-left-color': ['border-left', 'border-color', 'border'],
  'border-left-style': ['border-left', 'border-style', 'border'],
  'border-left-width': ['border-left', 'border-width', 'border'],
  'border-right': ['border'],
  'border-right-color': ['border-right', 'border-color', 'border'],
  'border-right-style': ['border-right', 'border-style', 'border'],
  'border-right-width': ['border-right', 'border-width', 'border'],
  'border-top': ['border'],
  'border-top-color': ['border-top', 'border-color', 'border'],
  'border-top-style': ['border-top', 'border-style', 'border'],
  'border-top-width': ['border-top', 'border-width', 'border'],
};

function _optimize(properties, mergeAdjacent, aggressiveMerging, validator) {
  var overrideMapping = {};
  var lastName = null;
  var lastProperty;
  var j;

  function mergeablePosition(position) {
    if (mergeAdjacent === false || mergeAdjacent === true)
      return mergeAdjacent;

    return mergeAdjacent.indexOf(position) > -1;
  }

  function sameValue(position) {
    var left = properties[position - 1];
    var right = properties[position];

    return serializeProperty(left.all, left.position) == serializeProperty(right.all, right.position);
  }

  propertyLoop:
  for (var position = 0, total = properties.length; position < total; position++) {
    var property = properties[position];
    var _name = (property.name == '-ms-filter' || property.name == 'filter') ?
      (lastName == 'background' || lastName == 'background-image' ? lastName : property.name) :
      property.name;
    var isImportant = property.important;
    var isHack = property.hack;

    if (property.unused)
      continue;

    if (position > 0 && lastProperty && _name == lastName && isImportant == lastProperty.important && isHack == lastProperty.hack && sameValue(position) && !lastProperty.unused) {
      property.unused = true;
      continue;
    }

    // comment is necessary - we assume that if two properties are one after another
    // then it is intentional way of redefining property which may not be widely supported
    // e.g. a{display:inline-block;display:-moz-inline-box}
    // however if `mergeablePosition` yields true then the rule does not apply
    // (e.g merging two adjacent selectors: `a{display:block}a{display:block}`)
    if (_name in overrideMapping && (aggressiveMerging && _name != lastName || mergeablePosition(position))) {
      var toOverridePositions = overrideMapping[_name];
      var canOverride = compactable[_name] && compactable[_name].canOverride;
      var anyRemoved = false;

      for (j = toOverridePositions.length - 1; j >= 0; j--) {
        var toRemove = properties[toOverridePositions[j]];
        var longhandToShorthand = toRemove.name != _name;
        var wasImportant = toRemove.important;
        var wasHack = toRemove.hack;

        if (toRemove.unused)
          continue;

        if (longhandToShorthand && wasImportant)
          continue;

        if (!wasImportant && (wasHack && !isHack || !wasHack && isHack))
          continue;

        if (wasImportant && (isHack == 'star' || isHack == 'underscore'))
          continue;

        if (!wasHack && !isHack && !longhandToShorthand && canOverride && !canOverride(toRemove, property, validator))
          continue;

        if (wasImportant && !isImportant || wasImportant && isHack) {
          property.unused = true;
          lastProperty = property;
          continue propertyLoop;
        } else {
          anyRemoved = true;
          toRemove.unused = true;
        }
      }

      if (anyRemoved) {
        position = -1;
        lastProperty = null;
        lastName = null;
        overrideMapping = {};
        continue;
      }
    } else {
      overrideMapping[_name] = overrideMapping[_name] || [];
      overrideMapping[_name].push(position);

      // TODO: to be removed with
      // certain shorthand (see values of `shorthands`) should trigger removal of
      // longhand properties (see keys of `shorthands`)
      var _shorthands = shorthands[_name];
      if (_shorthands) {
        for (j = _shorthands.length - 1; j >= 0; j--) {
          var shorthand = _shorthands[j];
          overrideMapping[shorthand] = overrideMapping[shorthand] || [];
          overrideMapping[shorthand].push(position);
        }
      }
    }

    lastName = _name;
    lastProperty = property;
  }
}

function compactorOptimize(selector, properties, mergeAdjacent, withCompacting, context) {
  var validator = context.validator;
  var warnings = context.warnings;

  var _properties = wrapForOptimizing(properties, false);
  populateComponents(_properties, validator, warnings);
  _optimize(_properties, mergeAdjacent, context.options.aggressiveMerging, validator);

  for (var i = 0, l = _properties.length; i < l; i++) {
    var _property = _properties[i];
    if (_property.block) {
      compactorOptimize(selector, _property.value[0][1], mergeAdjacent, withCompacting, context);
    }
  }

  if (withCompacting && context.options.level[OptimizationLevel.Two].compactShorthands) {
    compactOverrides(_properties, context.options.compatibility, validator);
    compactShorthands(_properties, validator);
  }

  restoreFromOptimizing(_properties, restoreWithComponents);
  removeUnused(_properties);
}

module.exports = compactorOptimize;