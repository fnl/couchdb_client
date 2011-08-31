require.paths.push(__dirname);

var helpers = require('lib/helpers'),
    HttpError = require('lib/client').HttpError,
    testCase = require('nodeunit').testCase,
    EventEmitter = require('events').EventEmitter;

// PARSE COUCH ERROR
exports.parseCouchError = {

  'returns { message: first_arg }': function (test) {
    var result = helpers.parseCouchError('error', 2, 3);
    test.deepEqual(result, { message: 'error' });
    test.done();
  },

  'adds json property if message could be parsed to json': function (test) {
    test.equal(helpers.parseCouchError('1').json, 1);
    test.done();
  },

  'modifies message if json has an error property': function (test) {
    var result = helpers.parseCouchError('{"error":"sentinel"}');
    test.equal(result.message, 'sentinel');
    test.done();
  },

  'modifies message of json.error to remove underscores': function (test) {
    var result = helpers.parseCouchError('{"error":"a_b"}');
    test.equal(result.message, 'a b');
    test.done();
  },

  'but does not remove underscores on json.error': function (test) {
    var result = helpers.parseCouchError('{"error":"a_b"}');
    test.equal(result.json.error, 'a_b');
    test.done();
  },

  'addes underscore-less reason to message if present': function (test) {
    var result = helpers.parseCouchError('{"error":"a_b","reason":"c_d"}');
    test.deepEqual(result, { message: 'a b: c d',
                             json: { error: 'a_b', reason: 'c_d' } });
    test.done();
  },

  'does not break if json.error suddenly is no string': function (test) {
    var result = helpers.parseCouchError('{"error":{"reason":"c_d"}}');
    test.deepEqual(result, { message: '{"error":{"reason":"c_d"}}',
                             json: { error: { reason: 'c_d' } } });
    test.done();
  },

  'does not break if json.reason suddenly is no string': function (test) {
    var result = helpers.parseCouchError('{"error":"a_b","reason":[]}');
    test.deepEqual(result, { message: 'a b',
                             json: { error: 'a_b', reason: [] } });
    test.done();
  },

  'does not modify message if only reason is present': function (test) {
    var result = helpers.parseCouchError('{"reason":"a_b"}');
    test.deepEqual(result, { message: '{"reason":"a_b"}',
                             json: { reason: 'a_b' } });
    test.done();
  },

};

// LOWER CASE KEYS
exports.lowerCaseKeys = {

  'of an object': function (test) {
    test.deepEqual(helpers.lowerCaseKeys({'ABC': 'ABC'}), {'abc': 'ABC'});
    test.done();
  },
  
  'copies the inital object': function (test) {
    var foo = { 'ABC': 'ABC' },
        bar = helpers.lowerCaseKeys(foo);
    test.deepEqual(bar, {'abc': 'ABC'});
    test.deepEqual(foo, {'ABC': 'ABC'});
    test.done();
  },
  
};

// MERGE
exports.merge = {

  'two objects, updating the latter with the former if undefined':
      function (test) {
    var src = { extra: 1, exists: 2 },
        dest = { other: 3, exists: 4 },
        result = { extra: 1, other: 3, exists: 4 };
    test.deepEqual(helpers.merge(src, dest), result);
    test.done();
  },

  'modifies the target object': function (test) {
    var target = { old: 1 };
    helpers.merge({ new: 2 }, target);
    test.deepEqual(target, { old: 1, new: 2 });
    test.done();
  },

};

// PATCH REQUEST
exports.patchRequest = testCase({

  setUp: function (cb) {
    var test_data = this.data = '{"data":true}',
        f = function (data, test) {
      test.equal(data, test_data);
    };
    req = { write: f, end: f};
    this.patched = helpers.patchRequest(req);
    cb();
  },

  'patches request.write':
  function (test) {
    this.patched.write(this.data, test);
    test.expect(1);
    test.done();
  },

  'patches request.end':
  function (test) {
    this.patched.end(this.data, test);
    test.expect(1);
    test.done();
  },

  'request.write stringifies JSON objects':
  function (test) {
    this.patched.write(JSON.parse(this.data), test);
    test.expect(1);
    test.done();
  },

  'request.end stringifies JSON objects':
  function (test) {
    this.patched.end(JSON.parse(this.data), test);
    test.expect(1);
    test.done();
  },

});

