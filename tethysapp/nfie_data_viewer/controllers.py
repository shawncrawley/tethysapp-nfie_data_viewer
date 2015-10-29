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
temp_dir = ''
data_nc = None
total_comids = 0
sorted_comids = None
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
    global temp_dir, data_nc, total_comids, sorted_comids, time
    if request.method == 'GET':
        get_data = request.GET

        try:
            file_path = get_data['res_id']
            temp_dir = tempfile.mkdtemp()

            if get_data['src'] == 'iRODS':
                download = requests.get(file_path, stream=True)
                filename = os.path.basename(file_path)
                local_file_path = os.path.join(temp_dir, filename)
                with open(local_file_path, 'wb') as fd:
                    for chunk in download.iter_content(1024):
                        fd.write(chunk)
                data_nc = nc.Dataset(local_file_path, mode="r")

            elif get_data['src'] == 'hs':
                auth = HydroShareAuthBasic(username='username', password='*****')
                hs = HydroShare(auth=auth, hostname="playground.hydroshare.org", use_https=False)
                resource_data = hs.getSystemMetadata(file_path)
                filename = resource_data['resource_title']
                # this will only work if there is only one file in the resource and if
                # the resource title is the same as filename
                hs.getResourceFile(file_path, filename, destination=temp_dir)
                local_file_path = temp_dir + "/" + filename
                data_nc = nc.Dataset(local_file_path, mode="r")
            else:
                this_script_path = inspect.getfile(inspect.currentframe())
                testfile_path = this_script_path.replace('controllers.py', 'public/data/test.nc')
                data_nc = nc.Dataset(testfile_path, mode="r")

            # extract the netcdf data to be plotted
            qout_dimensions = data_nc.variables['Qout'].dimensions
            if qout_dimensions[0].lower() == 'comid' and qout_dimensions[1].lower() == 'time':
                sorted_comids = sorted(enumerate(data_nc.variables['COMID'][:]), key=lambda comid: comid[1])
                total_comids = len(data_nc.variables['COMID'][:])
            else:
                return JsonResponse({'error': "Invalid netCDF file"})
            variables = data_nc.variables.keys()
            if 'time' in variables:
                time = [t * 1000 for t in data_nc.variables['time'][:]]
            else:
                return JsonResponse({'error': "Invalid netCDF file"})
            return JsonResponse({'success': "The file is ready to go."})
        except Exception, err:
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a GET request."})


def get_netcdf_data(request):
    global temp_dir, data_nc, total_comids, sorted_comids, time
    if request.method == 'GET':
        get_data = request.GET
        return_data = []

        try:
            comids = str(get_data['comids'])
            comids = comids.split(',')

            for comid in comids:
                index = None
                comid = int(comid)
                divider = 2
                guess = total_comids / divider
                while (total_comids / divider > 10) and (comid != sorted_comids[guess][1]):
                    divider *= 2
                    if comid > sorted_comids[guess][1]:
                        guess += total_comids / divider
                    else:
                        guess -= total_comids / divider

                guess = int(guess)

                iteration = 0
                if comid == sorted_comids[guess][1]:
                    index = sorted_comids[guess][0]
                    iteration = 1
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
                    q_out = data_nc.variables['Qout'][index].tolist()
                elif ((index is None) or (iteration == 1)) and (len(comids) == 1):
                    return JsonResponse({'error': "Data for this reach could not be found within the file."})
                else:
                    q_out = [-9999]

                return_data.append({str(comid): zip(time, q_out)})

            return JsonResponse({
                "success": "Data analysis complete!",
                "return_data": json.dumps(return_data)
            })
        except Exception, err:
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a GET request."})


def delete_file(request):
    global temp_dir, data_nc

    try:
        data_nc.close()
        shutil.rmtree(temp_dir)

    except Exception, err:
        return JsonResponse({"error": err})

    return JsonResponse({"success": "File has been deleted"})
