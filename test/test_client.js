require.paths.push(__dirname);

var client = require('lib/client'),
    helpers = require('lib/helpers'),
    testCase = require('nodeunit').testCase,
    url = require('url'),
    events = require('events'),
    // for mocking
    http = require('http'),
    https = require('https'),
    // some testing constants
    DEFAULT_URL_STRING = 'http://localhost:5984',
    DEFAULT_URL = url.parse(DEFAULT_URL_STRING),
    DEFAULT_OPTIONS = {
      host: 'localhost',
      port: 5984,
      method: 'GET',
      path: '/',
      headers: {},
      query: {}
    },
    DEFAULT_PROTOCOL = 'http:',
    DEFAULT_CONTENT_TYPE = 'application/json;charset=utf-8',
    DEFAULT_AUTH_URL = '';

exports.HttpError = testCase({

  setUp: function (cb) {
    this.parseCouchError = helpers.parseCouchError;
    helpers.parseCouchError = function (message) {
      return { message: message };
    };
    cb();
  },

  tearDown: function (cb) {
    helpers.parseCouchError = this.parseCouchError;
    cb();
  },
 
  'creates an instance even without new': function (test) {
    test.ok(client.HttpError() instanceof client.HttpError);
    test.done();
  },

  'is an instance of Error': function (test) {
    test.ok(new client.HttpError() instanceof Error);
    test.done();
  },

  'uses an empty string as message if undefined': function (test) {
    test.equal((new client.HttpError()).message, '');
    test.equal(typeof (new client.HttpError()).message, 'string');
    test.done();
  },
  
  'uses NaN as code if statusCode is not a number': function (test) {
    test.equal((new client.HttpError()).code.toString(), 'NaN');
    test.done();
  },

  'has a string message if defined': function (test) {
    var error = new client.HttpError(123);
    test.equal(error.message, '123');
    test.equal(typeof error.message, 'string');
    test.done();
  },
  
  'records a status code as second argument': function (test) {
    test.equal((new client.HttpError(null, 1)).code, 1);
    test.done();
  },

  'records a name for the status code': function (test) {
    test.equal((new client.HttpError(null, 404)).name, 'Not Found');
    test.done();
  },

  'uses "HTTP Error" as name for unknown status codes': function (test) {
    test.equal((new client.HttpError(null, 1404)).name, 'HTTP Error');
    test.done();
  },

  'calls parseCouchError with the message': function (test) {
    helpers.parseCouchError = function (message) {
      test.equal(message, 'sentinel');
      return { message: message };
    }
    new client.HttpError('sentinel');
    test.expect(1);
    test.done();
  },

});


function update(object, another) {
  if (typeof another === 'undefined') {
    another = object;
    object = {};
  }
  for (var p in another) {
    if (another.hasOwnProperty(p)) {
      object[p] = another[p];
    }
  }

  return object;
}

function assertClientProperties(conn, should) {
  this.ok(conn instanceof client.CouchClient, conn + ' not a CouchClient');
  this.equal(conn.protocol, should.protocol);
  this.equal(conn.options.host, should.options.host);
  this.equal(conn.options.port, should.options.port);
  this.equal(conn.options.method, should.options.method);
  this.equal(conn.options.path, should.options.path);
  this.deepEqual(conn.options.headers, should.options.headers);
  this.deepEqual(conn.options.query, should.options.query);
  this.equal(conn.default_content_type, should.default_content_type);
  this.equal(conn._auth_url, should._auth_url);
}

function expectedClient() {
  var opts = update(DEFAULT_OPTIONS);
  opts.headers = update(DEFAULT_OPTIONS.headers);
  opts.query = update(DEFAULT_OPTIONS.query);

  return {
    protocol: DEFAULT_PROTOCOL,
    _auth_url: DEFAULT_AUTH_URL,
    options: opts,
    default_content_type: DEFAULT_CONTENT_TYPE,
  };
}

