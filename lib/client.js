var events = require('events'),
    http = require('http'),
    https = require('https'),
    querystring = require('querystring'),
    url = require('url'),
    util = require('util'),
    slice = Array.prototype.slice,
    helpers = require('./helpers');

module.exports = {
  HttpError: HttpError,
  CouchClient: CouchClient,
};

// HTTP ERROR =================================================================

/**
 * An error type that is used when the response status code is not 2xx.
 *
 * Extends the default Error object.
 *
 * @constructor
 * @property {String} name either "HTTP Error" or the official W3C
 *           name for the status code (http#STATUS_CODE)
 * @property {Number} code either the status code number or <code>NaN</code>
 * @property {String} message either something meaningful or the response body
 * @property {Object} json only if the body contained JSON data
 * @param {String} message the body of the response
 * @param {Number || String} statusCode of the response
 */

function HttpError(message, statusCode) {
  var error;

  if (!(this instanceof HttpError)) {
    return new HttpError(message, statusCode);
  }
  
  message = helpers.parseCouchError(message);
  error = HttpError.super_.call(this, message.message);

  // copy the properties of the parent
  for (var p in error) if (error.hasOwnProperty(p)) {
    this[p] = error[p];
  }

  // statusCode sets code and defines the name
  this.code = Number(statusCode);

  if (typeof http.STATUS_CODES[statusCode] === 'undefined') {
    this.name = 'HTTP Error';
  } else {
    this.name = http.STATUS_CODES[statusCode];
  }

  // set json if message was parsed to JSON
  if (message.json) this.json = message.json;
}

util.inherits(HttpError, Error);

// COUCH CLIENT ===============================================================

/**
 * Create a new general-purpose client for a CouchDB.
 *
 * In most other case you will want to use the higher level CouchAPI.
 * However, to understand the powers of the API, you should read the
 * documentation of the CouchClient provided here, too.
 * 
 * <p>In a nutshell, CouchClient works just as Node's HTTP client works:
 * <pre>
 * request = client.request(options, function (response) { ... });
 * </pre>
 * However, there are several things going on to make handling requests
 * easier: To not have to specifiy the HTTP method verb, the common CouchDB
 * request methods are provided directly: GET, POST, PUT, DELETE, HEAD, and
 * COPY are provided as methods of their own. This means, the method does not
 * have to be added to the request options each time a request other than GET
 * (the default method) is made. All request methods allow you to just
 * use a string - the request path - instead of a options Object. The post
 * and put methods accept the data to send as a options property; data must
 * be a string, Buffer, Array, or a (JSON) Object. The Content-Length header
 * is calculated and set and the default Content-Type header is added for you.
 * </p>
 *
 * <p>Requests are <b>never</b> ended for you. This means, for any
 * non-streaming requests, and if you do not need to listen to
 * request errors, you can ignore the return value of the request methods.
 * To listen to errors, you have to keep in mind three things:
 * <dl>
 *   <dt>request errors</dt>
 *   <dd>use <code>request.on('error', callback)</code>;
 *   this is default Node behavior and should be put <i>before</i> the call
 *   to <code>request.end()</code></dd>
 *
 *   <dt>raw response errors</dt>
 *   <dd>use <code>response.on('close', callback)</code>;
 *   this is default Node behavior - but note "<b>close</b>" vs. "error"</dd>
 * </dl>
 *
 * If you want the usual "callback(err, success)" pattern, look at the
 * specialized CouchAPI.
 *
 * @see CouchAPI
 * @constructor
 * @property {String} protocol schema; 'https:' or ['http:']
 * @property {String} options defaults for requests
 * @property {String} default_content_type to use for requests
 * @param {String} url_string ['http://localhost:5984/']; optional
 * @param {Object} headers default request headers; optional
 * @author &copy; <a href="mailto:florian.leitner@gmail.com">Florian Leitner</a>
 */

function CouchClient(url_string, headers) {
  if (!(this instanceof CouchClient)) {
    return new CouchClient(url_string, headers); // catch calls without 'new'
  }

  if (typeof url_string === 'object' && url_string) {
    headers = url_string;
    url_string = null;
  }

  if (headers) {
    headers = helpers.lowerCaseKeys(headers);

    if (typeof headers['content-type'] === 'undefined') {
      this.default_content_type = 'application/json;charset=utf-8';
    } else {
      this.default_content_type = headers['content-type'];
      delete headers['content-type'];
    }
  } else {
    this.default_content_type = 'application/json;charset=utf-8';
  }

  this.options = {};
  this.setUrl(url_string);
  if (headers)
    this.options.headers = helpers.merge(this.options.headers, headers);
};

