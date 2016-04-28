#!/usr/bin/env python
from os.path import dirname, abspath, join as pjoin
from notebook.nbextensions import install_nbextension
from notebook.services.config import ConfigManager

print("Installing nbextension ...")
c2cdir = pjoin(dirname(abspath(__file__)), 'nbext')
install_nbextension(c2cdir, user=True, destination='cite2c')

print("Enabling the extension ...")
cm = ConfigManager()
cm.update('notebook', {"load_extensions": {"cite2c/main": True}})

print("Done.")
