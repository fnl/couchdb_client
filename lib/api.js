var util = require('util'),
    slice = Array.prototype.slice,
    helpers = require('./helpers'),
    client = require('./client');
    CouchClient = client.CouchClient;
    HttpError = client.HttpError;

module.exports = {
  CouchAPI: CouchAPI,
  Server: Server,
  Database: Database,
  View: View,
  List: List,
  Show: Show,
  Update: Update,
};

// COUCH API ==================================================================

/**
 * Create a new CouchAPI instance.
 *
 * Uses the same arguments as CouchClient, but extends it to make calls of
 * the form <code>callback(err, result)</code> instead of the complicated
 * default http.request pattern using "var req = http.request(callback)" with
 * your callback accepting the response object.
 *
 * <p>About Error Handling</p>
 *
 * <p>The errors reported to the callbacks can be of any nature, from socket to
 * request errors, from response to HTTP errors, and from encoding to JSON
 * errors. Essentially, if anything goes wrong, error will be set and the
 * second value should be use purely informative, eg., for logging or debugging.
 *
 * If the response code would be >= 300 (after redirecting), the callback error
 * will be a HttpError object. If you need to debug headers, look at
 * CouchAPI#raw, that gives you access to the headers.
 * 
 * The only errors <i>thrown</i> by the API are TypeErrors, if you send the
 * wrong arguments to one of the API's methods.</p>
 *
 * @see HttpError
 * @constructor
 * @param {String} url the URL string to connect to; optional
 * @param {Object} headers default headers to use; optional
 * @augments CouchClient
 * @author &copy; <a href="mailto:florian.leitner@gmail.com">Florian Leitner</a>
 */

function CouchAPI (url, headers) {
  if (!(this instanceof CouchAPI)) {
    return new CouchAPI(url, headers);
  }

  CouchClient.apply(this, slice.call(arguments));
}

util.inherits(CouchAPI, CouchClient);
CouchAPI.max_redirects = 15;

/**
 * Make a request to CouchDB, buffering the data and emitting JSON.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

CouchAPI.prototype.json = function (options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (typeof callback !== 'function') callback = function () {};

  this._json(options, callback);
};

CouchAPI.prototype._json = function (options, callback) {
  this._string(options, function (error, data) {
    try {
      callback(error, JSON.parse(data));
    } catch (e) {
      if (error) {
        callback(error, data);
      } else {
        callback(e, data);
      }
    }
  });
}

/**
 * Make a request to CouchDB, buffering the data and emitting a string.
 *
 * The options may have an additional encoding property that can be set
 * to any string <code>Buffer#toString</code> (node.js) can accept as argument.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback that accepts "error, string"; optional
 */

CouchAPI.prototype.string = function (options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof callback !== 'function') callback = function () {};

  this._string(options, callback);
};

CouchAPI.prototype._string = function (options, callback) {
  this._raw(options, function (error, buffer) {
    if (buffer && !Buffer.isBuffer(buffer)) {
      if (error) {
	callback(error, buffer);
      } else {
	callback(new Error('not a buffer'), buffer);
      }
    } else {
      callback(error, buffer ? buffer.toString(options.encoding) : null);
    }
  });
}

/**
 * Make a request to CouchDB, buffering the data and emitting a Buffer.
 *
 * As opposed to the other CouchAPI methods, the callback will receive a third
 * parameter that contains the <code>headers</code> of the response, with the
 * headers as lower-case properties. These headers are only present if the
 * response ended cleanly, ie., even when a HttpError occurred.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback that accepts "error, buffer, headers"; optional
 */

CouchAPI.prototype.raw = function (options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof callback !== 'function') callback = function () {};
  this._raw(options, callback);
}

CouchAPI.prototype._raw = function (options, callback) {
  // all CouchAPI-based requests are routed through here
  var request, response_callback;

  response_callback = helpers.redirectCallback(
    options.method || 'GET',
    rawCallback(callback, options, this._redirect.bind(this))
  );

  request = this.request(options, response_callback);
  request.on('error', function (error) { callback(error, null) });
  request.end();
};

