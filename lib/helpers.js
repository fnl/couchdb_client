var STATUS_CODES = require('http').STATUS_CODES,
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    slice = Array.prototype.slice;

// HTTP AND COUCH ERROR PARSER ================================================

exports.parseCouchError = function (body) {
  var error = { message: body },
      json;

  // check if the body can be deserialized from JSON
  try {
    json = JSON.parse(body);
    error.json = json;
  } catch (e) {}

  // if we have a CouchDB error message, format it and use it as message
  if (json && json.error && typeof json.error === 'string') {
    error.message = json.error.replace(/_/g, ' ');
    if (json.reason && typeof json.reason === 'string')
      error.message += ': ' + json.reason.replace(/_/g, ' ');
  }
  
  return error;
}
   
// COUCH CLIENT ===============================================================

exports.lowerCaseKeys = function lowerCaseKeys(obj) {
  var key, lower, clean = {};

  for (key in obj) if (obj.hasOwnProperty(key)) {
    lower = key.toLowerCase();
    clean[lower] = obj[key];
  }

  return clean;
}

exports.merge = function merge(obj, into) {
  for (var opt in obj) if (obj.hasOwnProperty(opt)) {
    if (typeof into[opt] === 'undefined') {
      into[opt] = obj[opt];
    }
  }
  
  return into;
}

// unused
exports.patchRequest = function patchRequest(req) {
  req.write = patchFunction(req.write.bind(req));
  req.end = patchFunction(req.end.bind(req));
  return req;
}

function patchFunction(f) {
  return function (data, encoding) {
    if (serializesToJson(data)) data = stringifyJson(data);
    return f(data, encoding || 'utf8');
  }
}

function serializesToJson(data) {
  return (typeof data === 'object') && !(
    Array.isArray(data) || Buffer.isBuffer(data)
  );
}

function stringifyJson(data) {
  return JSON.stringify(
    data, function(key, val) {
      if (typeof val == 'function') return val.toString();
      return val;
    }
  );
}

exports.prepareData = function prepareData(data, content_type, headers) {
  var CL = (typeof headers['content-length'] !== 'undefined'),
      TE = (typeof headers['transfer-encoding'] !== 'undefined');

  // always set the CT if not present
  if (typeof headers['content-type'] === 'undefined')
    headers['content-type'] = content_type;

  // I. if data is defined and non-null
  if (data !== null && typeof data !== 'undefined') {
    // I.1. set Expect header to continue if undefined
    if (typeof headers['expect'] === 'undefined')
      headers['expect'] = '100-continue';

    // I.2.A. if neither CL nor TE headers are set...
    if (!CL && !TE) {
      if (typeof data === 'string') {
        // I.2.A.1. data is a string: set CL to byte length of string
        headers['content-length'] = Buffer.byteLength(data);
      } else if (Array.isArray(data) || Buffer.isBuffer(data)) {
        // I.2.A.2. data is an array or buffer: set CL to length of array/buffer
        headers['content-length'] = data.length;
      } else if (data instanceof EventEmitter) {
        // I.2.A.3. data is an emitter: set TE to chunked
        headers['transfer-encoding'] = 'chunked';
      } else {
        // I.2.A.4. otherwise, stringify data and set CL header
        data = stringifyJson(data);
        headers['content-length'] = Buffer.byteLength(data);
      }

    // I.2.B. or, if CL is set...
    } else if (CL) {
      // I.2.B.1. stringify data if it is neither a string, array, or buffer
      if (!(typeof data === 'string' ||
            Array.isArray(data) || Buffer.isBuffer(data))) {
        data = stringifyJson(data);
      }
    }
    // I.2.C. otherwise, TE is set, and there is nothing more to do

  // II. otherwise, data is undefined or null
  } else {
    // II.1. set the CL header to 0 if neither CL nor TE are defined
    if (!CL && !TE) headers['content-length'] = '0';
  }

  return data; // data might have changed, so return it
}

// TODO: actually implement it...
exports.responseCacher = function responseCacher(headers, callback) {
  // check if path is cached and if so, add the etag as if-none-match header

  return function (response) {
    var cc = response.headers['cache-control'],
        cachable = (!cc || cc !== 'no-cache' || cc !== 'no-store');

    if (response.statusCode < 300 && cachable) {
      // cache the response and forward it to the callback
      callback(response);
    } else if (response.statusCode == 304) {
      // forward a cached response instead
      callback(response);
    } else {
      // nothing to do - forward the resonse to the callback
      callback(response);
    }
  };
}

exports.send = function send(request, data) {
  if (data instanceof EventEmitter) {
    data.on('data', function (chunk) { request.write(chunk) });
  } else {
    request.write(data);
  }
}

// COUCH API ==================================================================

exports.existsPattern = function existsPattern(name, callback) {
  if (typeof name !== 'string') {
    callback = name;
    name = '';
  }
  if (typeof callback !== 'function') callback = function () {};

  this._raw({ method: 'HEAD', path: exports.pathForId(name) },
            function (err) { callback(!err) });
};

exports.pathForId = function pathForId(id) {
  var path;

  if (id.charAt(0) === '_' && ~id.indexOf('/')) {
    path = id.split('/');
    path[0] = encodeURIComponent(path[0]);
    path[1] = encodeURIComponent(path.splice(1).join('/'));
    path = path[0] + '/' + path[1];
  } else {
    path = encodeURIComponent(id);
  }

  return path;
}

exports.redirectCallback = function redirectCallback(method, callback) {
  return function (res) {
    var c = Number(res.statusCode);
        
    if (c > 300 && c < 308) {
      if (c == 303) {
        // redirect...
        callback(res.headers['location'], res);
      } else if (
        (method === 'GET' || method === 'HEAD')  &&
        (c == 301 || c == 302 || c == 307)
      ) {
        callback(res.headers['location'], res);
      } else {
        callback(null, res);
      } 
    } else {
      callback(null, res);
    } 
  } 
};

exports.readResponse = function readResponse(HttpError, response, callback) {
  var buffers = [];

  if (typeof callback !== 'function') callback = function () {};
  
  response.on('close', function (err) {
    if (buffers.length) {
      callback(err, exports.joinBuffers(buffers));
    } else {
      callback(err);
    }
  });
  
  response.on('data', function (chunk) { if (chunk) buffers.push(chunk) });

  response.on('end', function () {
    var body = buffers.length ? exports.joinBuffers(buffers) : null,
        string, ct;

    if (response.statusCode < 300) {
      // SUCCESS - EMIT JOINED BUFFERS
      callback(null, body, response.headers);
    } else {
      if (body) {
        ct = response.headers['content-type']

        if (~ct.indexOf('application/json') || ct.indexOf('text') === 0)
          string = body.toString('utf8');
      }

      // ERROR - EMIT ERROR AND JOINED BUFFERS
      callback(new HttpError(string, response.statusCode),
               body, response.headers);
    }
  });
}
 
exports.joinBuffers = function joinBuffers(buffers) {
  var total = 0, num = buffers.length, i = num, pos = 0, joined;

  if (num === 1) return buffers[0];

  for (;i--;) {
    total += buffers[i].length;
  }

  joined = new Buffer(total);

  for (i = 0; i < num; i++) {
    buffers[i].copy(joined, pos);
    pos += buffers[i].length;
  }

  return joined;
}
