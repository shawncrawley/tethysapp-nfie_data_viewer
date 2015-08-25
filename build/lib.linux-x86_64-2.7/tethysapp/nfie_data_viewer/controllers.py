import os
import shutil
import tempfile
import operator

import requests
import netCDF4 as nc

# import numpy as np
from django.shortcuts import render
from django.http import JsonResponse
from tethys_apps.sdk.gizmos import Button, TextInput, ToggleSwitch, ButtonGroup


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

    txtLocation = TextInput(display_text='Location Search:',
                            name="txtLocation",
                            initial="",
                            disabled=False,
                            attributes="onkeypress=handle_search_key(event);")

    btnSearch = Button(display_text="Search",
                       name="btnSearch",
                       attributes="onclick=run_geocoder();",
                       style="success",
                       submit=False)

    btnClearAll = Button(display_text="Clear All Selections",
                       name="btnClearAll",
                       attributes="onclick=clearSelections();",
                       style="info",
                       submit=False)

    btnClearLast = Button(display_text="Clear Last Selection",
                       name="btnClearLast",
                       attributes="onclick=clearLastSelection();",
                       style="primary",
                       submit=False)

    clearButtons = ButtonGroup(buttons=[btnClearLast, btnClearAll], vertical=True)


    unitsToggle = ToggleSwitch(name='units-toggle',
                               on_label='Metric',
                               off_label='English',
                               on_style='success',
                               off_style='info',
                               initial=True,
                               size='large',
                               )

    # Pass variables to the template via the context dictionary
    context = {
        'txtLocation': txtLocation,
        'btnSearch': btnSearch,
        'unitsToggle': unitsToggle,
        'clearButtons': clearButtons
    }

    return render(request, 'nfie_data_viewer/home.html', context)


def start_file_download(request):
    global temp_dir, data_nc, total_comids, sorted_comids, time
    if request.method == 'GET':
        get_data = request.GET

        try:
            file_path = get_data['file_id']

            if get_data['redirect_src'] == 'iRODS':
                download = requests.get(file_path, stream=True)
            elif get_data['redirect_src'] == 'hs':
                pass
            else:
                pass

            # download the file to a temp directory
            temp_dir = tempfile.mkdtemp()
            filename = os.path.basename(file_path)
            local_file_path = os.path.join(temp_dir, filename)

            with open(local_file_path, 'wb') as fd:
                for chunk in download.iter_content(1024):
                    fd.write(chunk)

            # extract the netcdf data to be plotted
            data_nc = nc.Dataset(local_file_path, mode="r")
            qout_dimensions = data_nc.variables['Qout'].dimensions
            if qout_dimensions[0].lower() == 'comid' and qout_dimensions[1].lower() == 'time':
                sorted_comids = sorted(enumerate(data_nc.variables['COMID'][:]), key=operator.itemgetter(1))
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
            print err
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a \"GET\" request."})


def get_netcdf_data(request):
    global temp_dir, data_nc, total_comids, sorted_comids, time
    index = None
    if request.method == 'GET':
        get_data = request.GET

        try:
            comid = int(get_data['comid'])
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
            elif index is None:
                return JsonResponse({'error': "Data for this reach could not be found within the file."})

            q_out = data_nc.variables['Qout'][index].tolist()
            return_data = zip(time, q_out)
            return JsonResponse({
                "success": "Data analysis complete!",
                "return_data": return_data
            })
        except Exception, err:
            return JsonResponse({'error': err})
    else:
        return JsonResponse({'error': "Bad request. Must be a \"GET\" request."})


def delete_file(request):
    global temp_dir, data_nc

    try:
        data_nc.close()
        shutil.rmtree(temp_dir)

    except Exception, err:
        return JsonResponse({"error": err})

    return JsonResponse({"success": "File has been deleted"})