// CREATE
exports.create = {

  '() -> a default CouchClient [http://localhost:5984]':
  function (test) {
    var conn = new client.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },

  'works without using the keyword "new"':
  function (test) {
    var conn = client.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },

  'constructor calls setUrl() with its first argument (only)':
  function (test) {
    var conn, setUrl = client.CouchClient.prototype.setUrl;
    client.CouchClient.prototype.setUrl = function () {
      test.deepEqual(Array.prototype.slice.call(arguments), ['url']);
    };
    conn = client.CouchClient('url', 'dummy')
    test.expect(1);
    test.done();
    client.CouchClient.prototype.setUrl = setUrl;
  },

  'with default headers':
  function (test) {
    var expected = expectedClient(),
        conn = client.CouchClient({
      'CoNtEnT-TyPe': 'sEnTiNeL',
      'oThEr': 'hEaDeR'
    });
    expected.options.headers = { 'other': 'hEaDeR' };
    expected.default_content_type = 'sEnTiNeL';
    assertClientProperties.call(test, conn, expected);
    test.done();
  },
};

// SET URL
exports.setUrl = testCase({
  setUp: function (cb) {
    this.c = new client.CouchClient();
    this.c.setCredentials = function () { return this };
    this.e = expectedClient();
    cb();
  },

  '() -> default client':
  function (test) {
    assertClientProperties.call(test, this.c.setUrl(),  this.e);
    test.done();
  },

  '("") -> default client':
  function (test) {
    assertClientProperties.call(test, this.c.setUrl(''),  this.e);
    test.done();
  },

  'parses any other port to its Number':
  function (test) {
    this.e.options.port = 123;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:123/'),  this.e
    );
    test.done();
  },

  '("https:") -> a CouchClient using SSL':
  function (test) {
    this.e.protocol = 'https:';
    assertClientProperties.call(test, this.c.setUrl('https:'), this.e);
    test.done();
  },

  '("http://localhost") -> to port 80':
  function (test) {
    this.e.options.port = 80;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost'), this.e
    );
    test.done();
  },

  '("http://hostname:5984")':
  function (test) {
    this.e.options.host = 'hostname';
    assertClientProperties.call(
      test, this.c.setUrl('http://hostname:5984'), this.e
    );
    test.done();
  },

  '("http://localhost:1234")':
  function (test) {
    this.e.options.port = 1234;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:1234'), this.e
    );
    test.done();
  },

  '("http://localhost:5984/pathname")':
  function (test) {
    this.e.options.path = '/pathname';
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:5984/pathname'), this.e
    );
    test.done();
  },

  '("http://localhost:5984?param=value")':
  function (test) {
    this.e.options.query.param = 'value';
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:5984?param=value'), this.e
    );
    test.done();
  },

  'calls setCredentials() with parsed authentication details':
  function (test) {
    this.c.setCredentials = function (cred) {
      test.equal(cred, 'cred');
    };
    this.c.setUrl('http://cred@localhost');
    test.expect(1);
    test.done();
  },
});

// SET CREDENTIALS
exports.setCredentials = {

  'via new CouchClient("http://credentials@localhost:5984")':
  function (test) {
    var conn = new client.CouchClient('http://credentials@localhost:5984'),
        expected = expectedClient();
    expected.options.headers['authentication'] =
      'Basic ' + new Buffer('credentials').toString('base64');
    expected._auth_url = 'credentials@';
    assertClientProperties.call(test, conn, expected);
    test.done();
  },

  'using new CouchClient() with empty credentials sets none':
  function (test) {
    var conn = new client.CouchClient('http://@localhost:5984');
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },

  '() clears credentials':
  function (test) {
    var conn = new client.CouchClient('http://user:pass@localhost:5984');
    assertClientProperties.call(test, conn.setCredentials(),
                                expectedClient());
    test.done();
  },

  '("user:pass") sets credentials':
  function (test) {
    var conn = new client.CouchClient(),
        expected = expectedClient();
    expected.options.headers['authentication'] =
      'Basic ' + new Buffer('user:pass').toString('base64');
    expected._auth_url = 'user:pass@';
    assertClientProperties.call(test, conn.setCredentials('user:pass'),
                                expected);
    test.done();
  },

  '("user", "pass") sets credentials':
  function (test) {
    var conn = new client.CouchClient(),
        expected = expectedClient();
    expected.options.headers['authentication'] =
      'Basic ' + new Buffer('user:pass').toString('base64');
    expected._auth_url = 'user:pass@';
    assertClientProperties.call(test, conn.setCredentials('user' ,'pass'),
                                expected);
    test.done();
  },

  '("user") does not throw a TypeError':
  function (test) {
    var conn = new client.CouchClient();
    test.doesNotThrow(function () {conn.setCredentials('user')}, TypeError);
    test.done();
  },

  '(1, 2) throws a TypeError':
  function (test) {
    var conn = new client.CouchClient();
    test.throws(function () {conn.setCredentials(1, 2)}, TypeError);
    test.done();
  },

  '({}) throws a TypeError':
  function (test) {
    var conn = new client.CouchClient();
    test.throws(function () {conn.setCredentials({})}, TypeError);
    test.done();
  },
};

