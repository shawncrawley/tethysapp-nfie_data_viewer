import os
import json
import shutil
import tempfile
import inspect
import requests
import netCDF4 as nc
from hs_restclient import HydroShare, HydroShareAuthBasic
from django.shortcuts import render
from django.http import JsonResponse
from tethys_apps.sdk.gizmos import Button, TextInput, ToggleSwitch, ButtonGroup, RangeSlider

#######GLOBAL VARIABLES#########
temp_dir = None
prediction_data = None
rp_data = None
total_prediction_comids = 0
total_rp_comids = 0
sorted_prediction_comids = None
sorted_rp_comids = None
time = None
################################


def home(request):
    """
    Controller for the app home page.
    """

    btnClearAll = Button(display_text="Remove All",
                         name="btnClearAll",
                         attributes="onclick=removeAllSelections(); id=clearAll",
                         style="danger",
                         classes="btn-xs",
                         submit=False)

    btnClearLast = Button(display_text="Remove Last",
                          name="btnClearLast",
                          attributes="onclick=removeLastSelection(); id=clearLast",
                          style="warning",
                          classes="btn-xs",
                          submit=False)

    btnAnimateSelections = Button(display_text="Animate Selections",
                                  name="btnAnimateFlow",
                                  attributes="onclick=showAnimationTools();",
                                  style="success",
                                  classes="btn-xs",
                                  submit=False)

    btnSelectView = Button(display_text="Select View",
                           name="btnSelectView",
                           attributes="onclick=selectView(); id=btnSelectView",
                           classes="hidden btn-xs",
                           style="warning",
                           submit=False)

    btnRemoveSelection = Button(display_text="Remove on Click",
                         name="btnRemoveSelection",
                         attributes="onclick=removeSelection(); id=btnRemoveSelection",
                         style="default",
                         classes="btn-xs",
                         submit=False)

    btnZoomToSelections = Button(display_text="Zoom to Selections",
                         name="btnZoomToSelections",
                         attributes="onclick=zoomToSelection(); id=btnZoomToSelections",
                         style="info",
                         classes="btn-xs",
                         submit=False)

    removeButtons = ButtonGroup(buttons=[btnRemoveSelection, btnClearLast, btnClearAll], vertical=False)
    viewButtons = ButtonGroup(buttons=[btnAnimateSelections, btnZoomToSelections], vertical=False)

    sldrAnimate = RangeSlider(name='sldrAnimate',
                              attributes="id=sldrAnimate",
                              min=1,
                              max=5,
                              initial=3,
                              step=1)

    unitsToggle = ToggleSwitch(name='units-toggle',
                               on_label='Metric',
                               off_label='English',
                               on_style='success',
                               off_style='danger',
                               initial=True,
                               size='large',
                               )

    riversToggle = ToggleSwitch(display_text='NHD Streams Layer',
                                name='rivers-toggle',
                                on_label='On',
                                off_label='Off',
                                on_style='success',
                                off_style='danger',
                                initial=True,
                                size='mini')

    labelsToggle = ToggleSwitch(display_text='Selection Labels',
                                name='labels-toggle',
                                on_label='On',
                                off_label='Off',
                                on_style='success',
                                off_style='danger',
                                initial=True,
                                size='mini')

    # Pass variables to the template via the context dictionary
    context = {
        'removeButtons': removeButtons,
        'sldrAnimate': sldrAnimate,
        'unitsToggle': unitsToggle,
        'riversToggle': riversToggle,
        'labelsToggle': labelsToggle,
        'btnSelectView': btnSelectView,
        'viewButtons': viewButtons
    }

    return render(request, 'nfie_data_viewer/home.html', context)