/**
 * Change the client's URL, overriding all options and the protocol.
 *
 * @function
 * @param {String} url_string
 * @type this
 */

CouchClient.prototype.setUrl = function (url_string) {
  var parsed = url.parse(url_string || '', true),
      options = {};

  this.protocol = parsed.protocol || 'http:';
  options.host = parsed.hostname || 'localhost';

  if (parsed.port) {
    options.port = Number(parsed.port);
  } else if (parsed.host) {
    options.port = 80;
  } else {
    options.port = 5984;
  }

  options.method = 'GET';
  options.path = parsed.pathname || '/';
  options.headers = {};
  options.query = parsed.query ? parsed.query : {};
  this.options = options;
  return this.setCredentials(parsed.auth);
}

/**
 * Set the authentication credentials.
 *
 * Clears the credentials if no parameters are applied.
 *
 * @function
 * @param {String} username 'username' or 'username:password'; optional
 * @param {String} password optional
 * @type this
 * @throws {TypeError} If username or password is present, but not a string.
 */

CouchClient.prototype.setCredentials = function (username, password) {
  var auth;

  if (typeof username === 'string' && username) {
    if (typeof password === 'undefined') {
      auth = username;
    } else if (typeof password === 'string') {
      auth = username + ':' + password;
    } else if (password) {
      throw new TypeError('password not a string');
    }
    this.options.headers['authentication'] =
      'Basic ' + new Buffer(auth).toString('base64');
    this._auth_url = auth + '@';
  } else if (username) {
    throw new TypeError('username not a string');
  } else {
    this._auth_url = '';

    if (this.options.headers['authentication'])
      delete(this.options.headers['authentication']);
  }
  return this;
};

/**
 * Return the full URL for this client.
 *
 * Authentication details and query parameters are included <i>as plain
 * text</i>, too.
 *
 * @function
 * @type String
 */

CouchClient.prototype.getUrl = function () {
  return this.getBaseUrl() + this.getPath() + this.getQuery();
}

/**
 * Return the base URL (schema, host, port) for this client.
 *
 * Plain-text authentication details are included, too.
 *
 * @function
 * @type String
 */

CouchClient.prototype.getBaseUrl = function () {
  return this.protocol + '//' + this._auth_url + this.options.host + ':' +
         this.options.port;
}

/**
 * Return all default headers for this client.
 *
 * Adds in the #default_content_type parameter.
 *
 * @function
 * @type Object
 */

CouchClient.prototype.getHeaders = function () {
  var headers = { 'content-type': this.default_content_type },
      opts = this.options.headers;

  for (var h in opts) { headers[h] = opts[h] }
  return headers;
}

/**
 * Return a request path, optionally extended by an opt_path string.
 *
 * @function
 * @param {String} opt_path; optional
 * @type String
 */

CouchClient.prototype.getPath = function (opt_path) {
  var path = this.options.path,
      last_path = path.charAt(~-path.length),
      first_opt = opt_path && opt_path.charAt(0) || '';

  if (opt_path) {
    if (first_opt !== '/' && last_path !== '/') {
      path += '/';
    } else if (first_opt === '/' && last_path === '/') {
      opt_path = opt_path.slice(1);
    }
    path += opt_path;
  }

  return path;
}

/**
 * Return the default query string (including the '?') of this client.
 *
 * Optionally replaces or adds to the default query object parameters.
 * If no query parameters exist, an empty string is returned.
 *
 * @function
 * @param {Object} query_opts; optional
 * @type String
 */

CouchClient.prototype.getQuery = function (query_opts) {
  var query = this.options.query;

  if (typeof query_opts === 'object' && query_opts)
    query = helpers.merge(query, query_opts);
  query = querystring.stringify(query);
  if (query) query = '?' + query;

  return query;
}

/**
 * Simple string representation: "[object CouchClient {URL}]".
 *
 * @function
 * @type String
 */

CouchClient.prototype.toString = function () {
  return '[object CouchClient ' + this.getUrl() + ']';
}

