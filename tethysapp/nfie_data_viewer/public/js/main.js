"use strict";
// Variables related to the cesium globe
var viewer, scene, layers, USRivers, selectedStreams = [], selectedLabels = [], globeClickListener, removeSelectionListener;

// Variables related to the netcdf chart
var defaultChartSettings, chart, selectionCounter = 1, chartShowingBmks = false;

// Variables related to the animation
var playAnimation, pauseAnimation, stopAnimation;

//jQuery handles
var infoDiv = $('#info');
var selectionButtons = $('#remove-buttons, #view-buttons');
var chartDiv =  $('#nc-chart');
var statusDiv = $('#status');
var popupDiv = $('#welcome-popup');
var searchOutput = $('#search-output');
var animationButtons = $('#animation-buttons');
var menuBar = $('#app-content-wrapper');

// Global data variables
var tsPairsData = {};
var rpClsData = {};
var rpBmkData = {};


$(function () {

    // Give this element an id so its style can be adjusted in main.css
    $('#animation-slider').children().attr('id', 'slider');

    // If the menu bar isn't showing, then show it
    if (!menuBar.hasClass('show-nav')) {
        menuBar.addClass('show-nav')
    }
    // Change labels on Tethys Slider Gizmo created in controllers.py
    $('.slider-before').text('Slow');
    $('.slider-after').text('Fast');

    /********************************************
     *****WAS A FILE PATH PASSED IN THE URL?*****
     ********************************************/
    var params = getSearchParameters();

    if (params["src"] == undefined || params["src"] == null) {

        // Hide app-functionality buttons
        $('#zoom-info-text').addClass('hidden');
        $('#select-info-text').addClass('hidden');
        $('#streams-toggle-group').addClass('hidden');
        $('#labels-toggle-group').addClass('hidden');

        // Change welcome modal to show info about loading viewer from other app
        $('#welcome-info').html('<p>This app redirects from either the <a href="../nfie-irods-explorer">Tethys NFIE iRODS Explorer</a> or ' +
            '<a href="https://www.hydroshare.org">HydroShare</a> and is ' +
            'used to view RAPID Output NetCDF files in an interactive way. Without being redirected from one ' +
            'of those sites, this app has little practical use since you cannot currently upload your own ' +
            'RAPID Output NetCDF file. Please click the links to the resources above to browse their ' +
            'file repositories. When locating an applicable NetCDF file, you will be given a "Open File ' +
            'in Tethys Viewer" link that will redirect you here to view the chosen file. Good luck!</p>' +
            '<div id="extra-buttons"></div>');

        $('#extra-buttons').append('<a class="btn btn-default btn-sm" href="https://www.hydroshare.org/search/?q=rapid&selected_facets=resource_type_exact:NetcdfResource">Browse HS RAPID NetCDF Resources</a><br>');
        $('#extra-buttons').append('<a class="btn btn-default btn-sm" href="https://appsdev.hydroshare.org/apps/nfie-irods-explorer/">Go to NFIE iRODS Explorer</a><br>');
        if (document.referrer == "https://appsdev.hydroshare.org/apps/") {
            $('#extra-buttons').append('<a class="btn btn-default btn-sm" href="https://appsdev.hydroshare.org/apps">Return to HydroShare Apps</a>');
        }

    }
    else {

        // Place filename in menu bar so we know which file we're viewing
        var lastDash = params['res_id'].lastIndexOf('/');
        var fileName = params['res_id'].slice(lastDash + 1);
        $('#file-name').html('<p><strong>Your netCDF file:</strong> ' + fileName + '</p>');

        /****************************
         ****BEGIN FILE DOWNLOAD*****
         ****************************/
        $.ajax({
            type: 'GET',
            url: 'start-file-download',
            dataType: 'json',
            data: {
                'res_id': params['res_id'],
                'src': params['src']
            },
            error: function (jqXHR, textStatus, errorThrown) {
                statusDiv.html('<p class="error"><strong>' + errorThrown + '</strong></p>');
                console.log(jqXHR + '\n' + textStatus + '\n' + errorThrown);
            },
            success: function (data) {
                if ("error" in data) {
                    statusDiv.html('<p class="error"><strong>' + data['error'] + '</strong></p>');
                }
                else if ("success" in data) {

                    statusDiv.html('<p class="success"><strong>File is ready</strong></p>');

                    // Hide menu bar .5 seconds after successfully downloading file
                    setTimeout(function() {
                        if (menuBar.hasClass('show-nav')) {
                            $('.toggle-nav').trigger('click');
                        }
                    }, 500);

                    addGlobeClickEvent();

                    camera.moveEnd.addEventListener(function() {
                        var height = camera.positionCartographic.height;
                        if (height < 50000) {
                            $('#btnSelectView').removeClass('hidden');
                            $('#zoom-info-text').addClass('hidden');
                        }
                        else {
                            $('#btnSelectView').addClass('hidden');
                            $('#zoom-info-text').removeClass('hidden');
                        }
                    });
                }
            }
        });

        statusDiv.html('<p class="wait">File is loading ' +
            '<img id="img-file-loading" src="/static/nfie_data_viewer/images/ajax-loader.gif"/></p>');
    }

    // Show welcome modal
    if (document.referrer == "https://appsdev.hydroshare.org/apps/") {
        $('#extra-buttons').append('<a class="btn btn-default btn-sm" href="https://appsdev.hydroshare.org/apps">Return to HydroShare Apps</a>');
    }
    popupDiv.modal('show');

    /**********************************
     ****INITIALIZE MAP AND LAYERS*****
     **********************************/

    viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider : new Cesium.BingMapsImageryProvider({
            url: '//dev.virtualearth.net',
            key: 'eLVu8tDRPeQqmBlKAjcw~82nOqZJe2EpKmqd-kQrSmg~AocUZ43djJ-hMBHQdYDyMbT-Enfsk0mtUIGws1WeDuOvjY4EXCH-9OK3edNLDgkc',
            mapStyle: Cesium.BingMapsStyle.AERIAL_WITH_LABELS
        }),
        baseLayerPicker: false,
        fullscreenButton: false,
        sceneModePicker: false,
        animation: false,
        timeline: false,
        selectionIndicator: false,
        infoBox: false
    });
    scene = viewer.scene;
    layers = scene.imageryLayers;

    USRivers = layers.addImageryProvider(new Cesium.ArcGisMapServerImageryProvider({
        url: 'https://cgmap1.ncsa.illinois.edu/arcgis/rest/services/hydro/NFIEGeoNational_flowline/MapServer',
        layers: '0',
        tileWidth: 256,
        tileHeight: 256
    }));

    var camera = viewer.camera;

    globeClickListener = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    removeSelectionListener = new Cesium.ScreenSpaceEventHandler(scene.canvas);

    /****************************
     ******INITIALIZE CHART******
     ****************************/
    defaultChartSettings = {
        title: {text: "Discharge Predictions Spanning 12 Hours"},
        chart: {
            zoomType: 'x'
        },
        plotOptions: {
            series: {
                marker: {
                    enabled: false
                },
                events: {
                    legendItemClick: function (event) {
                        var unitsState = $('#units-toggle').bootstrapSwitch('state');
                        var clickedSeries = event.currentTarget.name;
                        chart.yAxis[0].setExtremes(null, null);
                        if (clickedSeries == 'All') {
                            removeBenchmarks();
                            updateChart(unitsState);
                        }
                        else {
                            var seriesIndex = unitsState ? ((parseInt(clickedSeries) - 1) * 2) : ((parseInt(clickedSeries) * 2) - 1);
                            var numSeries = chart.series.length;
                            for (var i = 0; i < numSeries-1; i++) {
                                if (i == seriesIndex) {
                                    showSeries(i);
                                } else {
                                    (i % 2 == 0) ? hideSeries(i, unitsState) : hideSeries(i, !unitsState);
                                }
                            }
                            var comid = this.userOptions.id.toString();
                            removeBenchmarks();
                            plotBenchmarks(comid);
                            chart.redraw();
                        }
                        return false;
                    }
                }
            }
        },
        xAxis: {
            type: 'datetime',
            title: {
                text: 'Time'
            },
            minRange: 14 * 3600000 // one day
        },
        yAxis: {
            min: 0
        },
        lang: {
            unitsKey: 'Switch between english and metric units'
        },
        exporting: {
            buttons: {
                customButton: {
                    text: 'Change Units',
                    _titleKey: "unitsKey",
                    onclick: function () {
                        toggleUnitsButton()
                    }
                }
            }
        }
    };

    chartDiv.highcharts(defaultChartSettings);
    chart = chartDiv.highcharts();
    $('#units-toggle').on('switchChange.bootstrapSwitch', function(event, state) {
        updateChart(state);
    });

    $('#rivers-toggle').on('switchChange.bootstrapSwitch', function(event, state) {
        USRivers.show = state;
    });

    $('#labels-toggle').on('switchChange.bootstrapSwitch', function(event, state) {
        var numLabels = selectedLabels.length;
        for (var i=0; i < numLabels; i++) {
            selectedLabels[i].show = state;
        }
    });
});