function rawCallback(callback, options, redirect_callback) {
  return function (url, response) {
    if (url) {
      redirect_callback(url, options, callback);
    } else {
      helpers.readResponse(HttpError, response, callback); 
    }
  }
}

// redirect handler
CouchAPI.prototype._redirect = function (url, options, callback) {
  var api = new CouchAPI(url, this.getHeaders());

  api._redirects = this._redirects ? this._redirects + 1 : 1;

  if (api._redirects > CouchAPI.max_redirects) {
    callback(Error('too many redirects'));
  } else {
    api.raw({
      method: options.method,
      query: options.query,
      headers: options.headers,
    }, callback);
  }
};

// SERVER API =================================================================

/**
 * A CouchAPI client with Server-specific methods.
 *
 * @constructor
 * @augments CouchAPI
 */

function Server(url, headers) {
  if (!(this instanceof Server)) {
    return new Server(url, headers);
  }

  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
}

util.inherits(Server, CouchAPI);

/**
 * Instantiate a new Database client.
 *
 * @function
 * @param {String} database name (will be URL-encoded)
 * @type Database
 */

Server.prototype.database = function (db) {
  // putting db into an Array to ensure its set and a string
  return new Database(this._resource([db]), this.getHeaders());
};

/**
 * Check the server (if called w/o a DB name) or a database.
 * 
 * Returns <code>true</code> only if the response to a HEAD request has
 * a success status code (2xx). Ie., if <code>false</code>, that might be
 * because of connection problems, too.
 *
 * @function
 * @param {String} db name (will be URL-encoded); optional
 * @param {Function} callback that accepts "boolean"; optional
 */

Server.prototype.exists = function (db, callback) {
  if (typeof db === 'string') {
    db = encodeURIComponent(db);
  }
  helpers.existsPattern.call(this, db, callback);
};

/**
 * Create a database.
 *
 * @function
 * @param {String} name of the database; required
 * @param {Function} callback that accepts "error, json"; optional
 */

Server.prototype.create = function (name, callback) {
  this._db('PUT', name, callback);
};

/**
 * Destroy a database.
 *
 * @function
 * @param {String} name of the database; required
 * @param {Function} callback that accepts "error, json"; optional
 */

Server.prototype.destroy = function (name, callback) {
  this._db('DELETE', name, callback);
};

// Server#create,destroy helper
Server.prototype._db = function (method, name, callback) {
  if (typeof callback !== 'function') callback = function () {};
  this._json({ method: method, path: encodeURIComponent(name) }, callback);
};
            
// DATABASE API ===============================================================

/**
 * A CouchAPI client with Database-specific methods.
 *
 * @constructor
 * @augments CouchAPI
 */

function Database(url, headers) {
  if (!(this instanceof Database)) {
    return new Database(url, headers);
  }

  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
  var name = this.options.path.split('/');
  this.name = decodeURIComponent(name[~-name.length]);
}

util.inherits(Database, CouchAPI);

/**
 * Instantiate a new client for a view function.
 *
 * @function
 * @param {String} name as "ddoc_id/view_name"
 * @type View
 */

Database.prototype.view = function (name) {
  return this._design(View, name);
};

/**
 * Instantiate a new client for a show function.
 *
 * @function
 * @param {String} name as "ddoc_id/show_name"
 * @type Show
 */

Database.prototype.show = function (name) {
  return this._design(Show, name);
};

/**
 * Instantiate a new client for a list function.
 *
 * @function
 * @param {String} name as "ddoc_id/list_name"
 * @type List
 */

Database.prototype.list = function (name) {
  return this._design(List, name);
};

/**
 * Instantiate a new client for an update function.
 *
 * @function
 * @param {String} name as "ddoc_id/update_name"
 * @type Update
 */

Database.prototype.update = function (name) {
  return this._design(Update, name);
};