/**
 * Create a new CouchClient for a specific resource path.
 *
 * Each component is URL-encoded.
 *
 * Examples:
 * <pre>
 * client = CouchClient();
 * new_client = client.resource('database', 'doc id with / inside');
 * // -> http://localhost:5984/database/doc%20id%20with%20%2F%20inside
 * new_client = client.resource(['database', '_design']);
 * // -> http://localhost:5984/database/_design
 * new_client = client.resource('_info');
 * // -> http://localhost:5984/_info
 * copied_client = client.resource();
 * // -> http://localhost:5984/
 * </pre>
 *
 * @function
 * @param {String || Array} components...
 * @throws {TypeError} If not all components are strings.
 * @type CouchClient
 */

CouchClient.prototype.resource = function () {
  var url = this._resource.apply(this, arguments);

  return new CouchClient(url, this.getHeaders());
}

CouchClient.prototype._resource = function () {
  var args = slice.call(arguments),
      p = this.getPath(),
      url;

  if (args.length === 1 && Array.isArray(args[0])) args = args[0];

  for (var i = args.length; i--;) {
    if (typeof args[i] !== 'string')
      throw TypeError('component not a string');
    args[i] = encodeURIComponent(args[i]);
  }

  // if the base bath has not trailing slash, add an empty string to the
  // list of resources to join (args), which then will add a leading slash
  // to the appended resource path
  if (p.charAt(~-p.length) !== '/') args.unshift('');

  // build the URL, merging the new resource components into it
  return this.getBaseUrl() + p + args.join('/') + this.getQuery();
}

// REQUEST API ================================================================

/**
 * Make a COPY request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.copy = function (options, callback) {
  return this._doRequest('COPY', options, callback);
};

/**
 * Make a DELETE request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.delete = function (options, callback) {
  return this._doRequest('DELETE', options, callback);
};

/**
 * Make a GET request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.get = function (options, callback) {
  return this._doRequest('GET', options, callback);
};

/**
 * Make a HEAD request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.head = function (options, callback) {
  return this._doRequest('HEAD', options, callback);
};

/**
 * Make a POST request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.post = function (options, callback) {
  return this._doRequest('POST', options, callback);
};

/**
 * Make a PUT request.
 *
 * @see CouchClient#request for more information
 * @function
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.put = function (options, callback) {
  return this._doRequest('PUT', options, callback);
};

CouchClient.prototype._doRequest = function (method, opts, cb) {
  var opts_type = typeof(opts);
  
  if (opts_type === 'string') {
    opts = { path: opts };
  } else if (opts_type === 'function') {
    cb = opts;
    opts = {};
  } else if (!opts || opts_type !== 'object') {
    opts = {};
  }
  
  opts.method = method;
  return this.request(opts, cb);
};

/**
 * Make a request to the CouchDB - <b>all</b> requests are routed through here.
 *
 * <b>NB:</b> The <code>request#end</code> method is <i>not</i> called on the
 * request, so do not forget to do so!
 * Request options can have "query" and "data" properties in addition to the
 * traditional <code>http#request</code> options.
 *
 * <p>The <b>query</b> property is an object with query parameters that will be
 * appended to the path, replacing possible default query options.</p>
 *
 * <p><b>POST and PUT data</b> will make use of the "data" option: Strings,
 * Buffers, or Arrays set on the data property are sent as is, using
 * <code>request.write(options.data)</code>. If the data is an EventEmitter
 * (eg., a HttpRequest object), each the Transfer-Encoding header will be
 * set to "chunked" for the request and each time the emitter emits data,
 * it is piped into the request. Note that you should then use something
 * like <code>data.on('end', function () { request.end() })</code> on the
 * request object returned here instead of calling request#end directly.
 * Other types than strings, buffers, arrays, and emitters will be serialized
 * to JSON strings before sending them. So to send strings or arrays as JSON
 * data, they need to be serialized manually. Functions will be serialzed
 * to strings, too. The only case that data is <b>not serialized and sent</b>
 * is if the data is <code>null</code> or <code>undefined</code>.
 * Finally, the following headers will be added to POST and PUT requests
 * <i>unless</i> they are overridden by the default or request options:
 * <dl>
 *   <dt>Content-Type</dt>
 *   <dd>The client's #default_content_type property (normally,
 *   "application/json;charset=utf-8").</dd>
 *
 *   <dt>Content-Length</dt>
 *   <dd>The byte length of the request body will be added <i>unless</i> the
 *   Transfer-Encoding header is present or the options.data is an
 *   EventEmitter.</dd>
 *   
 *   <dt>Transfer-Encoding</dt>
 *   <dd>Set to "chunked", but only if otions.data is an EventEmitter.</dd>
 *
 *   <dt>Expect</dt>
 *   <dd><i>Unless</i> Content-Length is null or unset, the Expect header
 *   will be set to "100-continue".</dd>
 *   <dt>
 * </dl></p>
 *
 * <p>The <b>request path</b> is built out of the clients default path,
 * appending the <code>options.path</code> if present. Then the default
 * query options of the client plus any specific <code>options.query</code>
 * settings for this request are appended. So, for example, to fetch a
 * document for a specific revision, if you have a client with the URL
 * already set to the database, the "path" option for this request only needs
 * to contain the (URL-encoded) document id, and the "query" option would
 * simply be <code>{ rev: 'n-...' }</code>:
 * <pre>
 * server = CouchClient();
 * db = server.resource('my_database');
 * req = db.request({ path: 'some_document', query: { rev: '1-abcd' },
 *                  function (res) {
 *   var body = []
 *   // error handling code should go here...
 *   res.on('data', function (chunk) {
 *     chunk && body.push(chunk);
 *   });
 *   res.on('end' function {} {
 *      // do something with the body...
 *   });
 * });
 * // error handling code should go here...
 * req.end();
 * </pre></p>
 *
 * <p>All request options therefore be set as client-wide defaults for every
 * request, or fine-tuned per request. For example, to append
 * "?key=something" to the path of every request of a view by default, do:
 * <pre>
 * // NB - normally, you might want to use the specialized API, naturally!
 * server = CouchClient();
 * view = server.resource('db', '_design', 'ddoc', '_view', 'viewname');
 * view.options.query = { key: 'something' };
 * view.request(callback); // no options at all need to request the view!
 * </pre></p>
 *
 * <p>For the default request options, please refer to the 
 * <code>http#request</code> documentation of Node.</p>
 *
 * @param {String || Object} options or path; optional
 * @param {Function} callback -> http.ClientResponse; optional
 * @type http.ClientRequest
 */