def start_file_download(request):
    global temp_dir, prediction_data, rp_data, total_prediction_comids, total_rp_comids, sorted_prediction_comids, \
        sorted_rp_comids, time
    if request.method == 'GET':
        get_data = request.GET
        this_script_path = inspect.getfile(inspect.currentframe())
        try:
            if get_data['res_id'] is not None:
                temp_dir = tempfile.mkdtemp()
                file_path = get_data['res_id']

            if get_data['src'] == 'iRODS':
                download = requests.get(file_path, stream=True)
                filename = os.path.basename(file_path)
                local_file_path = os.path.join(temp_dir, filename)
                with open(local_file_path, 'wb') as fd:
                    for chunk in download.iter_content(1024):
                        fd.write(chunk)
                prediction_data = nc.Dataset(local_file_path, mode="r")

            elif get_data['src'] == 'hs':
                auth = HydroShareAuthBasic(username='username', password='*****')
                hs = HydroShare(auth=auth, hostname="playground.hydroshare.org", use_https=False)
                resource_data = hs.getSystemMetadata(file_path)
                filename = resource_data['resource_title']
                # this will only work if there is only one file in the resource and if
                # the resource title is the same as filename
                hs.getResourceFile(file_path, filename, destination=temp_dir)
                local_file_path = temp_dir + "/" + filename
                prediction_data = nc.Dataset(local_file_path, mode="r")
            else:
                testfile_path = this_script_path.replace('controllers.py', 'public/data/test.nc')
                prediction_data = nc.Dataset(testfile_path, mode="r")

            # Sort the RAPID netCDF file by COMID
            qout_dimensions = prediction_data.variables['Qout'].dimensions
            if qout_dimensions[0].lower() == 'comid' and qout_dimensions[1].lower() == 'time':
                sorted_prediction_comids = sorted(enumerate(prediction_data.variables['COMID'][:]),
                                                  key=lambda comid: comid[1])
                total_prediction_comids = len(sorted_prediction_comids)
            else:
                return JsonResponse({'error': "Invalid netCDF file"})
            variables = prediction_data.variables.keys()
            if 'time' in variables:
                time = [t * 1000 for t in prediction_data.variables['time'][:]]
            else:
                return JsonResponse({'error': "Invalid netCDF file"})

            rp_data_path = this_script_path.replace('controllers.py', 'public/data/return_period_data.nc')
            rp_data = nc.Dataset(rp_data_path, mode="r")
            sorted_rp_comids = sorted(enumerate(rp_data.variables['COMID'][:]), key=lambda comid: comid[1])
            total_rp_comids = len(sorted_rp_comids)
            return JsonResponse({'success': "The file is ready to go."})
        except Exception, err:
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a GET request."})


def get_netcdf_data(request):
    global temp_dir, prediction_data, rp_data, total_prediction_comids, total_rp_comids, sorted_prediction_comids, \
        sorted_rp_comids, time
    if request.method == 'GET':
        get_data = request.GET
        ts_pairs_data = {}  # For time series pairs data
        rp_cls_data = {}  # For return period classification data
        rp_bmk_data = {}  # For return period benchmark data
        try:
            comids = str(get_data['comids'])
            comids = comids.split(',')
            for comid_iter in comids:
                comid = int(comid_iter)
                prediction_file_index = match_comid_algorithm(comid, total_prediction_comids, sorted_prediction_comids)
                if prediction_file_index == -1:
                    if len(comids) == 1:
                        return JsonResponse({'error': "Data for this reach could not be found within the file."})
                    else:
                        q_out = [-9999]
                else:
                    q_out = prediction_data.variables['Qout'][prediction_file_index].tolist()
                rp_file_index = match_comid_algorithm(comid, total_rp_comids, sorted_rp_comids)
                rp_benchmarks = []
                if rp_file_index != -1:
                    rp_benchmarks.append(rp_data.variables['return_period_2'][rp_file_index])
                    rp_benchmarks.append(rp_data.variables['return_period_10'][rp_file_index])
                    rp_benchmarks.append(rp_data.variables['return_period_20'][rp_file_index])
                else:
                    rp_benchmarks.append(-9999)
                    rp_benchmarks.append(-9999)
                    rp_benchmarks.append(-9999)
                rp_classification = []
                for q in q_out:
                    if q == -9999:
                        rp_classification.append(-9999)
                    elif q < rp_benchmarks[0]:
                        rp_classification.append(0)
                    elif q < rp_benchmarks[1]:
                        rp_classification.append(2)
                    elif q < rp_benchmarks[2]:
                        rp_classification.append(10)
                    else:
                        rp_classification.append(20)
                ts_pairs_data[str(comid)] = zip(time, q_out)
                rp_cls_data[str(comid)] = rp_classification
                rp_bmk_data[str(comid)] = rp_benchmarks
            return JsonResponse({
                "success": "Data analysis complete!",
                "ts_pairs_data": json.dumps(ts_pairs_data),
                "rp_cls_data": json.dumps(rp_cls_data),
                "rp_bmk_data": json.dumps(rp_bmk_data)
            })
        except Exception, err:
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a GET request."})


def delete_file(request):
    global temp_dir, prediction_data

    try:
        if prediction_data is not None:
            prediction_data.close()
        if temp_dir is not None:
            shutil.rmtree(temp_dir)

    except Exception, err:
        return JsonResponse({"error": err})

    return JsonResponse({"success": "File has been deleted"})


def match_comid_algorithm(comid, count_comids, sorted_comids):
    index = None
    divider = 2
    guess = count_comids / divider
    while (count_comids / divider > 10) and (comid != sorted_comids[guess][1]):
        divider *= 2
        if comid > sorted_comids[guess][1]:
            guess += count_comids / divider
        else:
            guess -= count_comids / divider
    guess = int(guess)
    iteration = 0
    if comid == sorted_comids[guess][1]:
        index = sorted_comids[guess][0]
        return index
    elif comid > sorted_comids[guess][1]:
        while (sorted_comids[guess][1] != comid) and (iteration < 100):
            guess += 1
            iteration += 1
    else:
        while (sorted_comids[guess][1] != comid) and (iteration < 100):
            guess -= 1
            iteration += 1
    if (index is None) and (iteration < 100):
        index = sorted_comids[guess][0]
        return index
    else:
        return -1