// PREPARE DATA
function testPrepare(setup, expected_data, expected_headers, merger) {
  return function (test) {
    var data;

    setup.data = typeof setup.data === 'undefined' ? this.data : setup.data;
    setup.ct = setup.ct || this.ct;
    setup.headers = setup.headers || this.headers;

    if (typeof expected_data === 'undefined')
      expected_data = setup.data;

    if (typeof expected_headers === 'undefined' &&
        typeof merger === 'undefined') {
      expected_headers = {
        'content-length': '4',
        'expect': '100-continue',
        'content-type': setup.ct,
      };
    } else if (typeof merger !== 'undefined') {
      expected_headers = helpers.merge({
        'content-length': '4',
        'expect': '100-continue',
        'content-type': setup.ct,
      }, merger);
    }

    data = helpers.prepareData(setup.data, setup.ct, setup.headers);

    if (data === null) {
      test.equal(data, expected_data)
    } else {
      test.equal(data.toString(), expected_data.toString());
    }
    test.deepEqual(setup.headers, expected_headers);
    test.done();
  };
}

exports.prepareData = testCase({

  setUp: function (cb) {
    this.ct = 'mime-type';
    this.headers = {};
    this.data = 'data';
    cb();
  },

  'default behaviour': testPrepare({}),

  'content-type is not changed if present': testPrepare(
    { headers: { 'content-type': 'sentinel' }, ct: 'other', data: null },
    null, { 'content-type': 'sentinel', 'content-length': '0' }
  ),

  'content-type is added if not present': testPrepare(
    { data: null, ct: 'sentinel' },
    null, { 'content-type': 'sentinel', 'content-length': '0' }
  ),

  'sets CL to zero and adds no expect header if no data': testPrepare(
    { data: null },
    undefined, { 'content-type': 'mime-type', 'content-length': '0' }
  ),

  'honors defined CL header': testPrepare(
    { headers: { 'content-length': 'sentinel' } },
    undefined, undefined, { 'content-length': 'sentinel' }
  ),

  'honors defined CL header even if no data': testPrepare(
    { headers: { 'content-length': 'sentinel' }, data: null },
    null, { 'content-length': 'sentinel', 'content-type': 'mime-type' }
  ),

  'honors defined expect header': testPrepare(
    { headers: { 'expect': 'sentinel' } },
    undefined, undefined, { 'expect': 'sentinel' }
  ),
  
  'String': testPrepare(
    { data: '12345' }, '12345', undefined, { 'content-length': 5 }
  ),

  'Array': testPrepare(
    { data: [1,2,3,4,5] }, [1,2,3,4,5], undefined, { 'content-length': 5 }
  ),

  'Buffer': testPrepare(
    { data: Buffer([1,2,3,4,5]) },
    new Buffer([1,2,3,4,5]), undefined, { 'content-length': 5 }
  ),

  'EventEmitter': testPrepare(
    { data: new EventEmitter() },
    new EventEmitter(),
    { 'content-type': 'mime-type', expect: '100-continue',
      'transfer-encoding': 'chunked' }
  ),

  'JSON': testPrepare(
    { data: function () {} },
    '"function () {}"', undefined, { 'content-length': 16 }
  ),

});

// SEND
exports.send = {

  'writes regular data': function (test) {
    helpers.send({ write: function (data) {
      test.equal(data, 'data');
      test.done();
    } }, 'data');
  },

  'writes data when emitted': function (test) {
    var emitter = new EventEmitter();
    helpers.send({ write: function (data) {
      test.equal(data, 'chunk');
    } }, emitter);
    emitter.emit('data', 'chunk');
    test.expect(1);
    test.done();
  },

};

// EXISTS PATTERN
function existsTest(code, check) {
  return function (test) {
    this.res.statusCode = code;
    helpers.existsPattern.apply(
      this.mock, ['name', function (exists) { test.equal(exists, check) }] 
    );
    this.res.emit('end');
    test.expect(1);
    test.done();
  }
}

exports.existsPattern = testCase({
  
  setUp: function (cb) {
    this.mock = { _raw: function (options, callback) { callback(null) } };
    this.pathForId = helpers.pathForId;
    helpers.pathForId = function (name) { return name };
    cb();
  },

  tearDown: function (cb) {
    helpers.pathForId = this.pathForId;
    cb();
  },
  
  'false on errors': function (test) {
    this.mock = { _raw: function (options, callback) { callback('error') } };
    helpers.existsPattern.call(this.mock, 'name', function (exists) {
      test.equal(exists, false);
      test.done();
    });
  },

  'true otherwise': function (test) {
    helpers.existsPattern.call(this.mock, 'name', function (exists) {
      test.equal(exists, true);
      test.done();
    });
  },

  'works without a name': function (test) {
    helpers.existsPattern.call(this.mock, function (exists) {
      test.equal(exists, true);
      test.done();
    });
  },

});

// PATH FOR ID

exports.pathForId = {

  'URL-encodes funny characters': function (test) {
    test.equal(helpers.pathForId(' /%$?+'), '%20%2F%25%24%3F%2B');
    test.done();
  },

  'but maintains the first / if started with a _': function (test) {
    test.equal(helpers.pathForId('_///'), '_/%2F%2F');
    test.done();
  },

  'throws a TypeError if no ID is given': function (test) {
    test.throws(helpers.pathForId, TypeError);
    test.done();
  },

};

