import React, { PropTypes } from 'react';
import d3 from 'd3';
import { presimplify } from 'topojson';
import { bindAll, keyBy, filter, has } from 'lodash';
import {
  calcCenterPoint,
  calcScale,
  calcTranslate,
  concatAndComputeGeoJSONBounds,
  extractGeoJSON,
  quickMerge,
} from '../../../utils';

import style from './choropleth.css';
import FeatureLayer from './feature-layer';
import Path from './path';
import Controls from './controls';

export default class Choropleth extends React.Component {
  /**
   * Because <Layer /> expects data to be an object with locationIds as keys
   * Need to process data as such
   * @param {Array} data -> array of datum objects
   * @param {String} keyField -> name of key field
   * @return {Object} keys are keyField (e.g., locationId), values are datum objects
   */
  static processData(data, keyField) {
    return { processedData: keyBy(data, keyField) };
  }

  constructor(props) {
    super(props);

    const extractedGeoJSON = extractGeoJSON(presimplify(props.topology), props.layers);
    const bounds = concatAndComputeGeoJSONBounds(extractedGeoJSON);

    const scale = calcScale(props.width, props.height, bounds);

    const translate = calcTranslate(props.width, props.height, scale, bounds, null);

    this.state = {
      bounds,
      scale,
      scaleBase: scale,
      scaleFactor: 1,
      translate,
      pathGenerator: this.createPathGenerator(scale, translate),
      cache: { ...extractedGeoJSON, },
      ...Choropleth.processData(props.data, props.keyField)
    };

    this.zoom = d3.behavior.zoom();

    bindAll(this, ['saveSvgRef', 'zoomEvent', 'zoomTo', 'zoomReset']);
  }

  componentDidMount() {
    this._svg.call(
      this.zoom
        .scale(this.state.scale)
        .translate(this.state.translate)
        .on('zoom', this.zoomEvent));
  }

  componentWillReceiveProps(nextProps) {
    // build up new state
    const state = {};

    // if topology or layers change, calc new bounds, and if bounds change, calc new scale
    if (nextProps.topology !== this.props.topology || nextProps.layers !== this.props.layers) {
      const cache = nextProps.topology === this.props.topology ? { ...this.state.cache } : {};

      const uncachedLayers = filter(nextProps.layers, (layer) => {
        return !has(cache[layer.type], layer.name);
      });

      if (uncachedLayers.length) {
        state.cache = {
          ...quickMerge({}, cache, extractGeoJSON(nextProps.topology, uncachedLayers))
        };

        const bounds = concatAndComputeGeoJSONBounds(state.cache);
        if (bounds !== this.state.bounds) {
          state.bounds = bounds;

          const scale = calcScale(nextProps.width, nextProps.height, bounds);
          if (scale !== this.state.scale) {
            state.scale = scale;
          }
        }
      }
    }

    // if the component has been resized, set a new base scale and translate
    if ((nextProps.width !== this.props.width) || (nextProps.height !== this.props.height)) {
      const bounds = state.bounds || this.state.bounds;

      const scale = calcScale(nextProps.width, nextProps.height, bounds);
      const nextScale = scale * this.state.scaleFactor;

      const center = calcCenterPoint(this.props.width, this.props.height,
                                     this.zoom.scale(), this.zoom.translate());
      const translate = calcTranslate(nextProps.width, nextProps.height, nextScale, null, center);

      // to prevent unnecessary extra render, set this.state.scaleBase from here
      this.state.scaleBase = scale;
      state.scale = nextScale;
      state.translate = translate;
    }

    // if the data has changed, transform it to be consumable by <Layer />
    if (nextProps.data !== this.props.data) {
      Object.assign(state, ...Choropleth.processData(nextProps.data, nextProps.keyField));
    }

    // if new state has any own and enumerable properties, update internal state
    if (Object.keys(state).length) {
      this.setState(state);

      this.zoom.scale(state.scale || this.state.scale);
      this.zoom.translate(state.translate || this.state.translate);
      this.zoom.event(this._svg);
    }
  }

  /**
   * @param scale
   * @param translate
   * @returns {Function}
   */
  createPathGenerator(scale, translate) {
    const transform = d3.geo.transform({
      point(x, y, z) {
        // mike bostock math
        const area = 1 / scale / scale;
        const pointX = x * scale + translate[0];
        const pointY = y * scale + translate[1];

        if (z >= area) {
          this.stream.point(pointX, pointY);
        }
      }
    });

    return d3.geo.path().projection(transform);
  }

  zoomEvent() {
    const scale = this.zoom.scale();

    const translate = this.zoom.translate();

    const pathGenerator = this.createPathGenerator(scale, translate);

    this.setState({
      scale,
      scaleFactor: scale / this.state.scaleBase,
      translate,
      pathGenerator,
    });
  }