// HELPERS
exports.helpers = testCase({
  setUp: function (cb) {
    this.conn = new client.CouchClient();
    cb();
  },

  'CouchClient.getUrl()':
  function (test) {
    this.conn.getPath = function () {
      test.ok(true);
      return 'path'
    }
    this.conn.getQuery = function () {
      test.ok(true);
      return 'query'
    }
    this.conn._auth_url = 'AUTH';
    test.equal(this.conn.getUrl(), 'http://AUTHlocalhost:5984pathquery');
    test.expect(3);
    test.done();
  },

  'CouchClient.getPath()':
  function (test) {
    var path = this.conn.getPath();
    test.equal(path, '/');
    this.conn.options.path = 'BASE';
    path = this.conn.getPath('PATH');
    test.equal(path, 'BASE/PATH');
    test.done();
  },

  'CouchClient.getQuery()':
  function (test) {
    var query = this.conn.getQuery();
    test.equal(query, '');
    this.conn.options.query.PARAM = 'ORIGINAL';
    query = this.conn.getQuery({ PARAM: 'VALUE' });
    test.equal(query, '?PARAM=VALUE');
    test.done();
  },

  'CouchClient.toString()':
  function (test) {
    this.conn.getUrl = function () {
      return '=URL=';
    }
    test.equal(this.conn.toString(), '[object CouchClient =URL=]');
    test.done();
  },
});

// RESOURCE
exports.resource = testCase({
  setUp: function (cb) {
    this.conn = new client.CouchClient();
    this.conn.getPath = function () {
      return '/path/';
    }
    this.conn.getQuery = function () {
      return '?param=value';
    }
    this.props = expectedClient();
    this.props.options.path = '/path/';
    this.props.options.query.param = 'value';
    cb();
  },

  '() returns a copy of that CouchClient':
  function (test) {
    assertClientProperties.call(test, this.conn.resource(), this.props);
    test.done();
  },

  '("resource") -> adds a single resource component to the path':
  function (test) {
    var conn = this.conn.resource('resource');
    this.props.options.path += 'resource';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },

  'escapes spaces and slashes in resource component names':
  function (test) {
    var conn = this.conn.resource('spaces and /s inside');
    this.props.options.path += 'spaces%20and%20%2Fs%20inside';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },

  '("a", "b", "c") -> a/b/c':
  function (test) {
    var conn = this.conn.resource('a', 'b', 'c');
    this.props.options.path += 'a/b/c';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },

  '(["a", "b", "c"]) -> a/b/c, too':
  function (test) {
    var conn = this.conn.resource(['a', 'b', 'c']);
    this.props.options.path += 'a/b/c';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },

  'joins paths correctly even if the base path has no trailing slash':
  function (test) {
    var conn;
    this.conn.getPath = function () { return '/base'; }
    conn = this.conn.resource('resource');
    this.props.options.path = '/base/resource';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },

  'CouchClient.resource(1) throws TypeError':
  function (test) {
    test.throws((function () { this.conn.resource(1) }).bind(this),
                TypeError);
    test.done();
  }
});