// REDIRECT CALLBACK

function redirectTest(state, method, code) {
  var response = { statusCode: code, headers: { location: true } };

  return function (test) {
    var cb = helpers.redirectCallback(method, function (loc, res) {
          test.deepEqual(res, response);
          test.equal(loc, state);
          test.done();
        });

    cb(response);
  };
}

exports.redirectCallback = {

  'redirects on 301s of GET': redirectTest(true, 'GET', 301),
  'redirects on 301s of HEAD': redirectTest(true, 'HEAD', 301),
  'redirects on 302s of GET': redirectTest(true, 'GET', 302),
  'redirects on 302s of HEAD': redirectTest(true, 'HEAD', 302),
  'redirects on 303s of ANY': redirectTest(true, 'ANY', 303),
  'redirects on 307s of GET': redirectTest(true, 'GET', 307),
  'redirects on 307s of HEAD': redirectTest(true, 'HEAD', 307),

  'does not redirect on 300s of ANY': redirectTest(null, 'ANY', 300),
  'does not redirect on 301s of COPY': redirectTest(null, 'COPY', 301),
  'does not redirect on 301s of POST': redirectTest(null, 'POST', 301),
  'does not redirect on 301s of PUT': redirectTest(null, 'PUT', 301),
  'does not redirect on 302s of COPY': redirectTest(null, 'COPY', 302),
  'does not redirect on 302s of POST': redirectTest(null, 'POST', 302),
  'does not redirect on 302s of PUT': redirectTest(null, 'PUT', 302),
  'does not redirect on 304s of GET': redirectTest(null, 'GET', 304),
  'does not redirect on 304s of ANY': redirectTest(null, 'ANY', 304),
  'does not redirect on 305s of GET': redirectTest(null, 'GET', 305),
  'does not redirect on 305s of ANY': redirectTest(null, 'ANY', 305),
  'does not redirect on 306s of GET': redirectTest(null, 'GET', 306),
  'does not redirect on 306s of ANY': redirectTest(null, 'ANY', 306),
  'does not redirect on 307s of COPY': redirectTest(null, 'COPY', 307),
  'does not redirect on 307s of POST': redirectTest(null, 'POST', 307),
  'does not redirect on 307s of PUT': redirectTest(null, 'PUT', 307),
  'does not redirect on 308s of ANY': redirectTest(null, 'ANY', 308),

};

// READ RESPONSE

exports.readResponse = testCase({

  setUp: function (cb) {
    var response = this.response = new EventEmitter();

    response.statusCode = 200;
    response.headers = { 'content-type': 'application/json' };
    this.emit = function () { response.emit('data', Buffer('data')) };
    this.error = function () { response.emit('close', 'error') };
    this.end = function () { response.emit('end') };

    this.joinBuffers = helpers.joinBuffers;
    helpers.joinBuffers = function (b) { return b.join('') };

    cb();
  },

  tearDown: function (cb) {
    helpers.joinBuffers = this.joinBuffers;
    cb();
  },

  'callback with response buffers': function (test) {
    helpers.readResponse(null, this.response, function (err, data) {
      test.equal(err, null);
      test.equal(data, 'datadata');
      test.done();
    });
    this.emit();
    this.emit();
    this.end();
  },

  'callback with response buffers and error': function (test) {
    helpers.readResponse(null, this.response, function (err, data) {
      test.equal(err, 'error');
      test.equal(data, 'data');
      test.done();
    });
    this.emit();
    this.error();
  },

  'callback with response error': function (test) {
    helpers.readResponse(null, this.response, function (err, data) {
      test.equal(err, 'error');
      test.equal(data, null);
      test.done();
    });
    this.error();
  },

  'callback with status error': function (test) {
    this.response.statusCode = 301; // valid redirects are caught earlier
    helpers.readResponse(HttpError, this.response, function (err, data) {
      test.equal(err.code, 301);
      test.equal(err.message, 'data');
      test.equal(err.name, 'Moved Permanently');
      test.equal(data, 'data');
      test.done();
    });
    this.emit();
    this.end();
  },

});

// JOIN BUFFERS

exports.joinBuffers = {

  'single buffer': function (test) {
    var buffer = helpers.joinBuffers([Buffer('test')]);

    test.equal(buffer, 'test');
    test.ok(Buffer.isBuffer(buffer));
    test.done();
  },

  'multiple buffers': function (test) {
    var buffer = helpers.joinBuffers(
      [ Buffer('test'), Buffer(''), Buffer(' me '), Buffer(''), Buffer('too') ]
    );

    test.equal(buffer, 'test me too');
    test.ok(Buffer.isBuffer(buffer));
    test.done();
  },

}