  zoomTo(scale) {
    return () => {
      const center = calcCenterPoint(this.props.width, this.props.height,
                                     this.zoom.scale(), this.zoom.translate());
      this.zoom.scale(scale);
      this.zoom.translate(calcTranslate(this.props.width, this.props.height,
                                        this.zoom.scale(), null, center));
      this.zoom.event(this._svg);
    };
  }

  zoomReset() {
    this.zoom.scale(this.state.scaleBase);
    this.zoom.translate(calcTranslate(this.props.width, this.props.height,
                                      this.state.scaleBase, this.state.bounds, null));
    this.zoom.event(this._svg);
  }

  saveSvgRef(ref) {
    this._svg = ref && d3.select(ref);
  }

  renderLayers() {
    return this.props.layers.map((layer) => {
      if (!layer.visible) return null;

      const key = `${layer.type}-${layer.name}`;

      switch (layer.type) {
        case 'feature':
          return (
            <FeatureLayer
              key={key}
              features={this.state.cache.feature[layer.name].features}
              data={this.state.processedData}
              keyField={this.props.geoJSONKeyField}
              valueField={this.props.valueField}
              pathGenerator={this.state.pathGenerator}
              colorScale={this.props.colorScale}
              selectedLocations={this.props.selectedLocations}
              onClick={this.props.onClick}
              onMouseOver={this.props.onMouseOver}
              onMouseMove={this.props.onMouseMove}
              onMouseDown={this.props.onMouseDown}
              onMouseOut={this.props.onMouseOut}
              pathClassName={layer.className}
              pathSelectedClassName={layer.selectedClassName}
              pathStyle={layer.style}
              pathSelectedStyle={layer.selectedStyle}
            />
          );
        case 'mesh':
          return (
            <Path
              key={key}
              fill="none"
              feature={this.state.cache.mesh[layer.name]}
              pathGenerator={this.state.pathGenerator}
              className={layer.className}
              style={layer.style}
            />
          );
        default:
          return null;
      }
    });
  }

  render() {
    const { width, height } = this.props;

    return (
      <div style={{ width: `${width}px`, height: `${height}px` }} className={style.common}>
        {this.props.controls && <Controls
          onZoomIn={this.zoomTo(this.zoom.scale() * this.props.zoomStep)}
          onZoomOut={this.zoomTo(this.zoom.scale() / this.props.zoomStep)}
          onZoomReset={this.zoomReset}
        />}
        <svg
          ref={this.saveSvgRef}
          width={`${width}px`}
          height={`${height}px`}
          overflow="hidden"
          style={{ pointerEvents: 'all' }}
        >
          {this.renderLayers()}
        </svg>
      </div>
    );
  }
}

Choropleth.propTypes = {
  /* layers to display */
  layers: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,

    // name corresponding to key within topojson objects collection
    object: PropTypes.string.isRequired,

    // whether the layer should be a feature collection or mesh grid
    type: PropTypes.oneOf(['feature', 'mesh']).isRequired,

    // optional function to filter mesh grid, passed adjacent geometries
    // refer to https://github.com/mbostock/topojson/wiki/API-Reference#mesh
    filterFn: PropTypes.func
  })).isRequired,

  /* full topojson */
  topology: PropTypes.shape({
    arcs: PropTypes.array,
    objects: PropTypes.object,
    transform: PropTypes.object,
    type: PropTypes.string
  }).isRequired,

  /* array of datum objects */
  data: PropTypes.arrayOf(PropTypes.object).isRequired,

  /* unique key of datum */
  keyField: PropTypes.string.isRequired,

  /* mapping of datum key field to geoJSON feature key. default: 'id' (from <Feature />) */
  geoJSONKeyField: PropTypes.string,

  /* key of datum that holds the value to display */
  valueField: PropTypes.string.isRequired,

  /* fn that accepts keyfield, and returns stroke color for line */
  colorScale: PropTypes.func.isRequired,

  /* array of datum[keyField], e.g., location ids */
  selectedLocations: PropTypes.arrayOf(PropTypes.number),

  /* width of containing element, in px */
  width: PropTypes.number,

  /* height of containing element, in px */
  height: PropTypes.number,

  /* passed to each path; signature: function(event, locationId) {...} */
  onClick: PropTypes.func,

  /* passed to each path; signature: function(event, locationId) {...} */
  onMouseOver: PropTypes.func,

  /* passed to each path; signature: function(event, locationId) {...} */
  onMouseMove: PropTypes.func,

  /* passed to each path; signature: function(event, locationId) {...} */
  onMouseDown: PropTypes.func,

  /* passed to each path; signature: function(event, locationId) {...} */
  onMouseOut: PropTypes.func,

  /* show zoom controls */
  controls: PropTypes.bool,

  /* amount to zoom in/out from zoom controls. current zoom scale is multiplied by prop value.
   e.g. 1.1 is equal to 10% steps, 2.0 is equal to 100% steps */
  zoomStep: PropTypes.number,
};

Choropleth.defaultProps = {
  layers: [],
  selectedLocations: [],
  width: 600,
  height: 400,
  controls: false,
  zoomStep: 1.1,
};