// Database#view,show,list,update helper
Database.prototype._design = function (type, name) {
  name = name.split('/');
  var ddoc = name[0],
      name = name.splice(1).join('/');
  return new type(this._resource('_design', ddoc, type._name, name),
                  this.getHeaders());
};

/**
 * Save a regular, local, or design document to the database.
 *
 * If the save succeeded, the document's <code>_rev</code> is updated. If the
 * document had no <code>_id</code>, that is set on the document, too.
 *
 * <p>Regular documents do not need to have an ID, other documents must have
 * it set (eg, to '_design/your_ddoc_id') and document IDs may contain any
 * characters that are valid from the CouchDB perspective (they are URL-
 * encoded, and the only restriction by this client is that regular
 * documents starting with an underscore may not have slashes - although,
 * CouchDB's only restrictions are more fierce, as regular documents may
 * not start with an underscore anyways).</p>
 * 
 * Do not try to set path or method on the options - #save will always
 * override whatever you tried to set.
 * 
 * @function
 * @param {Object} doc to save; required
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.save = function (doc, options, callback) {
  var request;

  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof doc !== 'object') throw new TypeError('doc ' + typeof doc);
  if (typeof callback !== 'function') callback = function () {};

  options.data = doc;

  if (typeof doc._id === 'undefined') {
    options.method = 'POST';
    options.path = '';
  } else {
    options.method = 'PUT';
    options.path = helpers.pathForId(doc._id);
  }

  this._json(options, function (err, json) {
    if (!err && json.id && json.rev) {
      if (typeof doc._id === 'undefined') doc._id = json.id;
      doc._rev = json.rev;
    }
    callback(err, json);
  });
};

/**
 * Save a bunch of documents in a single operation.
 *
 * Sets options.method to 'POST' and options.path to '_bulk_docs' (always).
 *
 * <p>Uses the <code>_bulk_docs</code> API. To set all-or-nothing mode, you
 * need to set the follwoing option on the options argument:
 * <code>options.data.all_or_nothing=true</code>. In that case, documents
 * will be saved, not checking for conflicts, and therefore might result
 * in inconsistent documents in your database. However, documents are only
 * saved if <i>all</i> documents can be saved in this mode.</p>
 *
 * <p>If the operation succeeds, some documents <b>might</b> have been saved
 * and their revision values and/or the IDs updated, just as with save().
 * (Unless all-or-nothing mode is active, as discussed above.)
 * To check for individual problems, you will have to analyze the json
 * of the callback for error, reason properties. Please refer to the CouchDB
 * API for details and do not use this method without a firm understanding
 * of how it works; you might wreck havoc...</p>
 *
 * @param {Array} docs to save; required
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.saveAll = function (docs, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (!Array.isArray(docs)) throw new TypeError('docs ' + typeof docs);
  if (typeof callback !== 'function') callback = function () {};
  
  options.path = '_bulk_docs';
  options.method = 'POST';
  options.data = options.data || {};
  options.data.docs = docs;

  this._json(options, function (err, json) {
    if (!err && json.length) {
      for (i = json.length; i--;) {
        if (!json[i].error && json[i].rev && json[i].id) {
          docs[i]._rev = json[i].rev;
          if (typeof docs[i]._id === 'undefined') docs[i]._id = json[i].id;
        }
      }
    }
    callback(err, json);
  });
};

/**
 * Load a regular, design, or local document from the database.
 *
 * @param {String} id of the document, eg., "some_document_id"
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.load = function (id, options, callback) {
  var request;

  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof id !== 'string') throw TypeError('id ' + typeof id);
  if (typeof callback !== 'function') callback = function () {};

  options.path = helpers.pathForId(id);
  options.method = 'GET';
  this._json(options, callback);
};

/**
 * Duplicate a regular, design, or local document in the database.
 *
 * The to_id may contain a revision parameter by joining the ID and rev. with
 * <code>?rev=</code> as "to_id<code>?rev=</code>revision".
 *
 * To copy a specific revision of a (from) document, use the "rev" query
 * parameter: <code>options.query.rev=...</code>. Alternatively, from_id may
 * be a document, in which case the rev parameter is automatically taken from
 * there if it has one.
 *
 * @function
 * @param {String || Object} from_id source document (ID); required
 * @param {String} to_id target document ID (incl. "...?rev=revision"); required
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.duplicate = function (from_id, to_id, options, callback) {
  var request;

  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof callback !== 'function') callback = function () {};
  
  if (typeof from_id === 'object' && from_id) {
    if (typeof from_id._rev === 'string') {
      options.query = options.query || {};
      options.query.rev = from_id._rev;
    }
    if (typeof from_id._id === 'undefined')
      throw TypeError('from._id undefined');
    from_id = from_id._id;
  }

  if (typeof from_id !== 'string') throw TypeError('from_id ' + typeof from_id);
  if (typeof to_id !== 'string') throw TypeError('to_id ' + typeof to_id);

  options.headers = options.headers || {};
  options.headers['Destination'] = to_id;
  options.path = helpers.pathForId(from_id);
  options.method = 'COPY';
  this._json(options, callback);
};

/**
 * Remove a regular, design, or local document from the database.
 *
 * The entire document can be given (and must have a <code>_rev</code> value
 * set) or just the document ID - in which case a HEAD request is first made
 * to checkout the latest revision value from the database.
 *
 * @function
 * @param {Object || String} doc_or_id to remove, eg. "_local/some_doc_id"
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.remove = function (doc_or_id, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }
  if (typeof callback !== 'function') callback = function () {};

  options.method = 'DELETE';
  options.query = options.query || {};

  if (typeof doc_or_id === 'string') {
    options.path = helpers.pathForId(doc_or_id);
    options.query.rev = options.query.rev || null;

    if (typeof options.query.rev === 'string') {
      this._json(options, callback);
    } else {
      this.revision(doc_or_id, removeCallback.call(this, options, callback));
    }
  } else if (typeof doc_or_id === 'object' && doc_or_id) {
    if (typeof doc_or_id._id !== 'string')
      throw TypeError('doc._id ' + typeof doc_or_id);

    options.path = helpers.pathForId(doc_or_id._id);
    options.query.rev = options.query.rev || doc_or_id._rev;

    if (typeof options.query.rev !== 'string')
      throw TypeError('[doc._]rev ' + typeof options.query.rev);

    this._json(options, callback);
  } else {
    throw TypeError('doc_or_id ' + typeof doc_or_id);
  }
};

function removeCallback(options, callback) {
  var db = this;

  return function (err, rev) {
    if (err) {
      callback(err);
    } else {
      options.query.rev = rev;

      if (typeof rev === 'string') {
        db.json(options, callback);
      } else {
        callback(Error('rev not found'));
      }
    }
  };
}
    
/**
 * Remove a bunch of documents in a single operation.
 *
 * Wrapper for #saveAll, but sets <code>_deleted=true</code> on all
 * documents first, and then calls #saveAll.
 *
 * @see Database#saveAll for details
 * @function
 * @param {Array} docs to delete; required
 * @param {Object} options for the request; optional
 * @param {Function} callback that accepts "error, json"; optional
 */

