
/**
 * Renderer handles rendering a map file to the canvas
 * @param {stage} gamestage EaselJS stage
 * @constructor
 */
function Renderer(gamestage) {
	this.activeObjectsContainer = new createjs.Container();
	this.backgroundContainer = new createjs.Container();
	this.complexObjects = [];
	this.container = new createjs.Container();
	this.container.x = 0;
	this.container.y = 0;
	this.doneRendering = false;
	this.fogOfWarContainer = new createjs.Container();
	this.fogOfWarGrid = [[],[]];
	this.foregroundContainer = new createjs.Container();
	this.gamestage = gamestage; // this is a link to the parent gamestage
	this.mapcounter = 0;
	this.mapData = undefined; // this will be our tiled JSON data
	this.imageData = undefined; // this will be the tileset graphic
	this.simpleObjects = [];
	this.tileset = new Image();

	// new tickaction code:
	this.moving = false;
	this.moveToX = 0;
	this.moveToY = 0;
	this.movingObject = {};
	this.movingToCellTarget = {};
	this.movingToCellStart = {};
	this.movementGraph = {};
	this.movementSearchResult = [];
	this.centered = true;

	var fogOfWarSpriteSheet = new createjs.SpriteSheet({
		"images": [loader.getResult("fogofwar")],
		"frames": {
			"width": 16,
			"height": 16,
			"count": 0
		},
		"animations": {
			"still": {
				"frames": [0],
				"next": "still",
				"speed": 2
			}
		}
	});


	/**
	 * Run at the end of our map rendering process. Adds various containers to the gamestage and
	 * declares doneRendering to be true, which lets the rest of the program continue.
	 * @private
	 */
	function completeRenderer() {
		this.gamestage.removeAllChildren(); // clear the gamestage since we are ready to render.
		this.doneRendering = true;
		this.gamestage.addChild(this.backgroundContainer);
		this.gamestage.addChild(this.container);
		this.gamestage.addChild(this.foregroundContainer);
		this.gamestage.addChild(this.activeObjectsContainer);
		this.gamestage.addChild(this.fogOfWarContainer);
		this.beginCaching(this.backgroundContainer);
		this.beginCaching(this.container);
		this.beginCaching(this.foregroundContainer);
		if (LOG_FPS) {
			renderer.activeObjectsContainer.addChild(fpsLabel);
		}

		// this is kind of a hack. what it does is it waits approx 2 frames before caching fogofwar container
		// this forces the fog of war to be removed from around the player's initial location
		setTimeout(function() {
			this.beginCaching(this.fogOfWarContainer);
		}.bind(this), 120);
	};

	/**
	 * Parses the mapData tilesets and Initialize all of the layers in the map
	 * @private
	 */
	function initLayers() {
		console.log('initing layers');
		var w = this.mapData.tilesets[0].tilewidth;
		var h = this.mapData.tilesets[0].tileheight;
		this.simpleobjects = [];
		this.complexObjects = [];

		var imageData = {
			images : [ this.imageData ],
			frames : {
				width : w,
				height : h
			}
		};

		this.container = new createjs.Container();

		// create spritesheet
		var tilesetSheet = new createjs.SpriteSheet(imageData);

		// loading each layer one at a time
		for (var i = 0; i < this.mapData.layers.length; i++) {
			var layer = this.mapData.layers[i];
			if (layer.type === 'tilelayer') { // one of these for each tile layer we add in tiled
				if (i === 0) { // background 2
					this.backgroundContainer.addChild(initDrawableLayer.call(this, layer, tilesetSheet, this.mapData.tilewidth, this.mapData.tileheight));
				} else if (i === 1) { // background 1
					this.backgroundContainer.addChild(initDrawableLayer.call(this, layer, tilesetSheet, this.mapData.tilewidth, this.mapData.tileheight));
				} else if (i === 2) { // simpleobjects
					this.activeObjectsContainer.addChild(initSimpleObjects.call(this, layer, tilesetSheet, this.mapData.tilewidth, this.mapData.tileheight));
				} else if (i === 3) { // collision
					this.container.addChild(initDrawableLayerWithCollisionArray.call(this, layer, tilesetSheet, this.mapData.tilewidth, this.mapData.tileheight));
				} else if (i === 4) { // foreground
					this.foregroundContainer.addChild(initDrawableLayer.call(this, layer, tilesetSheet, this.mapData.tilewidth, this.mapData.tileheight));
				}
			}

			if (layer.type === 'objectgroup') { // this is the list of tiled objects, if any
				for (var j = 0; j < layer.objects.length; j++) {
					// this is where we will handle cases for object files
					if (layer.objects[j].type === "StartPoint") {
						new StartPoint(layer.objects[j].x, layer.objects[j].y, parseInt(layer.objects[j].properties.startpoint_id));
					} else if (layer.objects[j].type === "MapLink") {
						new MapLink(layer.objects[j].x, layer.objects[j].y, layer.objects[j].properties.graphic, layer.objects[j].properties.link, parseInt(layer.objects[j].properties.startpoint));
					} else if (layer.objects[j].type === "DisableFogOfWar") {
						new DisableFogOfWar();
					}
				}
			}

		}
		initFogOfWar.call(this, this.mapData.layers[0], this.mapData.tilewidth, this.mapData.tileheight);
	}

	/**
	 * Initialization method for simple objects
	 * @private
	 * @param  {Array} layerData Tiled JSON data
	 * @param  {Image} tilesetSheet
	 * @param  {number} tilewidth
	 * @param  {number} tileheight
	 * @return {Container}
	 */
	function initSimpleObjects(layerData, tilesetSheet, tilewidth, tileheight) {
		console.log('initing simple objects');
		var container = new createjs.Container();

		for (var y = 0; y < layerData.height; y++) {
			for (var x = 0; x < layerData.width; x++) {
				// layer data has single dimension array
				var idx = x + y * layerData.width;

				if (layerData.data[idx] !== 0) {
					// each different simple object will have an idx entry here
					if (layerData.data[idx] === 1) { // This is the chest (end game goal)
						console.log('pushing endgame');
						activeObjects.push(new EndGame(x * tilewidth, y * tileheight));
					} else if (layerData.data[idx] === 2) {
						console.log('pushing robot!');
						activeObjects.push(new Robot(x * tilewidth, y * tileheight, 1));
					} else if (layerData.data[idx] === 3) {
						console.log('pushing dragon!');
						activeObjects.push(new Dragon(x * tilewidth, y * tileheight, 1));
					}
				}
			}
		}

		return container;
	}

	/**
	 * Draws a single visible layer to a container
	 * @private
	 * @param  {Array} layerData Tiled JSON data
	 * @param  {Image} tilesetSheet
	 * @param  {number} tilewidth
	 * @param  {number} tileheight
	 * @return {Container}
	 */
	function initDrawableLayer(layerData, tilesetSheet, tilewidth, tileheight) {
		var container = new createjs.Container();

		for (var y = 0; y < layerData.height; y++) {
			for (var x = 0; x < layerData.width; x++) {
				// create a new Bitmap for each cell

				// layer data has single dimension array
				var idx = x + y * layerData.width;
				if (layerData.data[idx] !== 0) {
					var cellBitmap = new createjs.Sprite(tilesetSheet);
					// tilemap data uses 1 as first value, EaselJS uses 0 (sub 1 to load correct tile)
					cellBitmap.gotoAndStop(layerData.data[idx] - 1);
					cellBitmap.x = x * tilewidth;
					cellBitmap.y = y * tileheight;
					// add bitmap to gamestage
					container.addChild(cellBitmap);
					// internalgamestage.addChild(cellBitmap);
				}
			}
		}

		container.tickEnabled = false;
		container.snapToPixel = true;

		return container;
	}

	/**
	 * Draws fog of war
	 * @private
	 * @param  {Array} layerData Tiled JSON data
	 * @param  {Image} tilesetSheet
	 * @param  {number} tilewidth
	 * @param  {number} tileheight
	 * @return {Container}
	 */
	function initFogOfWar(layerData, tilewidth, tileheight) {
		this.fogOfWarContainer = new createjs.Container();

		this.fogOfWarGrid = new Array(layerData.height);
		for (var y = 0; y < layerData.height; y++) {
			this.fogOfWarGrid[y] = new Array(layerData.width);
			for (var x = 0; x < layerData.width; x++) {
				var fog = new createjs.Sprite(fogOfWarSpriteSheet);
				this.fogOfWarGrid[y][x] = fog;
				fog.x = x * tilewidth;
				fog.y = y * tileheight;
				// add bitmap to gamestage
				this.fogOfWarContainer.addChild(fog);
			}
		}

		this.fogOfWarContainer.tickEnabled = false;
		this.fogOfWarContainer.snapToPixel = true;
	}

	/**
	 * Same as initDrawableLayer, but also builds the renderer's collision array
	 * @private
	 * @param  {Array} layerData Tiled JSON data
	 * @param  {Image} tilesetSheet
	 * @param  {number} tilewidth
	 * @param  {number} tileheight
	 * @return {Container}
	 */
	function initDrawableLayerWithCollisionArray(layerData, tilesetSheet, tilewidth, tileheight) {
		var container = new createjs.Container();

		collisionSystem.collisionArray = new Array(layerData.height);
		for (var y = 0; y < layerData.height; y++) {
			collisionSystem.collisionArray[y] = new Array(layerData.width);
			for (var x = 0; x < layerData.width; x++) {
				// create a new Bitmap for each cell
				// layer data has single dimension array
				var idx = x + y * layerData.width;
				if (layerData.data[idx] !== 0) {
					var cellBitmap = null;
					cellBitmap = new createjs.Sprite(tilesetSheet);
					// tilemap data uses 1 as first value, EaselJS uses 0 (sub 1 to load correct tile)
					cellBitmap.gotoAndStop(layerData.data[idx] - 1);
					cellBitmap.x = x * tilewidth;
					cellBitmap.y = y * tileheight;
					container.addChild(cellBitmap);

					collisionSystem.collisionArray[y][x] = 0;
				} else {
					collisionSystem.collisionArray[y][x] = 1;
				}
			}
		}

		this.movementGraph = new Graph(collisionSystem.collisionArray);

		container.tickEnabled = false;
		container.snapToPixel = true;
		return container;
	};

	/**
	 * Cleans up movement fields after a player's turn is done
	 * @private
	 */
	function cleanUpMovement() {
		this.moving = false;
		this.movingObject.cleanUpMovement();
		this.movingObject = {};
		this.moveToX = 0;
		this.moveToY = 0;
		this.movingToCellTarget = {};
		this.movementSearchResult = [];
		playerTurn = false;
	}

	/**
	 * Shifts the entire map except for the active player
	 * @private
	 * @param  {number} xamount
	 * @param  {number} yamount
	 */
	function shiftMap(xamount, yamount) {
		// right here we will actually have to iterate over other players and watched objects not contained by the renderer and move them in the opposite direction as well
		for (var i = 0; i < activeObjects.length; i++) {
			if (activeObjects[i] !== this.movingObject) {
				activeObjects[i].animations.x -= xamount;
				activeObjects[i].animations.y -= yamount;
			}
		}

		this.backgroundContainer.x -= xamount;
		this.backgroundContainer.y -= yamount;
		this.container.x -= xamount;
		this.container.y -= yamount;
		this.foregroundContainer.x -= xamount;
		this.foregroundContainer.y -= yamount;
		this.fogOfWarContainer.x -= xamount;
		this.fogOfWarContainer.y -= yamount;
	}

	/**
	 * Shifts the entire map without regard for active or inactive players
	 * @private
	 * @param  {number} xamount
	 * @param  {number} yamount
	 */
	function shiftEntireMap(xamount, yamount) {
		for (var i = 0; i < activeObjects.length; i++) {
			activeObjects[i].animations.x -= xamount;
			activeObjects[i].animations.y -= yamount;
		}

		this.backgroundContainer.x -= xamount;
		this.backgroundContainer.y -= yamount;
		this.container.x -= xamount;
		this.container.y -= yamount;
		this.foregroundContainer.x -= xamount;
		this.foregroundContainer.y -= yamount;
		this.fogOfWarContainer.x -= xamount;
		this.fogOfWarContainer.y -= yamount;
	}

	/**
	 * Forces caching on a container, caching the entire map size. disallows in animations in map
	 * @param  {Container} container
	 */
	this.beginCaching = function(container) {
		container.cache(0, 0, this.getMapWidth(), this.getMapHeight()); //this.mapData.tilesets[0].tileheight * this.mapData.layers[0].height);
	};

	/**
	 * Initializes the renderer, gets it ready to render a new map
	 * @public
	 */
	this.initMap = function () {
		// getting imagefile from first tileset
		if (this.mapData.tilesets[0].image.indexOf("..\/") > -1) {
			this.mapData.tilesets[0].image = this.mapData.tilesets[0].image.replace("..\/", "");
		}

		this.tileset.src = this.mapData.tilesets[0].image;

		initLayers.call(this);
		completeRenderer.call(this);
		this.doneRendering = true;
	};

	/**
	 * Reinitialize all of our variables here, gets us ready to draw a new map
	 * @param  {Object} mapData new map JSON
	 */
	this.prepareRenderer = function(mapData) {
		this.activeObjectsContainer = new createjs.Container();
		this.backgroundContainer = new createjs.Container();
		this.complexObjects = [];
		this.container = new createjs.Container();
		this.container.x = 0;
		this.container.y = 0;
		this.doneRendering = false;
		this.foregroundContainer = new createjs.Container();
		this.mapcounter = 0;
		this.mapData = mapData; // this is our tiled JSON data
		this.simpleObjects = [];
		this.tileset = new Image();

		this.backgroundContainer.x = 0;
		this.backgroundContainer.y = 0;
		this.container.x = 0;
		this.container.y = 0;
		this.foregroundContainer.x = 0;
		this.foregroundContainer.y = 0;
		this.fogOfWarContainer.x = 0;
		this.fogOfWarContainer.y = 0;
	};

	/**
	 * Shifts the map in a certain way
	 * @param  {Object} trackedObject
	 * @param  {number} targetx
	 * @param  {number} targety
	 * @return {boolean}
	 */
	this.moveObjectTo = function(trackedObject, targetx, targety) {
		this.movingObject = trackedObject;

		targetx -= this.container.x;
		targety -= this.container.y;
		if (!collisionSystem.checkCellValid(targetx, targety) ||
			(collisionSystem.getCollisionCoordinateFromCell(trackedObject.x, trackedObject.y).x === collisionSystem.getCollisionCoordinateFromCell(targetx, targety).x &&
			 collisionSystem.getCollisionCoordinateFromCell(trackedObject.x, trackedObject.y).y === collisionSystem.getCollisionCoordinateFromCell(targetx, targety).y)) {
			cleanUpMovement.call(this);
			return false;
		}

		this.moveToX = targetx;
		this.moveToY = targety;
		this.movingToCellTarget = collisionSystem.getCollisionCoordinateFromCell(this.moveToX, this.moveToY);
		this.movingToCellStart = collisionSystem.getCollisionCoordinateFromCell(this.movingObject.x, this.movingObject.y);
		this.moving = true;
	};

	/**
	 * Gets the canvas width in pixels
	 * @return {number}
	 */
	this.getCanvasWidth = function() {
		return gamestage.canvas.width;
	};

	/**
	 * Gets the canvas height in pixels
	 * @return {number}
	 */
	this.getCanvasHeight = function() {
		return gamestage.canvas.height;
	};

	/**
	 * Tells the renderer to attempt to center on an object
	 * @public
	 * @param  {Object} centeredObject
	 * @param {callback} centeringCallback
	 */
	this.centerMapOnObject = function(centeredObject, centeringCallback) {
		this.centeredObject = centeredObject;
		this.centeringCallback = centeringCallback;
		this.centered = false;
	};

	/**
	 * centerMapOnObjectTick attempts to center the map on an object. returns true once the map is either centered
	 * or the map has reached an edge when trying to center
	 * @public
	 * @return {boolean}                true if centered false if not
	 */
	this.centerMapOnObjectTick = function() {
		if (tryCentering.call(this, this.centeredObject, MAP_MOVE_SPEED) === false) {
			this.centeringCallback();
			this.centered = true;
		}
	};

	/**
	 * Attempts to center the screen, should get closer every frame
	 * @param  {Object} obj
	 * @param  {number} speed
	 * @return {boolean}       false if the screen can't get more centered
	 */
	function tryCentering(obj, speed) {
		var distanceX = distanceFromCenteredX.call(this, obj);
		var distanceY = distanceFromCenteredY.call(this, obj);

		if (Math.abs(distanceX) < (2 * speed)) {
			distanceX = 0;
		}

		if (Math.abs(distanceY) < (2 * speed)) {
			distanceY = 0;
		}

		var mapShiftX = 0;
		var mapShiftY = 0;

		if (distanceX > 0) { // we need to shift map right
			mapShiftX = speed;

			if (!canShiftMapRight.call(this, speed)) {
				mapShiftX = 0;
			}
		} else if (distanceX < 0) { // we need to shfit map left
			mapShiftX = -speed;

			if (!canShiftMapLeft.call(this, speed)) {
				mapShiftX = 0;
			}
		}

		if (distanceY > 0) { // we need to shift map down
			mapShiftY = speed;

			if (!canShiftMapUp.call(this, speed)) {
				mapShiftY = 0;
			}
		} else if (distanceY < 0) { // we need to shift map up
			mapShiftY = -speed;

			if (!canShiftMapDown.call(this, speed)) {
				mapShiftY = 0;
			}
		}

		if (mapShiftX === 0 && mapShiftY === 0) {
			return false;
		}

		shiftEntireMap.call(this, mapShiftX, mapShiftY);
	}

	/**
	 * Returns distance from the center of the screen
	 * positive means needs containers need to shift right by half returned number of pixels to be centered
	 * positive means needs object need to shift left by half returned number of pixels to be centered
	 * @param  {Object} obj
	 * @return {number}
	 */
	function distanceFromCenteredX(obj) {
		return (obj.x + obj.spriteSheet._frameWidth) + renderer.container.x - (gamestage.canvas.width / 2);
	}

	/**
	 * Returns true if the map can shift left, false if not
	 * @param  {number} speed
	 * @return {boolean}
	 */
	function canShiftMapLeft(speed) {
		return renderer.container.x + (speed / 2) < 0;
	}

	/**
	 * Returns true if the map can shift right, false if not
	 * @param  {number} speed
	 * @return {number}
	 */
	function canShiftMapRight(speed) {
		return renderer.container.x + renderer.getMapWidth() - (speed / 2) > gamestage.canvas.width;
	}

	/**
	 * Returns distance from the center of the screen
	 * positive means containers needs to go up by half returned number of pixels to be centered
	 * positive means object needs to go down by half returned number of pixels to be centered
	 * @param  {Object} obj
	 * @return {number}
	 */
	function distanceFromCenteredY(obj) {
		return ((obj.y + obj.spriteSheet._frameHeight) + (renderer.container.y) - (gamestage.canvas.height / 2));
	}

	/**
	 * Returns true if the map can shift down, false if not
	 * @param  {number} speed
	 * @return {boolean}
	 */
	function canShiftMapDown(speed) {
		return renderer.container.y + (speed / 2) < 0;
	}

	/**
	 * Returns true if the map can shift up, false if not
	 * @param  {number} speed
	 * @return {boolean}
	 */
	function canShiftMapUp(speed) {
		return gamestage.canvas.height - this.container.y + speed < this.getMapHeight();
	}

	/**
	 *Function to handle moving objects from startxy to movingToCellTarget
	 * @public
	 */
	this.movementTickActions = function() {
		var startxy = collisionSystem.getCollisionCoordinateFromCell(this.movingObject.x, this.movingObject.y);
		if (!this.movementSearchResult[0] || (startxy.x === this.movementSearchResult[0].x && startxy.y === this.movementSearchResult[0].y)) {
			// this section basically means we are looking to move to a new cell
			var start = this.movementGraph.grid[startxy.x][startxy.y];
			var end = this.movementGraph.grid[this.movingToCellTarget.x][this.movingToCellTarget.y];
			this.movementSearchResult = astar.search(this.movementGraph, start, end);

			// update our fog of war
			if (this.movingObject.constructor === Player) {
				this.fogOfWarContainer.uncache();
				updateFogOfWar(this.movingObject);
				this.beginCaching(this.fogOfWarContainer);
			}
		}

		if ((this.movingToCellTarget.y === startxy.y && this.movingToCellTarget.x === startxy.x) || !this.movementSearchResult || !this.movementSearchResult[0]) {
			cleanUpMovement.call(this);
			return;
		}

		var deltax = this.movementSearchResult[0].x - startxy.x;
		var deltay = this.movementSearchResult[0].y - startxy.y;

		this.movingObject.updateMovementAnimation(deltax, deltay);

		this.movingObject.animations.x += deltax * this.movingObject.moveSpeed;
		this.movingObject.animations.y += deltay * this.movingObject.moveSpeed;
		this.movingObject.x += deltax * this.movingObject.moveSpeed;
		this.movingObject.y += deltay * this.movingObject.moveSpeed;
		tryCentering.call(this, this.movingObject, this.movingObject.moveSpeed);
	};

	/**
	 * Returns map width
	 * @public
	 * @return {number}
	 */
	this.getMapWidth = function() {
		return this.mapData.tilewidth * (this.mapData.width);
	};

	/**
	 * Returns map width
	 * @public
	 * @return {number}
	 */
	this.getMapHeight = function() {
		return this.mapData.tileheight * (this.mapData.height);
	};

	/**
	 * Sets renderer's imageData
	 * @param {Image} image
	 */
	this.setImage = function(image) {
		this.imageData = image;
	}
}

