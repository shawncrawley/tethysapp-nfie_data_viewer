#NFIE Data Viewer
*tethysapp-nfie_data_viewer*

**This app is created to run in the Teyths Platform programming environment.
See: https://github.com/CI-WATER/tethys and http://docs.tethys.ci-water.org**

##Prerequisites:
- Tethys Platform (CKAN, PostgresQL, GeoServer)
- hs_restclient-python (python library)
- netCDF4-python (Python package)

###Install hs_restclient:
See: http://hs-restclient.readthedocs.org/en/latest/#installation

###Install netCDF4-python on Ubuntu:
```
$ sudo apt-get install python-dev zlib1g-dev libhdf5-serial-dev libnetcdf-dev
$ sudo su
$ . /usr/lib/tethys/bin/activate
$ pip install numpy
$ pip install netCDF4
$ exit
```
###Install netCDF4-python on Redhat:
*Note: this app was desgined and tested in Ubuntu*
```
$ yum install netcdf4-python
$ yum install hdf5-devel
$ yum install netcdf-devel
$ pip install numpy
$ pip install netCDF4
```
##Installation:
Clone the app into the directory you want:
```
$ git clone https://github.com/shawncrawley/tethysapp-nfie_data_viewer.git
$ cd tethysapp-nfie_data_viewer
```
Then install the app in Tethys Platform.

###Installation for App Development:
```
$ . /usr/lib/tethys/bin/activate
$ cd tethysapp-nfie_data_viewer
$ python setup.py develop
```
###Installation for Production:
```
$ . /usr/lib/tethys/bin/activate
$ cd tethysapp-nfie_data_viewer
$ python setup.py install
$ tethys manage collectstatic
```
Restart the Apache Server:
See: http://docs.tethys.ci-water.org/en/1.1.0/production/installation.html#enable-site-and-restart-apache

##Updating the App:
Update the local repository and Tethys Platform instance.
```
$ . /usr/lib/tethys/bin/activate
$ cd tethysapp-nfie_data_viewer
$ git pull
```
Restart the Apache Server:
See: http://tethys-platform.readthedocs.org/en/1.0.0/production.html#enable-site-and-restart-apache