/****************************
 ****SET ON-CLOSE FUNCTION****
 ****************************/
window.onbeforeunload = function() {
    console.log("ran");
    try {
        $.ajax({
            url: 'delete-file', //This is a UrlMap (setup in app.py) that calls the delete_file function in controllers.py
            async: false
        });
    }
    catch(err) {}
};

function selectReach(lon, lat) {
    var precision = .001;
    var upLon = lon + precision;
    var lowLon = lon - precision;
    var upLat = lat + precision;
    var lowLat = lat - precision;

    // Create ArcGIS rest service geometry query parameter with required syntax
    var geometry = '{"hasZ": false, "hasM": false, "rings": ' +
        '[[[' + upLon + ',' + upLat + '],' +
        '[' + upLon + ',' + upLat + '],' +
        '[' + lowLon + ',' + lowLat + '],' +
        '[' + lowLon + ',' + lowLat + '],' +
        '[' + upLon + ',' + upLat + ']]], "spatialReference" : {"wkid" : 4326}}';

    queryMapServer(geometry);
}

// Selects all streams in the view. This is called from the Select View button passed from controllers.py
function selectView() {

    // Get pixel coordinates (top left and bottom right) of current viewport
    var ellipsoid = scene.globe.ellipsoid;
    var pixelCoords = new Cesium.Cartesian2(0, 0);
    var topLeft = scene.camera.pickEllipsoid(pixelCoords, ellipsoid);
    pixelCoords = new Cesium.Cartesian2(scene.canvas.width, scene.canvas.height);
    var bottomRight = scene.camera.pickEllipsoid(pixelCoords, ellipsoid);
    pixelCoords = new Cesium.Cartesian2(0, scene.canvas.height);
    var bottomLeft = scene.camera.pickEllipsoid(pixelCoords, ellipsoid);
    pixelCoords = new Cesium.Cartesian2(scene.canvas.width, 0);
    var topRight = scene.camera.pickEllipsoid(pixelCoords, ellipsoid);

    // Convert pixel coordinates to cartographic coordinates and then to degrees
    if (topLeft != null && bottomRight != null) {
        topLeft = ellipsoid.cartesianToCartographic(topLeft);
        var tlLongitude = Cesium.Math.toDegrees(topLeft.longitude);
        var tlLatitude = Cesium.Math.toDegrees(topLeft.latitude);
        bottomRight = ellipsoid.cartesianToCartographic(bottomRight);
        var brLongitude = Cesium.Math.toDegrees(bottomRight.longitude);
        var brLatitude = Cesium.Math.toDegrees(bottomRight.latitude);
        bottomLeft = ellipsoid.cartesianToCartographic(bottomLeft);
        var blLongitude = Cesium.Math.toDegrees(bottomLeft.longitude);
        var blLatitude = Cesium.Math.toDegrees(bottomLeft.latitude);
        topRight = ellipsoid.cartesianToCartographic(topRight);
        var trLongitude = Cesium.Math.toDegrees(topRight.longitude);
        var trLatitude = Cesium.Math.toDegrees(topRight.latitude);
    }

    // Create ArcGIS rest service geometry query parameter with required syntax
    var geometry = '{"hasZ": false, "hasM": false, "rings": ' +
        '[[[' + tlLongitude + ',' + tlLatitude + '],' +
        '[' + trLongitude + ',' + trLatitude + '],' +
        '[' + brLongitude + ',' + brLatitude + '],' +
        '[' + blLongitude + ',' + blLatitude + '],' +
        '[' + tlLongitude + ',' + tlLatitude + ']]], "spatialReference" : {"wkid" : 4326}}';

    queryMapServer(geometry);
}

