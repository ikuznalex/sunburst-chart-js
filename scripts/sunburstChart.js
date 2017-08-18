/**
 * Sunburst chart control implementation.
 * Uses svg to render the chart.
 *
 * Code styling using for this control:
 * https://github.com/airbnb/javascript/tree/es5-deprecated/es5
 */

!function (global) {
	'use strict';

	var previousSunburstChart = global.SunburstChart;

	function SunburstChart(data, options) {
		this.options = options || {};
		this.data = data;
		//By default scaling will be 1.
		//If the user wanted to make the width of the arcs smaller form center to edges then it can be 1.62 ("golden ratio").
		this.options.scale = this.options.scale || 1;

		this.startingCoordinates = {
			x: 0,
			y: 0
		};

		this.onMouseMove = segmentMove;
		this.onClick = segmentClick.bind(this);
	}

	function segmentMove(event) {

	}

	function segmentClick(event) {
		var point = cartesianToPolar({
			x: event.clientX,
			y: event.clientY
		}, this.startingCoordinates);
		var node = this.getNodeByPolarCoords(point, this.metaData.root, this.metaData);
		if (node && node.data !== this.data) {
			if (node.data !== this.rootNode.data) {
				this.render(node);
			} else {
				this.pickColor(true); //colors will be picked from the beginning
				this.render({data: this.data});
			}
		}
	}

	/**
	 * render() calculates metadata and renders all parts of the chart.
	 *
	 *  @param {Object} rootNode
	 */
	SunburstChart.prototype.render = function render(rootNode) {
		this.rootNode = rootNode || this.rootNode || {data: this.data};

		this.calculateStartingCoordinates();

		var deep = this.maxDeep(this.rootNode.data);

		this.calcMetadata(deep);
		this.clearSvg();
		//Creates svg element itself
		this.createSvgElement();
		this.bindEvents();
		// Draws chart based on metadata
		this.drawSegment(this.metaData.root);
	};

	/**
	 * drawSegment() draws segment of the chart based on metadata and options.
	 *
	 * @param {Object} nodeMeta
	 * @param {Object} options
	 */
	SunburstChart.prototype.drawSegment = function drawSegment(nodeMeta, options) {
		var self = this;

		options = options || {};

		drawPath(nodeMeta);

		if (options.children || options.children === undefined) {
			for (var i = 0, l = (nodeMeta.children || []).length; i < l; i++) {
				this.drawSegment(nodeMeta.children[i], options);
			}
		}

		function drawPath(nodeMeta) {
			var arcDescription = describeArc(nodeMeta, self.startingCoordinates);

			self.svg.appendChild(self.createPathElement(arcDescription, nodeMeta.color));
		}

		function describeArc(nodeMeta, startingCoordinates) {
			var endAngleOriginal = nodeMeta.angles.end;
			var stringDescription;
			var startBigArc;
			var endBigArc;
			var startSmallArc;
			var endSmallArc;
			var arcSweep;

			if (endAngleOriginal - nodeMeta.angles.start === 360) {
				nodeMeta.angles.end = 359;
			}

			startBigArc = polarToCartesian(startingCoordinates.x, startingCoordinates.y, nodeMeta.offset + nodeMeta.width, nodeMeta.angles.end);
			endBigArc = polarToCartesian(startingCoordinates.x, startingCoordinates.y, nodeMeta.offset + nodeMeta.width, nodeMeta.angles.start);

			if (endAngleOriginal - nodeMeta.angles.start !== 360) {
				startSmallArc = polarToCartesian(startingCoordinates.x, startingCoordinates.y, nodeMeta.offset, nodeMeta.angles.end);
				endSmallArc = polarToCartesian(startingCoordinates.x, startingCoordinates.y, nodeMeta.offset, nodeMeta.angles.start);
			}

			arcSweep = nodeMeta.angles.end - nodeMeta.angles.start <= 180 ? "0" : "1";

			if (endAngleOriginal - nodeMeta.angles.start === 360) {
				stringDescription = [
					"M", startBigArc.x, startBigArc.y,
					"A", nodeMeta.offset + nodeMeta.width, nodeMeta.offset + nodeMeta.width, 0, arcSweep, 0, endBigArc.x, endBigArc.y, "z"
				].join(" ");
			}
			else {
				stringDescription = [
					"M", startBigArc.x, startBigArc.y,
					"A", nodeMeta.offset + nodeMeta.width, nodeMeta.offset + nodeMeta.width, 0, arcSweep, 0, endBigArc.x, endBigArc.y,
					"L", endSmallArc.x, endSmallArc.y,
					"A", nodeMeta.offset, nodeMeta.offset, 0, arcSweep, 1, startSmallArc.x, startSmallArc.y,
					"Z"
				].join(" ");
			}

			return stringDescription;
		}
	};

	/**
	 * calcMetadata() calculates chart metadata.
	 *
	 * @param {Number} deep
	 */
	SunburstChart.prototype.calcMetadata = function (deep) {
		var initialWidth = this.rootNodeWidth(deep);
		var rootData = this.rootNode.data;
		var metaRoot = {
			root: {
				data: rootData,
				color: this.rootNode.color || this.pickColor(),
				angles: {
					start: 0,
					end: 360,
					abs: 360
				},
				width: initialWidth,
				offset: 0,
				children: []
			}
		};
		var self = this;
		var sibling;

		var children = this.rootNode.children || rootData.children || [];
		for (var i = 0, l = children.length; i < l; i++) {
			var childrenData = children[i].data || children[i];
			if (childrenData.value > rootData.value) {
				console.error("Child value greater then the parent node value.", children[i], this.rootNode);
				continue;
			}

			sibling = calcChildMetaData(children[i], metaRoot.root, sibling, this.options.scale);
			metaRoot.root.children.push(sibling);
		}

		this.metaData = metaRoot;

		function calcChildMetaData(childMeta, parentMeta, sibling, scale) {
			var childData = childMeta.data || childMeta;
			var meta = {
				data: childData,
				color: childMeta.color || self.pickColor(),
				parent: parentMeta,
				width: parentMeta.width / scale,
				offset: parentMeta.offset + parentMeta.width,
				children: []
			};
			var childSibling;

			meta.angles = {abs: parentMeta.angles.abs * childData.value / parentMeta.data.value};
			meta.angles.start = sibling ? sibling.angles.end : parentMeta.angles.start;
			meta.angles.end = meta.angles.start + meta.angles.abs;

			//Calculating children metadata for the node.
			for (var i = 0, l = (childMeta.children || []).length; i < l; i++) {
				childSibling = calcChildMetaData(childMeta.children[i], meta, childSibling, scale);
				meta.children.push(childSibling);
			}

			return meta;
		}
	};

	/**
	 * pickColor() returns color from array.
	 *
	 * @return {String} string which represents the color.
	 */
	SunburstChart.prototype.pickColor = (function () {
		var colors = ["#468966", "#FFF0A5", "#FFB03B", "#B64926", "#8E2800"];
		var i = 0;

		return function (restart) {
			if (restart) {
				i = 0;
				return;
			}
			return colors[i++ % colors.length];
		}
	})();

	/**
	 * calculateStartingCoordinates() calculates starting coordinate for drawing.
	 */
	SunburstChart.prototype.calculateStartingCoordinates = function calculateStartingCoordinates() {
		if (this.startingCoordinates.x !== 0 && this.startingCoordinates.y !== 0) {
			return;
		}

		var radius = Math.min(this.options.width, this.options.height) / 2;

		this.startingCoordinates.x = this.startingCoordinates.x + radius;
		this.startingCoordinates.y = this.startingCoordinates.y + radius;
	};

	/**
	 * createSvgElement() creates svg element for the chart.
	 */
	SunburstChart.prototype.createSvgElement = function createSvgElement() {
		var svg = global.document.createElementNS("http://www.w3.org/2000/svg", "svg");

		svg.setAttributeNS(null, 'style', "width: " + this.options.width + "px; height: " + this.options.height + "px");
		global.document.getElementById(this.options.div).appendChild(svg);

		this.svg = svg;
	};

	SunburstChart.prototype.bindEvents = function bindEvents() {
		if (!this.svg) {
			return;
		}
		this.svg.addEventListener('mousemove', this.onMouseMove, false);
		this.svg.addEventListener('click', this.onClick, false);
	};

	/**
	 * clearSvg() remove all elements inside svg.
	 */
	SunburstChart.prototype.clearSvg = function clearSvg() {
		var svg = global.document.getElementById(this.options.div);

		while (svg.lastChild) {
			svg.removeChild(svg.lastChild);
		}
	};

	/**
	 * createPathElement() creates and returns path element for the chart.
	 *
	 * @param {String} pathDescription description
	 * @return {Object} path element
	 */
	SunburstChart.prototype.createPathElement = function createPathElement(pathDescription, color) {
		var path = global.document.createElementNS("http://www.w3.org/2000/svg", "path");

		path.setAttributeNS(null, 'fill', color);
		path.setAttributeNS(null, 'd', pathDescription);

		return path;
	};

	/**
	 * maxDeep() returns the maximum deep level of the data
	 * based on the passed json data structure.
	 *
	 * @param {Object} data
	 * @return {Number} maximum deep
	 */
	SunburstChart.prototype.maxDeep = function maxDeep(data) {
		var deeps = [];

		for (var i = 0, l = (data.children || []).length; i < l; i++) {
			deeps.push(maxDeep(data.children[i]));
		}

		return 1 + Math.max.apply(Math, deeps.length ? deeps : [0]);
	};

	/**
	 * rootNodeWidth() returns the root node width.
	 *
	 * @param {Number} deep maximum
	 * @return {Number} root node width
	 */
	SunburstChart.prototype.rootNodeWidth = function rootNodeWidth(deep) {
		var chartSize = Math.min(this.options.width, this.options.height);
		//x is the root node width
		var x = 1;

		for (var i = 1; i < deep; i++) {
			x += 1 / Math.pow(this.options.scale, i);
		}

		//Need to double check whether the algorithm works correctly.
		return chartSize / 2 / x;
	};

	SunburstChart.prototype.getNodeByPolarCoords = function getNodeByPolarCoords(point, origin, metaData) {
		function _findNode(point, nodeMeta) {
			if (nodeMeta.offset >= point.dist) {
				return null;
			}

			if (nodeMeta.offset < point.dist && point.dist <= nodeMeta.offset + nodeMeta.width) {
				if (nodeMeta.angles.start < point.angle && point.angle <= nodeMeta.angles.end) {
					return nodeMeta;
				}
			} else {
				var node;
				for (var i = 0, l = (nodeMeta.children || []).length; i < l; i++) {
					if (node = _findNode(point, nodeMeta.children[i])) {
						return node;
					}
				}
			}

			return null;
		}

		return _findNode(point, metaData.root);
	};

	//Converts polar coordinates to Cartesian.
	function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
		var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

		return {
			x: centerX + (radius * Math.cos(angleInRadians)),
			y: centerY + (radius * Math.sin(angleInRadians))
		};
	}

	function cartesianToPolar(point, origin) {
		var difX = point.x - origin.x,
			difY = point.y - origin.y,
			distance = Math.sqrt(difX * difX + difY * difY),
			angle = Math.acos(difX / distance);

		if (difY < 0) {
			angle = 2 * Math.PI - angle;
		}
		// radians to degrees
		angle = ((angle + Math.PI / 2) * 180 / Math.PI) % 360;

		return {dist: distance, angle: angle};
	}

	SunburstChart.noConflict = function noConflict() {
		global.SunburstChart = previousSunburstChart;
		return SunburstChart;
	};

	global.SunburstChart = SunburstChart;
}(this);