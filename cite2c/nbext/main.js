requirejs.config({
    shim: {
        'nbextensions/cite2c/xmldom': {
            deps: [],
            exports: "CSL_CHROME"
        },
        'nbextensions/cite2c/citeproc': {
            deps: ['nbextensions/cite2c/xmldom'],
            exports: "CSL"
        },
        'nbextensions/cite2c/typeahead.bundle.min': {
            deps: ['jquery'],
            exports: "Bloodhound"  // Doesn't actually work, because of the shenanigans typeahead does
        }
    }
});

define(['jquery',
        'base/js/dialog',
        'base/js/utils',
        'services/config',
        'nbextensions/cite2c/rendering',
        'nbextensions/cite2c/typeahead.bundle.min',
       ],
function($, dialog, utils, configmod, rendering) {
    "use strict";

    // There are two different jQuery typeahead plugins. This code uses one,
    // and the command palette uses the other. They both add the .typeahead()
    // method to jQuery objects. .noConflict() replaces the twitter .typeahead()
    // method we loaded with the jquery-typeahead one the command palette needs.
    // Then we reattach ours as .twitter_typeahead() so we can use it below.
    // Namespaces, anyone?
    $.fn.twitter_typeahead = $.fn.typeahead.noConflict();
    
    var make_author_string = function(authors) {
        // Make a simple string of the author surnames, to show in the
        // typeahead dropdown
        var surname = function(auth) { return auth.family || "?"; };
        if (!authors)  return "";
        switch (authors.length) {
            case 0:
                return "";
            case 1:
                return surname(authors[0]);
            case 2:
                return surname(authors[0]) + " & " + surname(authors[1]);
            default:
                return surname(authors[0]) + " et al.";
        }
    };
    
    
    var csl_tokenize = function(item) {
        // Turn a CSL JSON object into an array of word tokens for Bloodhound
        var tokens = [];
        function add_splitted(value) {
            if (value) tokens = tokens.concat(value.toString().split(/\s+/));
        }
        
        add_splitted(item.title);

        if (item.author) {
            for (var i=0; i < item.author.length; i++) {
                add_splitted(item.author[i].family);
                add_splitted(item.author[i].literal);
            }
        }
        
        if (item.issued) {
            if (item.issued['date-parts'])
                add_splitted(item.issued['date-parts'][0]);
            add_splitted(item.issued.year);
        }
        return tokens;
    };
    
    var get_metadata_items = function() {
        // Get an array of citations from the metadata.
        var items = (IPython.notebook.metadata.cite2c || {}).citations || {};
        return $.map(items, function(obj, id) {return obj;});  // Flatten to array
    };
    
    var config = new configmod.ConfigSection('cite2c',
                                    {base_url: utils.get_body_data("baseUrl")});
    config.load();
    
    function get_zotero_access() {
        // Get the Zotero user ID, either from config, or by prompting the user
        // with a dialog. Returns a promise which resolves to the user ID.
        return config.loaded.then(function() {
            var zotero = (config.data.zotero || {});
            if (zotero.user_id && zotero.access_token) {
                return zotero;
            }

            var dialog_body = $("<div/>").append(
                "<p>Opened a new tab to authenticate with Zotero. " +
                "Once you have done this, please click OK.</p>");

            // Open a new tab for the user to authorize cite2c on Zotero.
            window.open(utils.url_path_join(utils.get_body_data("baseUrl"),
                'cite2c/zotero_oauth'));
            
            return new Promise(function(resolve, reject) {
                var clicked_ok = false;
                dialog.modal({
                    notebook: IPython.notebook,
                    keyboard_manager: IPython.keyboard_manager,
                    title : "Zotero User ID",
                    body : dialog_body,
                    open: function() {
                        var that = $(this);
                        that.find('form').submit(function () {
                            that.find('.btn-primary').first().click();
                            return false;
                        });
                    },
                    buttons : {
                        "Cancel" : {
                            click : function() { reject("Dialog cancelled"); }
                        },
                        "OK" : {
                            class : "btn-primary",
                            click: function() { clicked_ok = true; }
                        }
                    }
                }).on("hidden.bs.modal", function () {
                    // Sigh. Because this ends up showing another dialog, if we
                    // do it in the click handler, there's a race condition with
                    // enabling/disabling the notebook keyboard shortcuts, which
                    // leads to the shortcuts being active while the second
                    // dialog is open. Waiting for this hidden event and doing
                    // setTimeout should be enough to avoid the race.
                    if (clicked_ok) {
                        setTimeout(function () {
                            config.load().then(function (data) {
                                resolve(data.zotero);
                                console.log("Authenticated Zotero user ID " + data.zotero.user_id);
                            });
                        }, 0);
                    }
                });
            });
        });
    }
    
    var zot_bh_engine;
    
    function get_zot_bh_engine() {
        // Retrieve the existing Bloodhound engine for Zotero, or initialise a
        // new one. Returns a promise which resolves to the Bloodhound instance.
        // May prompt the user for their Zotero ID.
        if (zot_bh_engine) {
            // Engine already exists; resolve promise once it's initialised.
            return new Promise(function(resolve, reject) {
                zot_bh_engine.initialize()
                    .done(function() { resolve(zot_bh_engine); })
                    .fail(reject);
            });
        }
        
        return get_zotero_access().then(function(zotero_info) {
            zot_bh_engine = new Bloodhound({
                name: 'zotero',
                datumTokenizer: csl_tokenize,
                queryTokenizer: Bloodhound.tokenizers.whitespace,
                limit: 10,
                dupDetector: function(remoteMatch, localMatch) { return remoteMatch.id === localMatch.id; },
                local: get_metadata_items,
                remote: {
                    url: "https://api.zotero.org/users/"+zotero_info.user_id+"/items?v=3&limit=10&format=csljson&q=%QUERY",
                    filter: function(result) { return result.items; },
                    ajax: {
                        accepts: "application/vnd.citationstyles.csl+json",
                        dataType: "json",
                        headers: {
                            "Zotero-API-Key": zotero_info.access_token
                        }
                    }
                }
            });
            return new Promise(function(resolve, reject) {
                zot_bh_engine.initialize()
                    .done(function() { resolve(zot_bh_engine); })
                    .fail(reject);
            });
        });
    }
    
    var store_citation = function(id, citation) {
        // Store citation data to notebook metadata & BH search index
        var metadata = IPython.notebook.metadata;
        if (!metadata.cite2c) metadata.cite2c = {};
        if (!metadata.cite2c.citations) metadata.cite2c.citations = {};
        if (!(id in metadata.cite2c.citations)) {
            metadata.cite2c.citations[id] = citation;
            zot_bh_engine.add(citation);
        }
    };
    
    function insert_citn() {
        // Show the user a dialog to choose and insert a citation
        var cell = IPython.notebook.get_selected_cell();
        
        var entry_box = $('<input type="text"/>');
        var dialog_body = $("<div/>")
                    .append($("<p/>").text("Start typing below to search Zotero"))
                    .append($('<form/>').append(entry_box));
        dialog_body.addClass("cite2c-dialog");

        get_zot_bh_engine().then(function(zot_bh_engine) {
            // Set up typeahead.js to search Zotero
            entry_box.twitter_typeahead({
              minLength: 3,
              hint: false,
              highlight: true,
            },
            {
              name: 'zotero',
              source: zot_bh_engine.ttAdapter(),
              displayKey: function(value) { return value.title || "Mystery item with no title"; },
              templates: {
                  empty: "No matches",
                  suggestion: function(value) {
                      //console.log(value);
                      return "<div>"+value.title+"</div>" +
                        '<div style="float: right; color: #888;">' + (value.type || "?") + "</div>" +
                        "<div><i>"+ make_author_string(value.author) + "</i></div>";
                  }
              }
            });
            
            entry_box.on('typeahead:selected', function(ev, suggestion, dataset) {
                entry_box.data("csljson", suggestion);
            });
            
            // Display dialog
            dialog.modal({
                notebook: IPython.notebook,
                keyboard_manager: IPython.keyboard_manager,
                title : "Insert citation",
                body : dialog_body,
                open: function() {
                    // Submit on pressing enter
                    var that = $(this);
                    that.find('form').submit(function () {
                        that.find('.btn-primary').first().click();
                        return false;
                    });
                    entry_box.focus();
                },
                buttons : {
                    "Cancel" : {},
                    "Insert" : {
                        "class" : "btn-primary",
                        "click" : function() {
                            // Retrieve the selected citation, add to metadata,
                            // and insert an HTML tag for it.
                            var citation = entry_box.data("csljson");
                            if (!citation) {return;}
                            var id = citation.id;
                            delete citation.id;
                            store_citation(id, citation);
                            var citn_html = '<cite data-cite="' + id + '"></cite>';
                            cell.code_mirror.replaceSelection(citn_html);
                        }
                    }
                }
            });
        });
    }
    
    var insert_biblio = function() {
        // Insert HTML tag for bibliography
        var cell = IPython.notebook.get_selected_cell();
        cell.code_mirror.replaceSelection('<div class="cite2c-biblio"></div>');
    };
    
    var toolbar_buttons = function () {
        // Add toolbar buttons to insert citations and bibliographies
        if (!Jupyter.toolbar) {
            $([Jupyter.events]).on("app_initialized.NotebookApp", toolbar_buttons);
            return;
        }

        Jupyter.actions.register({
            icon: 'fa-mortar-board',
            help: 'Insert a citation',
            help_index: 'za',
            handler: insert_citn
        }, 'insert-citation', 'cite2c');
        Jupyter.actions.register({
            icon: 'fa-list',
            help: 'Insert bibliography',
            help_index: 'zb',
            handler: insert_biblio,
        }, 'insert-biblio', 'cite2c');

        Jupyter.toolbar.add_buttons_group([
            {
              'label' : 'Cite',
              'action' : 'cite2c:insert-citation'
            },
            'cite2c:insert-biblio'
        ], 'cite2c-buttons');
    };

    function load_ipython_extension() {
        toolbar_buttons();
        rendering.init_rendering();
	$('head').append(
	    $('<link>')
		.attr('rel','stylesheet')
		.attr('type','text/css')
		.attr('href', utils.url_path_join(utils.get_body_data("baseUrl"),
						  'nbextensions/cite2c/styles.css'))
	);
    }

    return {load_ipython_extension: load_ipython_extension};
});