Database.prototype.removeAll = function (docs, options, callback) {
  if (!Array.isArray(docs)) throw TypeError('docs ' + typeof docs);
  for (var i = docs.length; i--;) {
    docs[i]._deleted = true;
  }
  this.saveAll(docs, options, callback);
};

/**
 * Fetch the latest revision of a document.
 *
 * @function
 * @param {String} id of a regular, design, or local document; required
 * @param {Function} callback that accepts "error, rev"; optional
 */

Database.prototype.revision = function (id, callback) {
  var options = { method: 'HEAD' };
  if (typeof id !== 'string') throw TypeError('id ' + typeof id);
  if (typeof callback !== 'function') callback = function () {};
  options.path = helpers.pathForId(id);

  this._raw(options, function (err, data, headers) {
    var etag = headers && headers.etag;

    callback(err, etag && etag.slice(1, ~-etag.length));
  });
};

/**
 * Check if a regular, design, or local document exists.
 * 
 * If no <code>id</code> is used, the database itself is checked.
 * Returns <code>true</code> only if the response to a HEAD request has
 * a success status code (2xx). Ie., if <code>false</code>, that might be
 * because of connection problems, too.
 *
 * @function
 * @param {String} id of the document, eg., "_design/document"; optional
 * @param {Function} callback that accepts "boolean"; optional
 */