function queryMapServer(geometry) {
    // Make JSON call to CyberGIS streams layer to return stream vector geometry within the polygon geometry
    Cesium.loadJsonp('https://cgmap1.ncsa.illinois.edu/arcgis/rest/services/hydro/NFIEGeoNational_flowline/MapServer/0/query',{
            parameters: {
                geometryType: "esriGeometryPolygon",
                geometry: geometry,
                outFields: 'COMID',
                inSR: '{"wkid" : 4326}',
                outSR: '{"wkid" : 4326}',
                f: 'json'
            }
        })
        .then(function(data) {
            var numFeatures = data.features.length; // Number of returned features
            var selectedCOMIDS = []; // Master array for the COMID of each feature
            var selectionCoords = {}; // Master dictionary For the coordinate array of each feature
            var comid;

            for (var i = 0; i < numFeatures; i++) {
                var coords = [];
                var numCoordinates = data.features[i].geometry.paths[0].length;
                var coordinates = data.features[i].geometry.paths[0];
                for (var ii = 0; ii < numCoordinates; ii++) {
                    coords.push(coordinates[ii][0]);
                    coords.push(coordinates[ii][1]);
                }
                comid = data.features[i].attributes.COMID;
                selectionCoords[comid] = coords; // Add the array of coordinates to the master array
                selectedCOMIDS.push(comid); // Add the comid to the master array
            }
            if (selectedCOMIDS.length < 1) {
                infoDiv.html('<span><strong>Please make a more precise click over the stream of your choice</strong></span>')
                    .removeClass('hidden')
                    .addClass('wait');

                // Hide error message 3 seconds after showing it
                setTimeout(function () {
                    infoDiv.addClass('hidden')
                        .removeClass('wait');
                }, 3000);
            }
            else {
                processSelections(selectedCOMIDS, selectionCoords);
            }
        })
}

