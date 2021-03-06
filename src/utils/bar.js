import { scaleLinear, scaleBand } from 'd3';
import keyBy from 'lodash/keyBy';
import isUndefined from 'lodash/isUndefined';
import values from 'lodash/values';

import { computeDataMax } from './data';
import { propResolver } from './objects';

/**
 * Determines the orientation of the bars relative to the default orientation
 * of vertical bars.
 * @param orientation : A string that represents the orientation of the chart
 * @returns {boolean} : Returns whether the given argument is vertical
 */
export function isVertical(orientation) {
  return (orientation.toLowerCase() === 'vertical');
}

export function isInSelection(datum, selection) {
  return selection && (
    Array.isArray(selection)
      ? selection.includes(datum)
      : selection === datum
  );
}

export function computeStackMax(data, stackAccessor, valueAccessor) {
  // Iterate through the data, creating an object mapping stack name to the max value for the stack.
  const maxPerStack = data.reduce((acc, datum) => {
    const stack = propResolver(datum, stackAccessor);
    const value = propResolver(datum, valueAccessor);
    // If the key exists on the accumulator, add the current value to its value.
    // Otherwise add the key, initializing its value with the current value.
    /* eslint-disable no-param-reassign */
    if (stack in acc) {
      acc[stack] += value;
    } else {
      acc[stack] = value;
    }
    /* eslint-enable no-param-reassign */
    return acc;
  }, {});

  // Return the max of the biggest stack.
  return values(maxPerStack).reduce((prevMax, currMax) => Math.max(prevMax, currMax), 0);
}

export function computeStackDatumKey(stack, layer) {
  return `${stack}:${layer}`;
}

/**
 * Computes the spatial offsets (start, end) for each bar in a stacked bar chart
 *
 * @param {datum[]} data - Array of datum objects, each of which must contain fields denoting the
 *   stack, layer, and value.
 * @param {string[]|number[]} stacks - names of the categories represented by each stack
 * @param {string[]|number[]} layers - names of the categories represented by each layer
 * @param {string|number} stackField - property name of each datum object denoting the stack
 * @param {string|number} layerField - property name on each datum object denoting the layer
 * @param {number} valueField - property name on each datum object denoting the value
 *
 * @returns {object} - a mapping of keys in the form `${stack}:${layer}` to each bar's spatial offset
 */
export function computeStackOffsets(
  data,
  stacks,
  layers,
  stackField,
  layerField,
  valueField,
) {
  // We create an object mapping keys `${stack}:${layer}` to each datum object.
  // That allows us quick lookups to retrieve the value of each bar.
  const dataByStackAndLayer = keyBy(
    data,
    datum => computeStackDatumKey(datum[stackField], datum[layerField]),
  );

  // Now we create an object mapping keys `${stack}:${layer}`, the same as in `dataByStackAndLayer`,
  // to the spatial offsets [start, end] for each bar. It's important that we traverse each stack in
  // the same order, so that the ordering of layers is consistent.
  const offsetsByStackAndLayer = Object.create(null);

  // traverse the stacks
  for (const stack of stacks) {
    // In each stack, we keep track of where the previous layer ended.
    // This will be the start of the next layer.
    let prevEnd = 0;

    // traverse the layers in a stack
    for (const layer of layers) {
      const key = computeStackDatumKey(stack, layer);
      const datum = dataByStackAndLayer[key];
      const value = datum[valueField];
      const start = prevEnd;

      // store the starting offset for the current bar
      offsetsByStackAndLayer[key] = start;

      // store the ending offset for use in the next iteration
      prevEnd = start + value;
    }
  }

  return offsetsByStackAndLayer;
}

export function computeDomainScale(categories, orientation, spaceAvailable) {
  return scaleBand()
    .domain(categories)
    .range(isVertical(orientation) ? [0, spaceAvailable] : [spaceAvailable, 0]);
}

/**
 * Adjusts the domain scaling function with alignment and band padding
 *
 * @param scale : a function that computes the bar's position on the domain axis
 * @param align : Represents the alignment properties for the ordinal scale bandwidth
 * @param innerPadding : Represents the inner band padding property for the ordinal scale bandwidth
 * @param outerPadding : Represents the outter band padding property for the ordinal scale bandwidth
 * @returns {function} : Returns a function that represents the ordinal scale for chart
 */
export function adjustDomainScale(scale, align, innerPadding, outerPadding) {
  scale.paddingInner(innerPadding);
  scale.paddingOuter(outerPadding);
  scale.align(align);
  return scale;
}

export function getDomainScale({
  align,
  bandPadding,
  innerPadding,
  outerPadding,
  categories,
  orientation,
  scales,
  height,
  width,
}) {
  const vertical = isVertical(orientation);

  const scale = scales && (vertical ? scales.x : scales.y);
  const domainScale = scale
    // If a scaling function was passed via the `scales` prop, we make a copy of it (to avoid mutating the original).
    ? scale.copy()
    // Otherwise we compute the scaling function.
    : computeDomainScale(categories, orientation, vertical ? width : height);

  // Adjust the domain scale based on alignment and padding.
  return adjustDomainScale(
    domainScale,
    align,
    !isUndefined(innerPadding) ? innerPadding : bandPadding,
    !isUndefined(outerPadding) ? outerPadding : bandPadding,
  );
}

export function computeRangeScale(max, orientation, spaceAvailable) {
  return scaleLinear()
    .domain([0, max])
    .range(isVertical(orientation) ? [spaceAvailable, 0] : [0, spaceAvailable]);
}

export function getRangeScale({
  data,
  dataAccessors,
  orientation,
  rangeMax,
  scales,
  height,
  width,
  stacked = false,
}) {
  const vertical = isVertical(orientation);

  const scale = scales && (vertical ? scales.y : scales.x);
  if (scale) {
    return scale.copy();
  }

  /* eslint-disable no-nested-ternary */
  const max = !isUndefined(rangeMax)
    ? rangeMax
    : (
      stacked
        ? computeStackMax(data, dataAccessors.category, dataAccessors.value)
        : computeDataMax(data, dataAccessors.value)
    );
  /* eslint-enable no-nested-ternary */

  return computeRangeScale(max, orientation, vertical ? height : width);
}
