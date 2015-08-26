"use strict";

//variables related to identifying source of redirection
var params, prmstr, prmarr, tmparr;

//variables related to the map
var map, base_layer, all_streams_layer, selected_streams_layer;
var flag_geocoded;

//variables related to the delineation process
var comid, fmeasure, gnis_name, wbd_huc12;

//variables related to the netcdf chart
var default_chart_settings, nc_chart, chart_data, plotCounter = 1;

//jQuery handles
var infoDiv = $('#info');
var chartButtons = $('#chart-buttons');
var chartDiv =  $('#nc-chart');
var statusDiv = $('#status');
var popupDiv = $('#chart-popup');
var searchOutput = $('#search_output');

$(function () {
    /*****************************
     ***FIND REDIRECTION SOURCE***
     *****************************/
    function getSearchParameters() {
        prmstr = window.location.search.substr(1);
        return prmstr != null && prmstr != "" ? transformToAssocArray(prmstr) : {};
    }

    function transformToAssocArray(prmstr) {
        params = {};
        prmarr = prmstr.split("&");
        for (var i = 0; i < prmarr.length; i++) {
            tmparr = prmarr[i].split("=");
            params[tmparr[0]] = tmparr[1];
        }
        return params;
    }

    params = getSearchParameters();

    /***************************************
     *****WAS A FILE PASSED IN THE URL?*****
     ***************************************/
    if (params["src"] == undefined || params["src"] == null) {
        //change welcome modal to show info about loading viewer from other app
        $('#welcome-info').html('<p>This app redirects from either the Tethys NFIE iRODS Browser or HydroShare and is ' +
                                'used to view RAPID Output NetCDF files in an interactive way. Without being redirected from one' +
                                'of those sites, this app has little practical use since you cannot currently upload your own' +
                                'RAPID Output NetCDF file. Please click the links to the resources above to browse their' +
                                'file repositories. When locating an applicable NetCDF file, you will be given a "Open File' +
                                'in Tethys Viewer" link that will redirect you here to view the chosen file. Good luck!');
    } else {

        //place filename in div so we know which file we're viewing
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
                'file_id': params['res_id'],
                'redirect_src': params['src']
            },
            error: function (jqXHR, textStatus, errorThrown) {
                statusDiv.html('<p class="error"><strong>' + errorThrown + '</strong></p>');
                console.log(jqXHR);
                console.log(textStatus);
                console.log(errorThrown);
            },
            success: function (data) {
                if ("error" in data) {
                    statusDiv.html('<p class="error"><strong>' + data['error'] + '</strong></p>');
                }
                else if ("success" in data) {
                    statusDiv.html('<p class="success"><strong>File is ready</strong></p>');
                    map.on('click', function(evt) {
                        flag_geocoded=false;
                        var coordinate = evt.coordinate;
                        var lonlat = ol.proj.transform(coordinate, 'EPSG:3857', 'EPSG:4326');
                        reverse_geocode(lonlat);
                        if (map.getView().getZoom()<12) {
                            map.getView().setZoom(12);
                            CenterMap(lonlat[1],lonlat[0]);
                        }
                        //Each time the user clicks on the map, let's run the point
                        //indexing service to show them the closest NHD reach segment.
                        run_point_indexing_service(lonlat);
                    });
                }
            }
        });
        statusDiv.html('<p class="wait">File is loading ' +
                       '<img id="img-file-loading" src="/static/nfie_data_viewer/images/ajax-loader.gif"/></p>');

        /****************************
         ****SET ON-CLOSE FUNCTION****
         ****************************/
        window.onbeforeunload = function() {
            $.ajax({
                type: 'GET',
                url: 'delete-file',
                dataType: 'json',
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log(jqXHR);
                    console.log(textStatus);
                    console.log(errorThrown);
                },
                success: function (data) {}
            });
        };
    }

    //show welcome modal
    popupDiv.modal('show');

    /**********************************
     ****INITIALIZE MAP AND LAYERS*****
     **********************************/
    map = new ol.Map({
        target: 'map-view',
        view: new ol.View({
            center: [-100, 40],
            zoom: 3.5,
            minZoom: 3,
            maxZoom: 18
        })
    });

    base_layer = new ol.layer.Tile({
        source: new ol.source.BingMaps({
            key: 'eLVu8tDRPeQqmBlKAjcw~82nOqZJe2EpKmqd-kQrSmg~AocUZ43djJ-hMBHQdYDyMbT-Enfsk0mtUIGws1WeDuOvjY4EXCH-9OK3edNLDgkc',
            imagerySet: 'AerialWithLabels'
        })
	});

    var createLineStyleFunction = function() {
        return function(feature, resolution) {
            var style = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#ffff00',
                    width: 2
                }),
                text: new ol.style.Text({
                    textAlign: 'center',
                    textBaseline: 'middle',
                    font: 'bold 12px Verdana',
                    text: getText(feature, resolution),
                    fill: new ol.style.Fill({color: '#cc00cc'}),
                    stroke: new ol.style.Stroke({color: 'black', width: 0.5})
                })
            });
            return [style];
        };
    };

    var getText = function(feature, resolution) {
        var maxResolution = 100;
        var text = feature.get('name');
        if (resolution > maxResolution) {
            text = '';
        }
        return text;
    };

    selected_streams_layer = new ol.layer.Vector({
        source: new ol.source.Vector(),
        style: createLineStyleFunction()
    });

    var serviceUrl = 'http://watersgeo.epa.gov/arcgis/rest/services/NHDPlus_NP21/NHDSnapshot_NP21_Labeled/MapServer/0';
    var esrijsonFormat = new ol.format.EsriJSON();
    var vectorSource = new ol.source.Vector({
        loader: function(extent, resolution, projection) {
            var url = serviceUrl + '/query/?f=json&geometry=' +
                '{"xmin":' + extent[0] + ',"ymin":' + extent[1] + ',"xmax":' + extent[2] + ',"ymax":' + extent[3] +
                    ',"spatialReference":{"wkid":102100}}&inSR=102100&outSR=102100';
            $.ajax({url: url, dataType: 'jsonp', success: function(response) {
                if (response.error) {
                    alert(response.error.message + '\n' +
                        response.error.details.join('\n'));
                } else {
                // dataProjection will be read from document
                    var features = esrijsonFormat.readFeatures(response, {
                        featureProjection: projection
                    });
                    if (features.length > 0) {
                        vectorSource.addFeatures(features);
                    }
                }
            }});
        },
        strategy: ol.loadingstrategy.tile(ol.tilegrid.createXYZ({
            tileSize: 512
        }))
    });

    all_streams_layer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#0000ff',
                width: 2
            })
        }),
        maxResolution: 100
    });

    map.addLayer(base_layer);
    map.addLayer(all_streams_layer);
    map.addLayer(selected_streams_layer);

    find_current_location();

    /****************************
     ******INITIALIZE CHART******
     ****************************/
    default_chart_settings = {
        title: {text: "Discharge Predictions Spanning 12 Hours"},
        chart: {
            zoomType: 'x'
        },
        plotOptions: {
            series: {
                marker: {
                    enabled: false
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

    chartDiv.highcharts(default_chart_settings);
    nc_chart = chartDiv.highcharts();
    $('#units-toggle').on('switchChange.bootstrapSwitch', function(event, state) {
        updateChart(state);
    });
});

/****************************
 ***MAP VIEW FUNCTIONALITY***
 ****************************/

function find_current_location() {
    navigator.geolocation.getCurrentPosition(function(position) {
        var lat = position.coords.latitude;
        var lon = position.coords.longitude;
        CenterMap(lat,lon);
        map.getView().setZoom(8);
    });
}

function CenterMap(lat,lon){
    var dbPoint = {
        "type": "Point",
        "coordinates": [lon, lat]
    };
    var coords = ol.proj.transform(dbPoint.coordinates, 'EPSG:4326','EPSG:3857');
    map.getView().setCenter(coords);
}

/****************************************
 *********EPA WMS FUNCTIONALITY**********
 ****************************************/
function run_point_indexing_service(lonlat) {
    var inputLon = lonlat[0];
    var inputLat = lonlat[1];
    var wktval = "POINT(" + inputLon + " " + inputLat + ")";

    var options = {
        "success" : "pis_success",
        "error"   : "pis_error",
        "timeout" : 60 * 1000
    };

    var data = {
        "pGeometry": wktval,
        "pGeometryMod": "WKT,SRSNAME=urn:ogc:def:crs:OGC::CRS84",
        "pPointIndexingMethod": "DISTANCE",
        "pPointIndexingMaxDist": 10,
        "pOutputPathFlag": "TRUE",
        "pReturnFlowlineGeomFlag": "FULL",
        "optOutCS": "SRSNAME=urn:ogc:def:crs:OGC::CRS84",
        "optOutPrettyPrint": 0,
        "optClientRef": "CodePen"
    };
    waiting_pis();
    WATERS.Services.PointIndexingService(data, options);
    /* The service runs and when it is done, it will call either the
    success or error functions. So the actual actions upon success all
    happen in the success function. */
}

function waiting_pis() {
    searchOutput.append('<div class="search-output-loading">' +
        '<img id="loading-globe" src="http://www.epa.gov/waters/tools/globe_spinning_small.gif"></div>');
}

function pis_success(result, textStatus) {
    $('.search-output-loading').remove();
    var srv_rez = result.output;
    if (srv_rez == null) {
        if ( result.status.status_message !== null ) {
            report_failed_search(result.status.status_message);
        } else {
            report_failed_search("No reach located near your click point.");
        }
        return;
    }

    //build output results text block for display
    var srv_fl = result.output.ary_flowlines;
    comid = srv_fl[0].comid.toString();
    var reachcode = srv_fl[0].reachcode;
    fmeasure = srv_fl[0].fmeasure.toFixed(2).toString();
    gnis_name = srv_fl[0].gnis_name;
    wbd_huc12 = srv_fl[0].wbd_huc12;
    var selectionName = getSelectionName();
    searchOutput.append('<div><strong>Info for ' + selectionName + ':</strong><br>' +
        'Feature Name = ' + gnis_name + '<br>' +
        'COMID = ' + comid + '<br>' +
        'Reach Code = ' + reachcode + '<br>' +
        'Measure = ' + fmeasure + ' meters<br>' +
        'HUC 12 = ' + wbd_huc12 + '<br></div>');

    //add the selected flow line to the map
    for (var i in srv_fl){
        selected_streams_layer.getSource().addFeature(geojson2feature(srv_fl[i].shape));
    }

    get_netcdf_chart_data(comid);
}

function pis_error(XMLHttpRequest, textStatus, errorThrown) {
    report_failed_search(textStatus);
}

function report_failed_search(MessageText){
    //Set the message of the bad news
    searchOutput.append('<strong>Search Results:</strong><br>' + MessageText);
    gnis_name = null;
    map.getView().setZoom(4);
}

function geojson2feature(myGeoJSON) {
    //Convert GeoJSON object into an OpenLayers 3 feature.
    //Also force jquery coordinates into real js Array if needed
    var geojsonformatter = new ol.format.GeoJSON;
    if (myGeoJSON.coordinates instanceof Array == false) {
        myGeoJSON.coordinates = WATERS.Utilities.RepairArray(myGeoJSON.coordinates,0);
    }
    var myGeometry = geojsonformatter.readGeometry(myGeoJSON);
    myGeometry.transform('EPSG:4326','EPSG:3857');
    //name the feature according to the selection number
    var newFeatureName = getSelectionName();

    return new ol.Feature({
        geometry: myGeometry,
        name: newFeatureName
    });
}

/****************************************
 *****GOOGLE GEOCODER FUNCTIONALITY******
 ****************************************/

function run_geocoder() {
    var g = new google.maps.Geocoder();
    var myAddress=document.getElementById('txtLocation').value;
    g.geocode({'address': myAddress}, geocoder_success);
}

function geocoder_success(results, status) {
    if (status == google.maps.GeocoderStatus.OK) {
        flag_geocoded=true;
        var Lat = results[0].geometry.location.lat();
        var Lon = results[0].geometry.location.lng();

        var dbPoint = {
            "type": "Point",
            "coordinates": [Lon, Lat]
        };

        var coords = ol.proj.transform(dbPoint.coordinates, 'EPSG:4326','EPSG:3857');
        CenterMap(Lat,Lon);
        map.getView().setZoom(12);
    } else {
        alert("Geocode was not successful for the following reason: " + status);
    }
}

function reverse_geocode(coord){
    var latlon = new google.maps.LatLng(coord[1],coord[0]);
    var g = new google.maps.Geocoder();
    g.geocode({'location':latlon}, reverse_geocode_success);
}

function reverse_geocode_success(results, status) {
    if (status == google.maps.GeocoderStatus.OK) {
        var location = results[1].formatted_address;
        if (gnis_name != null) {
            location = gnis_name + ", " + location;
        }
        document.getElementById("txtLocation").value = location;
    } else {
        document.getElementById("txtLocation").value = "Location Not Available";
    }
}
//code calling this function was added to tethys gizmo button in controllers.py
function handle_search_key(e) {
    // This handles pressing the enter key to initiate the location search.
    if (e.keyCode == 13) {
        run_geocoder();
    }
}

/****************************************
 *******BUILD CHART FUNCTIONALITY********
 ****************************************/

function get_netcdf_chart_data(comid) {
    infoDiv.html('<p><strong>Retrieving data for specific reach...' +
                 '<img src="/static/nfie_data_viewer/images/ajax-loader.gif"/>' +
                 '<p>This could take a moment</p>');
    infoDiv.removeClass('hidden');

    $.ajax({
        type: 'GET',
        url: 'get-netcdf-data',
        dataType: 'json',
        data: {'comid': comid },
        error: function (jqXHR, textStatus, errorThrown) {
            infoDiv.html('<p><strong>An unknown error occurred while retrieving the data</strong></p>');
            console.log(jqXHR);
            console.log(textStatus);
            console.log(errorThrown);
            clearErrorSelection();
        },
        success: function (data) {
            if ("success" in data) {
                if ("return_data" in data) {
                    chart_data = data.return_data;
                    infoDiv.addClass('hidden');
                    plotData(chart_data);
                    plotData(convertTimeSeriesMetricToEnglish(chart_data));
                    var state = $('#units-toggle').bootstrapSwitch('state');
                    updateChart(state);
                    if (chartDiv.hasClass('hidden')) {
                        chartDiv.removeClass('hidden');
                    }
                    if (chartButtons.hasClass('hidden')) {
                        chartButtons.removeClass('hidden');
                    }
                    $(window).resize();
                }
            } else if ("error" in data) {
                infoDiv.html('<p><strong>' + data['error'] + '</strong></p>');
                infoDiv.removeClass('hidden');
                clearErrorSelection();
            } else {
                infoDiv.html('<p><strong>An unexplainable error occurred. Why? Who knows...</strong></p>');
                infoDiv.removeClass('hidden');
                clearErrorSelection();
            }
        }
    });
}

var convertTimeSeriesMetricToEnglish = function (time_series) {
    var new_time_series = [];
    var conversion_factor = 35.3146667;
    time_series.map(function (data_row) {
        var new_data_array = [data_row[0]];
        for (var i = 1; i < data_row.length; i++) {
            new_data_array.push(parseFloat((data_row[i] * conversion_factor).toFixed(5)));
        }
        new_time_series.push(new_data_array);
    });
    return new_time_series;
};

var plotData = function(data) {
    var seriesName = getSelectionName();
    var data_series = {
        name: seriesName,
        data: data,
        dashStyle: 'longdash'
    };
    nc_chart.addSeries(data_series);
    plotCounter++;
};

function updateChart(state) {
    var numSeries = nc_chart.series.length;
    var i;
    if (state == true) {
        for (i = 0; i < numSeries; i++) {
            if (i % 2 == 0) {
                showSeries(i);
            } else {
                hideSeries(i);
            }
        }
        nc_chart.yAxis[0].axisTitle.attr({
            text: "Flow (cms)"
        })
    } else {
        for (i = 0; i < numSeries; i++) {
            if (i % 2 == 0) {
                hideSeries(i);
            } else {
                showSeries(i);
            }
        }
        nc_chart.yAxis[0].axisTitle.attr({
            text: "Flow (cfs)"
        });
    }
}


function hideSeries(seriesNum) {
    var item = nc_chart.series[seriesNum];
    item.options.showInLegend = false;
    item.legendItem = null;
    nc_chart.legend.destroyItem(item);
    nc_chart.legend.render();
    nc_chart.series[seriesNum].hide();
}

function showSeries(seriesNum) {
    var item = nc_chart.series[seriesNum];
    item.options.showInLegend = true;
    nc_chart.legend.renderItem(item);
    nc_chart.legend.render();
    nc_chart.series[seriesNum].show();
}

/****************************************
 ***INTERACTIVE BUTTONS FUNCTIONALITY****
 ****************************************/

function toggleUnitsButton() {
    $('#units-toggle').bootstrapSwitch('toggleState', false);
}
//code calling this function was added to tethys gizmo button in controllers.py
function clearLastSelection() {
    if (searchOutput.children() != []) {
        searchOutput.children().last().remove()
    }
    var numSeries = nc_chart.series.length;
    if (numSeries > 0) {
        nc_chart.series[numSeries - 1].remove(); //remove cms series
        plotCounter--;
        nc_chart.series[numSeries - 2].remove(); //remove cfs series
        plotCounter--;
    }
    var numFeatures = selected_streams_layer.getSource().getFeatures().length;
    if (numFeatures > 0) {
        var lastFeature = selected_streams_layer.getSource().getFeatures()[numFeatures - 1];
        selected_streams_layer.getSource().removeFeature(lastFeature);
    }
}

function clearErrorSelection() {
    searchOutput.children().last().remove();
    var numFeatures = selected_streams_layer.getSource().getFeatures().length;
    var lastFeature = selected_streams_layer.getSource().getFeatures()[numFeatures-1];
    selected_streams_layer.getSource().removeFeature(lastFeature);
}
//code calling this function was added to tethys gizmo button in controllers.py
function clearSelections() {
    while(nc_chart.series.length > 0) {
        nc_chart.series[0].remove();
    }
    selected_streams_layer.getSource().clear();
    plotCounter = 1;
    searchOutput.html('');
}

/****************************************
 *********GLOBAL FUNCTIONALITY**********
 ****************************************/

function getSelectionName() {
    var selectionName;
    if (plotCounter % 2 == 0) {
        selectionName = "Selection " + (plotCounter / 2);
    } else {
        selectionName = "Selection " + ((plotCounter / 2) + 0.5);
    }
    return selectionName;
}