#!/usr/bin/env python
from os.path import dirname, abspath, join as pjoin
from notebook.nbextensions import install_nbextension, enable_nbextension
from notebook.serverextensions import toggle_serverextension_python

def install_nbext():
    print("Installing nbextension ...")
    c2cdir = pjoin(dirname(abspath(__file__)), 'nbext')
    install_nbextension(c2cdir, user=True, destination='cite2c')

def enable_nbext():
    print("Enabling the nbextension ...")
    enable_nbextension('notebook', 'cite2c/main', user=True)

def enable_server_ext():
    print("Enabling the server extension ...")
    toggle_serverextension_python('cite2c.handlers', enabled=True, user=True)

def main():
    install_nbext()
    enable_nbext()
    enable_server_ext()
    print("Done.")

if __name__ == '__main__':
    main()