// This function is called from the Animate Selections tethys gizmo button imported from controllers.py
function animateSelections() {

    // Animation variables
    var timeStep = 0; // This is a loop counter for the animation
    var speed; // To hold the milliseconds that the loop will repeat on
    var timeLoop; // A handle to the animation loop object
    var sliderVal = parseInt($('#sldrAnimate').val()); // Gets value from the animation speed slider

    // How fast should the animation run?
    switch (sliderVal) {
        case 1:
            speed = 1666;
            break;
        case 2:
            speed = 1333;
            break;
        case 3:
            speed = 1000;
            break;
        case 4:
            speed = 666;
            break;
        case 5:
            speed = 333;
            break;
    }

    //Get y-axis extents of charted data
    var chartYmin = chart.yAxis[0].min;
    var chartYmax = chart.yAxis[0].max;

    // Lock the chart's Yaxis so it doesn't change when adding the time bar
    chart.yAxis[0].setExtremes(chartYmin, chartYmax);

    // Add a new time bar
    var timeBar = chart.addSeries({
        showInLegend: false,
        redraw: false,
        id: "timeBar"
    });

    // The object that holds the looping function. The loop runs until ClearInterval(timeLoop) is called
    timeLoop = setInterval(function() {

        var numStreams = selectedStreams.length;
        var unitsState = $('#units-toggle').bootstrapSwitch('state');

        if (playAnimation == true && pauseAnimation == false && stopAnimation == false) {

            // The animation gets to the end and repeats after 12 loops
            if (timeStep > 12) {
                timeStep = 0;
            }

            var tickPosition = chart.xAxis[0].tickPositions;

            timeBar.setData([[tickPosition[timeStep + 1], chartYmin], [tickPosition[timeStep + 1], chartYmax]]);

            for (var streamIndex = 0; streamIndex < numStreams; streamIndex++) {
                if ($("input:radio[name=color-scheme]:checked").val() == "Individual") {
                    var comid = selectedStreams[streamIndex]._id;
                    var currentValCls = rpClsData[comid][timeStep];
                    switch (currentValCls) {
                        case 0:
                            selectedStreams[streamIndex].polyline.material = Cesium.Color.BLUE;
                            break;
                        case 2:
                            selectedStreams[streamIndex].polyline.material = Cesium.Color.YELLOW;
                            break;
                        case 10:
                            selectedStreams[streamIndex].polyline.material = Cesium.Color.ORANGE;
                            break;
                        case 20:
                            selectedStreams[streamIndex].polyline.material = Cesium.Color.RED;
                            break;
                        default:
                            console.error("Invalid classification found in dictionary for comid: " + comid)
                    }
                }
                else {
                    var seriesIndex = unitsState ? streamIndex*2 : (streamIndex*2)+1;
                    var currentVal = chart.series[seriesIndex].data[timeStep].y;
                    var dataRatio;
                    dataRatio = currentVal / chartYmax;
                    if (dataRatio < 0.25) {
                        selectedStreams[streamIndex].polyline.material = Cesium.Color.BLUE;
                    }
                    else if (dataRatio < 0.50) {
                        selectedStreams[streamIndex].polyline.material = Cesium.Color.YELLOW;
                    }
                    else if (dataRatio < 0.75) {
                        selectedStreams[streamIndex].polyline.material = Cesium.Color.ORANGE;
                    }
                    else if (dataRatio < 1) {
                        selectedStreams[streamIndex].polyline.material = Cesium.Color.RED;
                    }
                }
            }
            timeStep++;
        }
        else if (playAnimation == false && pauseAnimation == false && stopAnimation == true) {

            // Change entity color back to yellow highlight
            for (var i = 0; i < numStreams; i++) {
                selectedStreams[i].polyline.material = Cesium.Color.AQUA;
                selectedStreams[i].polyline.width = 2;
            }

            // Release the chart's yAxis so it can be dynamic
            chart.yAxis[0].setExtremes(null, null);

            // Stop the loop from running
            clearInterval(timeLoop);
        }
    }, speed);
}

/****************************************
 *******BUILD CHART FUNCTIONALITY********
 ****************************************/

