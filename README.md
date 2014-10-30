Live citations in IPython notebooks

This consists of two main components:
- UI for finding citations from a Zotero library and inserting them into Markdown cells.
- Code to run [citeproc-js](https://bitbucket.org/fbennett/citeproc-js/wiki/Home) when a Markdown cell is rendered, rendering both bibliographies and inline citations.

To try it, symlink this directory to `~/.ipython/nbextensions/cite2c`, and load the Sample notebook.