// REST API
function doRequestCalled(method) {
  return function (test) {
    this.conn._doRequest = function (meth, opts, cb) {
      test.equal(meth, method.toUpperCase());
      test.equal(opts, 'options');
      test.equal(cb, 'callback');
      return 'sentinel';
    };
    var val = this.conn[method]('options', 'callback');
    test.equal(val, 'sentinel');
    test.expect(4);
    test.done();
  }
}

function requestCalled(method) {
  return function (test) {
    this.conn.request = function (opts, cb) {
      test.deepEqual(opts, { method: method.toUpperCase(), path: 'PATH' });
      test.equal(cb, 'callback');
      return 'sentinel';
    };
    var val = this.conn[method]('PATH', 'callback');
    test.equal(val, 'sentinel');
    test.expect(3);
    test.done();
  }
}

exports.restapi = testCase({
  setUp: function (cb) {
    var that = this;
    this.conn = new client.CouchClient();
    this.conn.request = function () { throw Error('raw called') };
    cb();
  },

  'do copy()': doRequestCalled('copy'),
  'request copy()': requestCalled('copy'),

  'do delete()': doRequestCalled('delete'),
  'request delete(raw)': requestCalled('delete'),

  'do get()': doRequestCalled('get'),
  'request get()': requestCalled('get'),

  'do head()': doRequestCalled('head'),
  'request head()': requestCalled('head'),

  'do post()': doRequestCalled('post'),
  'request post()': requestCalled('post'),

  'do put()': doRequestCalled('put'),
  'request put()': requestCalled('put'),
});

// DO REQUEST - REST API HELPER
function mockRequest(test, opts, callb) {
  var options = { method: 'METHOD' },
      callback = (typeof callb === 'function') ? 'function' : 'undefined';

  if (opts === 'PATH') options.path = opts;
  if (typeof opts === 'function') callback = 'function';

  return function (o, cb) {
    test.deepEqual(o, options);
    test.equal(typeof cb, callback);
    return 'sentinel';
  };
}

function testRawRequest(opts, raw, callb) {
  return function (test) {
    this.conn.request = mockRequest(test, opts, callb);
    var val = this.conn._doRequest('METHOD', opts, callb);
    test.equal(val, 'sentinel');
    test.expect(3);
    test.done();
  }
}

exports._doRequest = testCase({
  setUp: function (cb) {
    this.conn = new client.CouchClient();
    cb();
  },

  '(opts, callback)': testRawRequest('PATH', function () {}),
  '(opts)': testRawRequest('PATH'),
  '(callback)': testRawRequest(function () {}),
  '()': testRawRequest(),
});