function processSelections(selectedCOMIDS, selectionCoords) {

    // If the "All" legend options exist, remove them so they can be placed as the last legend option again
    if (chart.get('show-all') != null) {
        chart.get('show-all').remove();
    }

    infoDiv.html('<p><strong>Retrieving data for specific reach or view...' +
            '<br><img src="/static/nfie_data_viewer/images/ajax-loader.gif"/>' +
            '<p>This could take a moment</p>')
        .removeClass('error hidden');

    //if (selectedCOMIDS.constructor !== Array) {
    //    selectedCOMIDS = selectedCOMIDS.split();
    //}

    var queryCOMIDS = [];
    var numCOMIDS = selectedCOMIDS.length;
    var totalLoops = Math.ceil(numCOMIDS/50);
    for (var i = 0; i < totalLoops; i++) {
        queryCOMIDS.push([]);
    }
    var loop = 0;
    for (var index = 0; index < numCOMIDS; index++) {
        loop = Math.floor(index/50);
        queryCOMIDS[loop].push(selectedCOMIDS[index]);
    }

    viewer.entities.suspendEvents();

    // Number of requests currently executed
    var iRequest = 0;
    var sendData = queryCOMIDS[iRequest].join();

    queryFileData(sendData, totalLoops);

    function queryFileData(iSendData, totalRequests) {
        $.ajax({
            type: 'GET',
            url: 'get-netcdf-data/',
            contentType: 'text',
            dataType: 'json',
            data: {'comids': iSendData},
            error: function (jqXHR, textStatus, errorThrown) {
                infoDiv.html('<p><strong>An unknown error occurred while retrieving the data</strong></p>');
                console.log(jqXHR.responseText + '\n' + textStatus + '\n' + errorThrown);
            },
            success: function (data) {
                if ("success" in data) {
                    if ("rp_cls_data" in data) {
                        var returned_rpClsData = JSON.parse(data.rp_cls_data);
                        for (var key in returned_rpClsData) {
                            rpClsData[key] = returned_rpClsData[key];
                        }
                    }
                    if ("rp_bmk_data" in data) {
                        var returned_rpBmkData = JSON.parse(data.rp_bmk_data);
                        for (var key in returned_rpBmkData) {
                            rpBmkData[key] = returned_rpBmkData[key];
                        }
                    }
                    if ("ts_pairs_data" in data) {
                        var returned_tsPairsData = JSON.parse(data.ts_pairs_data);
                        var actualIndexTracker = 0;
                        for (var key in returned_tsPairsData) {
                            tsPairsData[key] = returned_tsPairsData[key];
                            if (returned_tsPairsData[key][0][1] != -9999) {
                                addStreamsWithLabels(key, selectionCoords[key]);
                                var seriesData = returned_tsPairsData[key];
                                chart.yAxis[0].setExtremes(null, null);
                                plotData(seriesData, key);
                                plotData(convertTimeSeriesMetricToEnglish(seriesData, key));
                            }
                            actualIndexTracker += 1
                        }
                    }
                    iRequest++;
                    if (iRequest < totalRequests) {
                        queryFileData(queryCOMIDS[iRequest].join(), totalRequests);
                    }
                    else {
                        infoDiv.addClass('hidden');
                        // Show selected streams, chart, and selection buttons
                        viewer.entities.resumeEvents();
                        if (chart.series.length == 2) {
                            plotBenchmarks(queryCOMIDS);
                        }
                        else {
                            removeBenchmarks();
                        }
                        showChart();

                        if (selectionButtons.hasClass('hidden')) {
                            selectionButtons.removeClass('hidden');
                            $('#select-info-text').addClass('hidden');
                        }
                    }
                }
                else if ("error" in data) {
                    viewer.entities.resumeEvents();
                    infoDiv
                        .html('<strong>' + data['error'] + '</strong>')
                        .removeClass('hidden')
                        .addClass('error');

                    // Hide error message 2 seconds after showing it
                    setTimeout(function () {
                        infoDiv.addClass('hidden')
                    }, 2000);
                }
                else {
                    viewer.entities.resumeEvents();
                    infoDiv
                        .html('<p><strong>An unexplainable error occurred. Why? Who knows...</strong></p>')
                        .removeClass('hidden');
                }
            }
        });
    }
}

var convertTimeSeriesMetricToEnglish = function (timeSeries) {
    var newTimeSeries = [];
    var conversionFactor = 35.3146667;
    timeSeries.map(function (dataRow) {
        var newDataArray = [dataRow[0]];
        for (var i = 1; i < dataRow.length; i++) {
            newDataArray.push(parseFloat((dataRow[i] * conversionFactor).toFixed(5)));
        }
        newTimeSeries.push(newDataArray);
    });
    return newTimeSeries;
};

var plotData = function(data_object, id) {
    var seriesName = getSelectionName();
    var dataSeries = {
        name: seriesName,
        data: data_object,
        dashStyle: 'longdash',
        id: id
    };
    chart.addSeries(dataSeries, false);
    selectionCounter++;
};

var plotBenchmarks = function(comid) {
    var comidData = tsPairsData[comid];
    var dataMax = 0;
    for (var dataPair in comidData) {
        if (comidData[dataPair][1] > dataMax) {
            dataMax = comidData[dataPair][1];
        }
    }
    var rpBmks = rpBmkData[comid];
    var color;
    var labelText;
    for (var bmk_string in rpBmks) {
        var bmk = parseInt(bmk_string);
        switch (bmk) {
            case 0:
                color = "#ffff80";  // Yellow
                labelText = "2-year-event";
                break;
            case 1:
                color = "#ffd280";  // Orange
                labelText = "10-year-event";
                break;
            case 2:
                color = "#ff8080";  // Red
                labelText = "20-year-event";
                break;
            default:
                console.error("There are too many items in the rpBmkData list. There should only be three.")
        }
        chart.yAxis[0].addPlotBand({
            from: rpBmks[bmk],
            to: rpBmks[bmk+1] ? rpBmks[bmk+1] : rpBmks[bmk] + 20,
            color: color,
            label: {
                text: labelText,
                style: {
                    fontSize: 10,
                    verticalAlign: 'middle'
                }
            },
            id: "all"
        });
    }
    chart.yAxis[0].setExtremes(0, Math.max(rpBmks[2], dataMax));
    chartShowingBmks = true;
};

