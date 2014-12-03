from os.path import dirname, abspath, join as pjoin
from IPython.html.nbextensions import install_nbextension
from IPython.html.services.config import ConfigManager

print("Installing nbextension ...")
c2cdir = pjoin(dirname(abspath(__file__)), 'cite2c')
install_nbextension([c2cdir])

print("Enabling the extension ...")
cm = ConfigManager()
cm.update('notebook', {"load_extensions": {"cite2c/main": True}})

print("Done.")
