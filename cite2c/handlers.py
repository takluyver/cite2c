import glob
import json
import os
from notebook.utils import url_path_join as ujoin
from tornado.web import StaticFileHandler, RequestHandler

def find_zotero_styles_dir():
    pattern = os.path.expanduser('~/.zotero/zotero/*/zotero/styles/')
    candidates = glob.glob(pattern)
    if not candidates:
        return None
    for c in candidates:
        if '.default' in c:
            return c
    return candidates[0]

class ListStylesHandler(RequestHandler):
    def initialize(self, path):
        self.path = path

    def get(self):
        files = [f for f in os.listdir(self.path) if f.endswith('.csl')]
        self.finish(json.dumps(files))

def load_jupyter_server_extension(nbapp):
    zsd = find_zotero_styles_dir()
    if not zsd:
        nbapp.log.warning('Could not find Zotero citation styles directory.')
        return

    webapp = nbapp.web_app
    base_url = webapp.settings['base_url']
    webapp.add_handlers(".*$", [
        (ujoin(base_url, r"/cite2c/styles/?"), ListStylesHandler, 
            {'path': zsd}),
        (ujoin(base_url, r"/cite2c/styles/(.+)"), StaticFileHandler, 
            {'path': zsd}),
    ])