var removeBenchmarks = function() {
    if (chartShowingBmks) {
        chart.yAxis[0].removePlotBand('all');
        chartShowingBmks = false;
    }
};

function updateChart(state) {
    var numSeries = chart.series.length;
    var i;
    if (state == true) {
        for (i = 0; i < numSeries; i++) {
            (i % 2 == 0) ? showSeries(i) : hideSeries(i);
        }
        chart.yAxis[0].axisTitle.attr({
            text: "Flow (cms)"
        })
    } else {
        var ranOnce = false;
        for (i = 0; i < numSeries; i++) {
            if (numSeries > 2 && !ranOnce) {
                numSeries -= 1;
                ranOnce = true;
            }
            (i % 2 == 0) ? hideSeries(i) : showSeries(i);
        }
        chart.yAxis[0].axisTitle.attr({
            text: "Flow (cfs)"
        });
    }
    chart.redraw();
}


function hideSeries(seriesNum, showInLegend) {
    // Set the default value for showInLegend
    showInLegend = showInLegend===undefined ? false : showInLegend;

    // Get the specified series and set legend options
    var series = chart.series[seriesNum];
    series.options.showInLegend = showInLegend;
    series.legendItem = null;
    chart.legend.destroyItem(series);
    chart.legend.render();
    chart.series[seriesNum].setVisible(false, false);
}

function showSeries(seriesNum) {
    // Get the specified series and set legend options
    var series = chart.series[seriesNum];
    series.options.showInLegend = true;
    chart.legend.renderItem(series);
    chart.legend.render();
    chart.series[seriesNum].setVisible(true, false);
}

/****************************************
 ****ADD/REMOVE BUTTONS FUNCTIONALITY****
 ****************************************/

function toggleUnitsButton() {
    $('#units-toggle').bootstrapSwitch('toggleState', false);
}

function zoomToSelection() {
    viewer.flyTo(viewer.entities);
}

// Code calling this function was added as part of Tethys-Gizmo button in controllers.py
function removeLastSelection() {
    // Clear the info in the menu bar search output div
    if (searchOutput.children() != []) {
        searchOutput.children().last().remove()
    }

    // Remove series data corresponding to last selection
    var numSeries = chart.series.length;
    if (numSeries > 0) {
        if (chart.series.length == 2) {
            removeAllSelections();
            return;
        }
        else if (numSeries == 5) {
            chart.series[numSeries - 1].remove(); // Remove "All" legend item (only shown with two or more streams selected)
            chart.series[numSeries - 2].remove(); // Remove cfs series
            chart.series[numSeries - 3].remove(); // Remove cms series
        }
        else {
            chart.series[numSeries - 2].remove(); // Remove cfs series, keep "All" legend item
            chart.series[numSeries - 3].remove(); // Remove cms series, keep "All" legend item
        }

        selectionCounter -= 2;
    }

    // Remove last-selected stream segment
    if (selectedStreams != []) {
        viewer.entities.remove(selectedStreams.pop());
        viewer.entities.remove(selectedLabels.pop());
    }

    removeBenchmarks();

    $(window).resize();
}

// Code calling this function was added to Tethys Gizmo button in controllers.py
function removeAllSelections() {

    //Hide chart
    chartDiv.addClass('hidden');

    // Remove all series from chart with redraw set to false (to be called manually after all removals)
    while(chart.series.length > 0) {chart.series[0].remove(false)}

    // Remove all stream segments and labels
    viewer.entities.suspendEvents();
    viewer.entities.removeAll();
    viewer.entities.resumeEvents();
    selectedStreams = [];
    selectedLabels = [];

    // Clear search output and info divs
    searchOutput.html('');
    infoDiv.html('');

    // Hide selection buttons
    selectionButtons.addClass('hidden');
    $('#select-info-text').removeClass('hidden');
    animationButtons.addClass('hidden');
    $('#animation-legend').addClass('hidden');
    $('[name="btnAnimateFlow"]').removeClass('active');

    // Reset selection counter
    selectionCounter = 1;

    removeBenchmarks();
    rpBmkData = {};
    rpClsData = {};
    tsPairsData = {};

    $(window).resize();
}