CouchClient.prototype.request = function (options, callback) {
  // this is the core function through which all requests are routed
  var handle = (this.protocol === 'https:') ? https : http,
      opts_type = typeof(options),
      data, request;

  // ensure arguments
  if (opts_type === 'string') {
    options = { path: options };
  } else if (opts_type === 'function') {
    callback = options;
    options = {};
  } else if (!options || opts_type !== 'object') {
    options = {};
  }

  if (typeof callback !== 'function') callback = function () {};

  // set host, port, and method
  options.host = options.host || this.options.host;
  options.port = options.port || this.options.port;
  options.method = options.method || this.options.method;
  if (options.method) options.method = options.method.toUpperCase();

  // merge the path from the client path + options path
  options.path = this.getPath(options.path);

  // merge the query from the client query + options query
  options.path += this.getQuery(options.query);

  // merge the headers from the client headers + options headers
  if (options.headers)
    options.headers = helpers.lowerCaseKeys(options.headers);
  options.headers = helpers.merge(this.options.headers, options.headers || {});

  if (options.method === 'POST' || options.method === 'PUT') {
    // add headers and serialize JSON data
    data = helpers.prepareData(
      options.data, this.default_content_type, options.headers
    );
  }

  // wrap callback to do response caching of GET requests
  // adds If-None-Match in case the response for that request has been cached
  if (typeof options.method === 'undefined' || options.method === 'GET')
    callback = helpers.responseCacher(options, callback);

  // make request
  /*
  console.log(
    options.method || 'GET',
    this.protocol + '//' + options.host + ':' + options.port + options.path,
    '\nheaders', options.headers,
    '\ncallback', callback.toString()
  );
  */
  request = handle.request(options, callback);

  if (data && (options.method === 'POST' || options.method === 'PUT')) {
    // write PUT/POST data ...
    if (options.headers['expect'] === '100-continue') {
      // ... on continue
      request.on('continue', function () {
        helpers.send(request, data);
      });
    } else {
      // ... immediately
      helpers.send(request, data);
    }
  }

  return request;
};

