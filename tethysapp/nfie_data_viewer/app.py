from tethys_apps.base import TethysAppBase, url_map_maker


class NFIEDataViewer(TethysAppBase):
    """
    Tethys app class for NFIE Data Viewer.
    """

    name = 'NFIE Data Viewer'
    index = 'nfie_data_viewer:home'
    icon = 'nfie_data_viewer/images/icon.gif'
    package = 'nfie_data_viewer'
    root_url = 'nfie-data-viewer'
    color = '#e74c3c'
        
    def url_maps(self):
        """
        Add controllers
        """
        UrlMap = url_map_maker(self.root_url)

        url_maps = (UrlMap(name='home',
                           url='nfie-data-viewer',
                           controller='nfie_data_viewer.controllers.home'),
                    UrlMap(name='get_netcdf_data_ajax',
                           url='nfie-data-viewer/get-netcdf-data',
                           controller='nfie_data_viewer.controllers.get_netcdf_data'),
                    UrlMap(name='start_file_download_ajax',
                           url='nfie-data-viewer/start-file-download',
                           controller='nfie_data_viewer.controllers.start_file_download'),
                    UrlMap(name='delete_file_ajax',
                           url='nfie-data-viewer/delete-file',
                           controller='nfie_data_viewer.controllers.delete_file')
                    )

        return url_maps