// REQUEST
exports.request = testCase({
  setUp: function (cb) {
    var request = new events.EventEmitter();
    this.request = request;
    request.write = function () {};
    request.mocked = true;
    http.request = https.request = function () { return request };
    this.conn = new client.CouchClient();
    cb();
  },

  'returns a http.ClientRequest':
  function (test) {
    var req = this.conn.request('object', 'callback');
    test.ok(req.mocked);
    this.conn.protocol = 'https:';
    req = this.conn.request('object', 'callback');
    test.ok(req.mocked);
    test.done();
  },

  'returns a http.ClientRequest even if the protocol is malformed':
  function (test) {
    this.conn.protocol = 'anything';
    https.request = null;
    var req = this.conn.request('object', 'callback');
    https.request = http.request;
    test.ok(req.mocked);
    test.done();
  },

  'runs a GET request even without argument':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.deepEqual(options, {
        method: 'GET',
        host: 'localhost',
        port: '5984',
        path: '/',
        headers: {},
      })
      return request;
    }
    this.conn.request();
    test.expect(1);
    test.done();
  },

  'calls getPath and getQuery and adds the results to the path':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.equal(options.path, 'PATH?QUERY');
      return request;
    }
    this.conn.getPath = function () { return 'PATH' };
    this.conn.getQuery = function () { return '?QUERY' };
    this.conn.request('object', 'callback');
    test.expect(1);
    test.done();
  },

  'merges default and optional headers':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.deepEqual(options.headers, { merged: true });
      return request;
    }
    this.conn.options.headers.merged = false;
    this.conn.request({ headers: { MeRgEd: true }}, 'callback');
    test.expect(1);
    test.done();
  },

  'adds the default Content-Type, -Length and Expect for POST and PUT (only)':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'],
        request = this.request;
    http.request = function (options) {
      if (options.method === 'POST' || options.method === 'PUT') {
        test.deepEqual(options.headers, {
          'content-type': DEFAULT_CONTENT_TYPE,
          'content-length': 4,
          'expect': '100-continue',
        });
      } else {
        test.deepEqual(options.headers, {});
      }
      return request;
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i], data: 'data' }, 'callback');
    }
    test.expect(methods.length);
    test.done();
  },

  'adds the PUT/POST Content-Length for JSON objects after serializing them':
  function (test) {
    var methods = ['PUT', 'POST'],
        request = this.request;
    request.write = function (data) {
      test.equal(data, '{"a":1}');
    }
    http.request = function (options) {
      test.equal(options.headers['content-length'], 7);
      return request;
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i], data: {a:1} }, 'callback');
    }
    this.request.emit('continue');
    test.expect(methods.length * 2);
    test.done();
  },

  'adds the Content-Length when PUT/POSTing Buffers or Arrays':
  function (test) {
    var request = this.request;
    request.write = function (data) {
      test.equal(data.length, 1);
    }
    http.request = function (options) {
      test.equal(options.headers['content-length'], 1);
      return request;
    }
    this.conn.request({ method: 'PUT', data: [1] }, 'callback');
    this.conn.request({ method: 'POST', data: new Buffer(1) }, 'callback');
    this.request.emit('continue');
    test.expect(4);
    test.done();
  },

  'but add Content-Type and -Length on PUT/POST only if not defined':
  function (test) {
    var request = this.request,
        headers = {
          'content-type': 'sentinel',
          'content-length': 'length',
          'expect': 'nothing',
        };
    http.request = function (options) {
      test.deepEqual(options.headers, headers);
      return request;
    }
    this.conn.request({ method: 'POST', headers: headers, data: 'data' }, 'callback');
    test.expect(1);
    test.done();
  },

  'does not add Content-Length if Transfer-Encoding is set':
  function (test) {
    var request = this.request,
        headers = { 'transfer-encoding': 'whatever', };
    http.request = function (options) {
      test.equal(typeof options.headers['content-length'], 'undefined');
      return request;
    }
    this.conn.request({ method: 'POST', headers: headers, data: 'data' },
                      'callback');
    test.expect(1);
    test.done();
  },
  
  'calls prepareData() for POST and PUT requests with data':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'],
        tmp = helpers.prepareData;
    helpers.prepareData = function (data) {
      test.deepEqual(data, {a:1});
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i], data: {a:1} }, 'callback');
    }
    test.expect(2);
    test.done();
    helpers.prepareData = tmp;
  },

  'ensures the callback is always a function':
  function (test) {
    var request = this.request;
    http.request = function (options, cb) {
      test.equal(typeof cb, 'function');
      return request;
    }
    this.conn.request('options', 'callback');
    test.expect(1);
    test.done();
  },

  'writes data to the ClientRequest if a POST or PUT (only)':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'];
    this.request.write = function (data) {
      test.equal(data, 'data');
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i], data: 'data' }, 'callback');
    }
    this.request.emit('continue');
    test.expect(2);
    test.done();
  },
  
  'does not wait on continue if the Expect header is overridden':
  function (test) {
    var request = this.request,
        headers = { 'Expect': null };
    this.request.write = function (data) {
      test.equal(data, 'data');
    }
    this.conn.request({ method: 'POST', headers: headers, data: 'data' }, 'callback');
    this.request.emit('continue');
    this.request.emit('continue');
    test.expect(1);
    test.done();
  },


});