Database.prototype.exists = helpers.existsPattern;

// DESIGN FUNCTIONS API =======================================================

function setName() {
  var components = this.options.path.split('/'),
      items = components.length;
  this.name = decodeURIComponent(components[items - 3]);
  this.name += '/' + decodeURIComponent(components[~-items]);
}

// VIEW API

/**
 * A CouchAPI client for a view function.
 *
 * @constructor
 * @augments CouchAPI
 * @property {String} name of the view function as {ddoc_id}/{view_name}
 */

function View() {
  // no checks for the use of new!
  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
  setName.call(this);
}

util.inherits(View, CouchAPI);
View._name = '_view';

/**
 * Query the view.
 *
 * Note that the requests that serialize to JSON always first buffer the
 * response data, until the reponse ends and then return the JSON object.
 * If you wish to make a streaming query of a view, you will need to use the
 * CouchClient#request method and decide yourself when to parse parts of the
 * chunks to JS objects.
 *
 * TODO: add a CouchAPI#stream method that returns an EventEmitter, so it
 * is not necessary to go down to the client for streaming. 
 * 
 * @see The <a
 * href="http://www.couchbase.org/sites/default/files/uploads/all/documentation/couchbase-api-design.html#couchbase-api-design_db-design-designdoc-view-viewname_get"
 * >view API documentation</a> for parameters and details.
 * @param {Object} parameters for the query; optional
 * @param {Array} keys to be returned by the view; optional
 * @param {Function} callback that accepts "error, json"; optional
 */
View.prototype.query = function query() {
  var options = {},
      args = slice.call(arguments),
      callback;

  while (args.length && typeof args[~-args.length] === 'undefined') args.pop();
  if (typeof args[~-args.length] === 'function') callback = args.pop();
  if (Array.isArray(args[~-args.length])) options.data = { keys: args.pop() };
  if (typeof args[0] === 'object') options.query = args[0];
  if (typeof callback !== 'function') callback = function () {};

  if (options.data) {
    options.method = 'POST';
  } else {
    options.method = 'GET';
  }

  this._json(options, callback);  
};

// SHOW API

/**
 * A <b>CouchClient</b> for a show function.
 *
 * You should probably always use #string requests with this client.
 *
 * @constructor
 * @augments CouchClient
 * @property {String} name of the show function as {ddoc_id}/{show_name}
 */
 
function Show() {
  // no checks for the use of new!
  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
  setName.call(this);
}

util.inherits(Show, CouchAPI);
Show._name = '_show';

// LIST API

/**
 * A <b>CouchClient</b> for a list function.
 *
 * You should probably always use #string requests with this client.
 *
 * @constructor
 * @augments CouchClient
 * @property {String} name of the list function as {ddoc_id}/{list_name}
 */

function List() {
  // no checks for the use of new!
  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
  setName.call(this);
}

util.inherits(List, CouchAPI);
List._name = '_list';

// UPDATE API

/**
 * A CouchAPI client for a document update function.
 *
 * @constructor
 * @augments CouchAPI
 * @property {String} name of the update function as {ddoc_id}/{update_name}
 */

function Update() {
  // no checks for the use of new!
  // shortcut to CC!
  CouchClient.apply(this, slice.call(arguments));
  setName.call(this);
}

util.inherits(Update, CouchAPI);
Update._name = '_update';