function removeSelection() {
    if (selectedStreams.length == 0) {
        $('#btnRemoveSelection').removeClass('active');

        alert('Sorry. There are no selections to remove.');
    }
    else if ($('#btnRemoveSelection').hasClass('active')) {
        $('#clearAll, #clearLast, #btnSelectView, [name="btnAnimateFlow"]').removeClass('disabled');
        $('#btnRemoveSelection').removeClass('active');

        removeSelectionListener.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

        addGlobeClickEvent();
    }
    else {
        $('#btnRemoveSelection').addClass('active');
        $('#clearAll, #clearLast, #btnSelectView, [name="btnAnimateFlow"]').addClass('disabled');

        globeClickListener.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

        removeSelectionListener.setInputAction(function(click) {
            var pickedObject = scene.pick(click.position);
            if (Cesium.defined(pickedObject)) {
                var selectionLabel;
                var selectionCOMID;
                var selectionID = pickedObject.id._id.toString();
                var objectIsLabel = selectionID.indexOf('label') > -1;

                if (objectIsLabel) {
                    selectionLabel = viewer.entities.getById(selectionID);
                    selectionCOMID = selectionID.slice(0, selectionID.indexOf('label'));
                }
                else {
                    selectionLabel = viewer.entities.getById(selectionID.toString() + "label");
                    selectionCOMID = selectionID;
                }

                var selectionNumber = parseInt(selectionLabel.label.text._value);
                var seriesIndex = (selectionNumber * 2) - 2;
                var series;
                var currVal;
                var removeStream;
                var removeLabel;

                // Remove corresponding chart series and their legend items
                series = chart.series[seriesIndex];
                chart.legend.destroyItem(series);
                chart.series[seriesIndex].remove();

                series = chart.series[seriesIndex];
                chart.legend.destroyItem(series);
                chart.series[seriesIndex].remove();

                // Remove corresponding stream and its label
                removeStream = viewer.entities.getById(selectionCOMID);
                removeLabel = viewer.entities.getById(selectionCOMID.toString() + "label");
                selectedStreams.splice(selectedStreams.indexOf(removeStream), 1);
                selectedLabels.splice(selectedLabels.indexOf(removeLabel), 1);
                viewer.entities.removeById(selectionCOMID);
                viewer.entities.removeById(selectionCOMID.toString() + "label");

                // Re-name (re-number) all of the labels
                for (var label in selectedLabels) {
                    currVal = parseInt(selectedLabels[label].label.text._value);
                    if (currVal > selectionNumber) {
                        selectedLabels[label].label.text._value = (currVal - 1).toString();
                    }
                }

                // Re-name (re-number) all of the chart series
                for (var item in chart.series) {
                    currVal = parseInt(chart.series[item].name);
                    if (!(isNaN(currVal))) {
                        if (currVal > selectionNumber) {
                            var newName = (currVal - 1).toString();
                            chart.series[item].update(
                                {
                                    name:newName,
                                    index: parseInt(item)
                                }, false);
                        }
                        else {
                            chart.series[item].update({index: parseInt(item)}, false);
                        }
                    }
                    else {
                        chart.series[item].update({index: parseInt(item)}, false);
                    }
                }

                var unitsState = $('#units-toggle').bootstrapSwitch('state');
                updateChart(unitsState);

                if (selectedStreams.length == 0) {
                    chartDiv.addClass('hidden');

                    while (chart.series.length > 0) {
                        chart.series[0].remove(); // Remove the "All" legend item
                    }

                    // Hide selection buttons
                    selectionButtons.addClass('hidden');
                    $('#select-info-text').removeClass('hidden');
                    animationButtons.addClass('hidden');
                    $('#animation-legend').addClass('hidden');
                    $('[name="btnAnimateFlow"]').removeClass('active');
                    $('#btnRemoveSelection').removeClass('active');

                    removeSelectionListener.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
                    addGlobeClickEvent();
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
}

/****************************************
 *********GLOBAL FUNCTIONALITY**********
 ****************************************/

function addStreamsWithLabels(selectedCOMID, selectionCoords) {
    // Add stream segment
    try {
        selectedStreams.push(viewer.entities.add({
            id: selectedCOMID,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray(selectionCoords),
                width: 2,
                material: Cesium.Color.AQUA
            },
            chartLabel: getSelectionName()
        }));

        // Get coordinates of midpoint of stream segment to add Label to midpoint
        var midPoint = selectionCoords.length / 2;
        var midIndex = midPoint % 2 == 0 ? midPoint : midPoint + 1;

        // Check if labels should be shown or not
        var showLabels = $('#labels-toggle').bootstrapSwitch('state');

        // Add label to stream
        selectedLabels.push(viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(selectionCoords[midIndex], selectionCoords[midIndex + 1]),
            label: {
                text: getSelectionName(),
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                scale: 0.6
            },
            id: (selectedCOMID.toString() + "label"),
            show: showLabels
        }));
    }
    catch (err) {}
}

// Keeps track of how many selections have been added to get next label name
function getSelectionName() {
    return (selectionCounter % 2 == 0) ? (selectionCounter / 2).toString() : ((selectionCounter / 2) + 0.5).toString();
}

/*************************************************
 *********ANIMATION BUTTONS FUNCTIONALITY*********
 *************************************************/

$("input:radio[name=color-scheme]").change(
    function() {
        if ($("input:radio[name=color-scheme]:checked").val() == "Individual") {
            $('#blue').text("Low flow");
            $('#yellow').text("2-year");
            $('#orange').text("10-year");
            $('#red').text("20-year");
        }
        else {
            $('#blue').text("1st Quartile");
            $('#yellow').text("2nd Quartile");
            $('#orange').text("3rd Quartile");
            $('#red').text("4th Quartile");
        }
    }
);

function bindPlayClickEvent() {
    $('#play-button').one('click', function() {
        // Remove globe click listener
        globeClickListener.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Start animation
        animateSelections();

        // Bind a one-time click event to the stop button
        bindStopClickEvent();
    })
}

function bindStopClickEvent() {
    $('#stop-button').one('click', function (){
        // Activate previously disabled buttons
        $('#clearAll, #clearLast, #btnSelectView, #btnRemoveSelection').removeClass('disabled');
        $('#sldrAnimate').removeAttr('disabled');
        $('#pause-button, #stop-button').addClass('disabled');
        $('.radio-buttons').each(function(){this.disabled = false;});

        // Re-activate 'Change Units' button functionality on chart
        $('#units-toggle').on('switchChange.bootstrapSwitch', function(event, state) {
            updateChart(state);
        });

        // Set button boolean states
        playAnimation = false;
        pauseAnimation = false;
        stopAnimation = true;

        // Remove the time bar
        chart.get("timeBar").remove();

        //Rebind the globe click event
        addGlobeClickEvent();

        // Rebind another single play click event
        bindPlayClickEvent();
    });
}

$('#play-button')
    .one('click', function() {
        bindPlayClickEvent();
        $('#play-button').trigger('click');
    })
    .on('click', function() {
        //Disable all buttons that would interfere with animation
        $('#clearAll, #clearLast, #btnSelectView, #btnRemoveSelection').addClass('disabled');
        $('#sldrAnimate').attr('disabled', true);
        $('#pause-button, #stop-button').removeClass('disabled');
        $('.radio-buttons').each(function(){this.disabled = true;});

        // De-activate 'Change Units' button functionality on chart
        $('#units-toggle').off('switchChange.bootstrapSwitch');

        // Set button boolean states
        pauseAnimation = false;
        stopAnimation = false;
        playAnimation = true;
    });

$('#pause-button').on('click', function (){
    // Pause can only be pressed once
    $('#pause-button').addClass('disabled');

    // Set button boolean states
    playAnimation = false;
    stopAnimation = false;
    pauseAnimation = true;
});

function showAnimationTools() {
    // If a selection has been made, show buttons, else alert user to make a selection
    if (chart.series.length != 0) {

        // Allow the animation tools to be toggled on and off
        if (animationButtons.hasClass('hidden')) {
            animationButtons.removeClass('hidden');
            $('[name="btnAnimateFlow"]').addClass('active');
        }
        else {
            $('[name="btnAnimateFlow"]').removeClass('active');
            animationButtons.addClass('hidden');
            $('#animation-legend').addClass('hidden');
        }
        $('#animation-legend').removeClass('hidden');
    }
    else {
        alert("Please make a selection first");
    }
}

function addGlobeClickEvent() {
    globeClickListener.setInputAction(function(click) {
        var ellipsoid = scene.globe.ellipsoid;
        var cartesian = viewer.camera.pickEllipsoid(click.position, ellipsoid);
        if (cartesian) {
            var cartographic = ellipsoid.cartesianToCartographic(cartesian);
            var longitude = Cesium.Math.toDegrees(cartographic.longitude);
            var latitude = Cesium.Math.toDegrees(cartographic.latitude);
            selectReach(longitude, latitude);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/*****************************
 ***FIND REDIRECTION SOURCE***
 *****************************/
function getSearchParameters() {
    var prmstr = window.location.search.substr(1);
    return prmstr != null && prmstr != "" ? transformToAssocArray(prmstr) : {};
}

function transformToAssocArray(prmstr) {
    var params = {};
    var prmarr = prmstr.split("&");
    for (var i = 0; i < prmarr.length; i++) {
        var tmparr = prmarr[i].split("=");
        params[tmparr[0]] = tmparr[1];
    }
    return params;
}

function showChart() {
    if (chart.series.length > 2) {
        // Add the "All" series options to the legend - one for metric, and one for english
        var emptySeries = {
            name: "All",
            dashStyle: 'longdash',
            id: "show-all"
        };
        chart.addSeries(emptySeries, false);
    }

    chart.redraw();

    if (chart.series.length != 0) {
        var unitsState = $('#units-toggle').bootstrapSwitch('state');
        updateChart(unitsState);

        if (chartDiv.hasClass('hidden')) {
            chartDiv.removeClass('hidden');
            $(window).resize();
        }
    }
}