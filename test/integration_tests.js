require.paths.push(__dirname);

var http = require('http'),
    testCase = require('nodeunit').testCase,
    url = require('url'),
    couch_client = require('lib/client'),
    api = require('lib/api'),
    CouchClient = couch_client.CouchClient,
    DEFAULT_URL_STRING = 'http://localhost:5984',
    DEFAULT_URL = url.parse(DEFAULT_URL_STRING),
    TEST_DB_BASE = 'couch_client_test_';

function makeTestDb(base) {
  return base + Math.floor(Math.random() * 1000000);
}

// ready...
// ensure the database is running
(function () {
  var req = http.request({
    host: DEFAULT_URL.hostname, port: DEFAULT_URL.port,
  }, function (res) {
    var body = [];

    res.on('error', function (err) {
      console.log('Response error for ' + DEFAULT_URL_STRING);
      console.log(err);
      console.log('URL not pointing to a CouchDB?');
      process.exit(1);
    });

    res.setEncoding('utf8');

    res.on('data', function (chunk) {
      chunk && body.push(chunk);
    });

    res.on('end', function () {
      try {
        body = JSON.parse(body.join(''));
      } catch (e) {
        console.log('JSON parse error for ' + DEFAULT_URL_STRING);
        console.log(body);
        console.log('URL not pointing to a CouchDB?');
        process.exit(1);
      }

      if (body.couchdb && body.couchdb === 'Welcome') {
        /*
        console.log('Using CouchDB ' + body.version +
                    ' at ' + DEFAULT_URL_STRING);
                    */
      } else {
        console.log('Unexpected JSON for ' + DEFAULT_URL_STRING);
        console.log(body);
        console.log('URL not pointing to a CouchDB?');
        process.exit(1);
      }
    });

  });

  req.on('error', function (err) {
    console.log('Request error for ' + DEFAULT_URL_STRING);
    console.log(err);
    console.log('CouchDB not running?');
    process.exit(1);
  });

  req.end();
})();

// set...
// ensure our client library has basic funtionality
exports['ensure CouchClient functionality'] = testCase({
  setUp: function (cb) {
    this.client = new CouchClient(DEFAULT_URL_STRING);
    cb();
  },

  'new returns a client instance': function (test) {
    test.ok(this.client instanceof CouchClient);
    test.done();
  },

  'that should respond to getUrl': function (test) {
    test.equal(typeof this.client.getUrl, 'function');
    test.done();
  },

  'getUrl returns the URL used for the tests': function (test) {
    var parsed = url.parse(this.client.getUrl());
    test.deepEqual(parsed, DEFAULT_URL);
    test.done();
  },
  
  'the client responds to resource': function (test) {
    test.equal(typeof this.client.resource, 'function');
    test.done();
  },
  
  'and resource works as expected': function (test) {
    var res = this.client.resource('db', 'doc');
    test.equal(res.getUrl(), DEFAULT_URL_STRING + '/db/doc');
    test.done();
  },
});


// go!
// start testing!

// request tests

function assertRequest(req) {
  this.equals(typeof req.on, 'function');
  this.equals(typeof req.write, 'function');
  this.equals(typeof req.end, 'function');
  this.equals(typeof req.agent, 'object');
  req.end();
  this.ok(req.finished);
}

function returnsRequest(method) {
  return function (test) {
    var req = this.client[method]();
    assertRequest.apply(test, [req]);
    test.done();
  }
}

exports['CouchClient request'] = testCase({
  setUp: function (cb) {
    this.client = CouchClient(DEFAULT_URL_STRING);
    cb();
  },

  'copy': returnsRequest('copy'),
  'get': returnsRequest('get'),
  'head': returnsRequest('head'),
  'delete': returnsRequest('delete'),
  'post': returnsRequest('post'),
  'put': returnsRequest('put'),
});

// response tests

function testStatus(method, code, path) {
  return function (test) {
    var req = this.client[method](path, function (res) {
      test.equals(res.statusCode, code);
      test.done();
    });
    req.end();
  }
}

exports['CouchClient response'] = testCase({
  setUp: function (cb) {
    this.client = CouchClient(DEFAULT_URL_STRING);
    cb();
  },

  '405 on COPY /': testStatus('copy', 405),
  '405 on DELETE /': testStatus('delete', 405),
  '200 on GET /': testStatus('get', 200),
  '200 on GET //': testStatus('get', 200, '/'),
  '200 on HEAD /': testStatus('head', 200),
  '405 on POST /': testStatus('post', 405),
  '405 on PUT /': testStatus('put', 405),
});

// interactive client tests

function createDatabase(test, client, next) {
  var req = client.put(client.test_db, function (res) {
    res.on('close', function (err) { abort(test, err) });
    test.equal(res.statusCode, 201);
    res.on('end', function () {
      callNext(test, client, next);
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function deleteDatabase(test, client, next) {
  var req = client.delete(client.test_db, function (res) {
    res.on('close', function (err) { abort(test, err) });
    test.equal(res.statusCode, 200);
    res.on('end', function () { callNext(test, client, next) });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function createDocument(test, client, next) {
  var doc = client.resource(client.test_db, 'doc');
  
  var req = doc.put({data: { key: function () {} }}, function (res) {
    var body = [];

    res.setEncoding('utf8');
    test.equal(res.statusCode, 201);
    res.on('error', function (err) { abort(test, err) });
    res.on('data', function (raw) { raw && body.push(raw) });
    res.on('end', function () {
      var json = JSON.parse(body.join(''));

      test.equal(json.id, 'doc');
      test.ok(json.rev);
      callNext(test, client, next);
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function bulkAddDocuments(test, client, next) {
  var handle = client.resource(client.test_db, '_bulk_docs'),
      opts = {
    data: { docs: [
        {_id: '1', prop: 'val1'},
        {_id: '2', prop: 'val2'},
        {_id: '3', prop: 'val3'}
    ]},
  };

  var req = handle.post(opts, function (res) {
    var body = [];

    res.setEncoding('utf8');
    test.equal(res.statusCode, 201);
    res.on('error', function (err) { abort(test, err) });
    res.on('data', function (data) { data && body.push(data) });
    res.on('end', function () {
      var json = JSON.parse(body.join(''));

      test.ok(Array.isArray(json));
      test.equal(json.length, 3);
      
      for (var i = json.length; i--;) {
        test.equal(typeof json[i].error, 'undefined');
      }

      callNext(test, client, next);
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function createView(test, client, next) {
  var db = client.resource(client.test_db);
      ddoc = {
        _id: '_design/test',
        language: 'javascript',
        views: {
          example: {
            map: function (doc) { emit(null, doc.prop) },
          }
        }
      };
      
  var req = db.put({path: '_design/test', data: ddoc}, function (res) {
    res.on('close', function (err) { abort(test, err) });
    test.equal(res.statusCode, 201);
    callNext(test, client, next);
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function queryView(test, client, next) {
  var view = client.resource(
        client.test_db, '_design', 'test', '_view', 'example'
      ),
      opts = { query: { descending: true } };

  var req = view.get(opts, function (res) {
    var body = [];

    res.setEncoding('utf8');
    test.equal(res.statusCode, 200);
    res.on('error', function (err) { abort(test, err) });
    res.on('data', function (data) { data && body.push(data) });
    res.on('end', function () {
      var json = JSON.parse(body.join(''));

      test.equal(json.offset, 0);
      test.equal(json.total_rows, 3);
      test.equal(json.rows.length, 3);
      callNext(test, client, next);
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function fetchDocument(test, client, next) {
  var doc = client.resource(client.test_db, 'doc');

  var req = doc.get(function (res) {
    var body = [];

    res.setEncoding('utf8');
    test.equal(res.statusCode, 200);
    res.on('error', function (err) { abort(test, err) });
    res.on('data', function (data) { data && body.push(data) });
    res.on('end', function () {
      var json = JSON.parse(body.join(''));

      test.equal(json._id, 'doc');
      test.ok(json._rev);
      test.equal(json.key, 'function () {}');
      callNext(test, client, next);
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function updateDocument(test, client, next) {
  var doc = client.resource(client.test_db, 'doc');

  var req = doc.get(function (res) {
    var body = [];

    res.setEncoding('utf8');
    test.equal(res.statusCode, 200);
    res.on('error', function (err) { abort(test, err) });
    res.on('data', function (data) { data && body.push(data) });
    res.on('end', function () {
      var json = JSON.parse(body.join(''));
      json.more = 'stuff';

      req = doc.put({data: json}, function (res) {
        body = [];
        res.setEncoding('utf8');
        test.equal(res.statusCode, 201);
        res.on('error', function (err) { abort(test, err) });
        res.on('data', function (data) { data && body.push(data) });
        res.on('end', function () {
          json = JSON.parse(body.join(''));
          test.equal(json.id, 'doc');
          test.ok(json.rev);
          callNext(test, client, next);
        });
      });
      req.on('error', function (err) { abort(test, err) });
      req.end();
    });
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function deleteDocument(test, client, next) {
  var doc = client.resource(client.test_db, 'doc');

  var req = doc.head(function (res) {
    var opts = { headers: { 'if-match': res.headers['etag'] } };

    req = doc.delete(opts, function (res) {
      res.on('close', function (err) { abort(test, err) });
      test.equal(res.statusCode, 200);
      res.on('end', function () { callNext(test, client, next) });
    });
    req.on('error', function (err) { abort(test, err) });
    req.end();
  });
  req.on('error', function (err) { abort(test, err) });
  req.end();
}

function abort(test, err) {
 test.equal(err, null);
 clearTimeout(test.timer_id);
 test.done();
}

function callNext(test, client, next) {
  if (next.length) {
    next.shift()(test, client, next);
  } else {
    client.clean_exit = true;
    clearTimeout(test.timer_id);
    test.done();
  }
}

function timerSetup(test) {
  var test_db = this.client.test_db;

  test.timer_id = setTimeout(function () {
    abort(test, Error('timeout'));
  }, 1500);
}

exports.CouchClient = testCase({

  setUp: function (cb) {
    this.client = CouchClient(DEFAULT_URL_STRING);
    this.client.test_db = makeTestDb(TEST_DB_BASE);
    this.client.clean_exit = false;
    cb();
  },

  tearDown: function (cb) {
    if (!this.client.clean_exit) {
      // at least try to clean up the mess we made...
      var client = CouchClient(DEFAULT_URL_STRING),
          test_db = this.client.test_db,
          req = client.get('_all_dbs', function (res) {
            var body = [];

            res.on('close', function (err) { throw err });
            res.on('data', function (chunk) { chunk && body.push(chunk) });
            res.on('end', function () {
              var dbs = JSON.parse(body.join(''));

              if (~dbs.indexOf(test_db)) {
                req = client.delete(test_db, function (res) {
                  res.on('close', function (err) { throw err });
                });
                req.on('error', function (err) { throw err });
                req.end();
              }
            });
          });
      req.on('error', function (err) { throw err });
      req.end();
    }

    cb();
  },

  'create and delete a database': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [deleteDatabase]);
  },

  'create and fetch a document': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [
      createDocument, fetchDocument, deleteDatabase
    ]);
  },

  'update and delete a document': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [
      createDocument, updateDocument, deleteDocument, deleteDatabase
    ]);
  },

  'add documents in bulk': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [
      bulkAddDocuments, deleteDatabase
    ]);
  },

  'create a design view': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [
      createDocument, createView, deleteDatabase
    ]);
  },

  'query a design view': function (test) {
    timerSetup.call(this, test);
    createDatabase(test, this.client, [
      createView, bulkAddDocuments, queryView, deleteDatabase
    ]);
  },

});

// api method tests

function testJson(options) {
  return function (test) {
    function callback(err, json) {
      test.equal(err, null);
      test.equal(typeof json, 'object');
      test.equal(json.couchdb, "Welcome");
      test.ok(json.version);
      test.done();
    }
    doApiTest(this.api.json.bind(this.api), options, callback);
  };
}

function testString(options) {
  return function (test) {
    function callback(err, string) {
      test.equal(err, null);
      test.equal(typeof string, 'string');
      test.equal(string.slice(0, 32), '{"couchdb":"Welcome","version":"');
      test.done();
    }
    doApiTest(this.api.string.bind(this.api), options, callback);
  };
}

function testRaw(options) {
  return function (test) {
    function callback(err, buffer) {
      test.equal(err, null);
      test.ok(buffer instanceof Buffer);
      test.equal(
        buffer.toString().slice(0, 32),
        '{"couchdb":"Welcome","version":"'
      );
      test.done();
    }
    doApiTest(this.api.raw.bind(this.api), options, callback);
  };
}

function doApiTest(f, options, callback) {
  if (options) {
    f(options, callback);
  } else {
    f(callback);
  }
}

function findUnusedPort(api, callback) {
  var port = Math.floor(Math.random() * 50000) + 15000;
  request = api.request({ port: port });
  request.on('error', function (err) {
    if (err && err.code && err.code === 'ECONNREFUSED') {
      callback(port);
    } else {
      findUnusedPort(api, callback);
    }
  });
  request.on('response', function (res) { findUnusedPort(api, callback) });
  request.end();
}

exports['CouchAPI#json,string,raw'] = testCase({

  setUp: function (cb) {
    this.api = new api.CouchAPI(DEFAULT_URL_STRING);
    cb();
  },

  'json with options': testJson({ method: 'GET' }),
  'json with path': testJson('/'),
  'json without options': testJson(),

  'string with options': testString({ method: 'GET' }),
  'string with path': testString('/'),
  'string without options': testString(),

  'raw with options': testRaw({ method: 'GET' }),
  'raw with path': testRaw('/'),
  'raw without options': testRaw(),

  'return the ECONNREFUSED error if couch is not running': function (test) {
    var api = this.api;

    findUnusedPort(api, function (port) {
      api.json({ port: port }, function (err, json) {
        test.ok(err);
        test.equal(err.code, 'ECONNREFUSED');
        test.equal(json, null);
        test.done();
      });
    });
  },

  'return the HttpError if the response was not good': function (test) {
    this.api.json({ method: 'POST' }, function (err, json) {
      test.ok(err);
      test.equal(err.code, 405);
      test.equal(err.name, 'Method Not Allowed');
      test.equal(err.message, 'method not allowed: Only GET,HEAD allowed');
      test.deepEqual(
        err.json, { error: 'method_not_allowed', reason: 'Only GET,HEAD allowed' }
      );
      test.deepEqual(
        json, { error: 'method_not_allowed', reason: 'Only GET,HEAD allowed' }
      );
      test.done();
    });
  },

});

exports['Server#create,destroy'] = {

  'creates and destroys a database': function (test) {
    var server = new api.Server(DEFAULT_URL_STRING),
        db = makeTestDb(TEST_DB_BASE);

    server.create(db, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        test.ok(json && json.ok);
        server.destroy(db, function (err, json) {
          test.equal(err, null);
          test.ok(json && json.ok);
          test.done();
        });
      }
    });
  },

};

exports['Server#exists'] = testCase({

  setUp: function (cb) {
    this.server = new api.Server(DEFAULT_URL_STRING);
    cb();
  },

  'checks if the server exists without arguments': function (test) {
    this.server.exists(function (found) {
      test.ok(found);
      test.done();
    });
  },

  'yields false if a database does not exist': function (test) {
    // this way we also test URL-encoding: check for a DB with name '/'
    this.server.exists('/', function (found) {
      test.ok(!found);
      test.done();
    });
  },

  'yields true if a database exists': function (test) {
    var server = this.server;

    server.create('db', function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        server.exists('db', function (found) {
          test.ok(found);
          test.done();
          server.destroy('db');
        });
      }
    });
  },

});

function setUpDatabase(cb) {
  this.server = api.Server(DEFAULT_URL_STRING);
  this.db_name = makeTestDb(TEST_DB_BASE);
  this.db = this.server.database(this.db_name);
  this.server.create(this.db_name, function (err) {
    if (err) throw err;
    cb();
  });
}

function tearDownDatabase(cb) {
  this.server.destroy(this.db_name, function (err) {
    if (err) throw err;
      cb();
  });
}

exports['Database#save'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'saves a document': function (test) {
    var doc = { foo: 'bar' };

    this.db.save(doc, function (err, json) {
      test.equal(err, null);
      test.equal(json.id, doc._id);
      test.equal(json.rev, doc._rev);
      test.ok(json.ok);
      test.done();
    });
  },

  'updates a document': function (test) {
    var doc = { foo: 'bar' }, db = this.db;

    this.db.save(doc, function (err, json) {
      var old_rev;

      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        doc.other = 'stuff';
        old_rev = doc._rev;

        db.save(doc, function (err, json) {
          test.equal(err, null);
          test.ok(json.ok);
          test.equal(json.id, doc._id);
          test.equal(json.rev, doc._rev);
          test.notEqual(old_rev, json.rev);
          test.done();
        });
      }
    });
  },

  'reports update conflicts': function (test) {
    var doc = { foo: 'bar' }, db = this.db;

    this.db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        doc._rev = '2-ABCDEF123456';
        db.save(doc, function (err, json) {
          test.ok(err);
          test.equal(err.code, 409);
          test.equal(err.message, 'conflict: Document update conflict.');
          test.equal(err.name, 'Conflict');
          test.ok(json.error);
          test.done();
        });
      }
    });
  },

  'saves design documents (must have an ID)': function (test) {
    var doc = { _id: '_design/foo' }, db = this.db;

    this.db.save(doc, function (err, json) {
      test.equal(err, null);
      test.equal(json.id, doc._id);
      test.ok(json.ok);
      db.exists(doc._id, function (found) {
        test.ok(found);
        test.done();
      });
    });
  },


});

exports['Database#saveAll'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'saves a bunch of documents': function (test) {
    this.db.saveAll([{a: 1}, {b: 2}, {c: 3}], function (err, json) {
      test.equal(err, null);
      test.ok(Array.isArray(json));

      for (var i = json.length; i--;) {
        test.ok(json[i].id);
        test.ok(json[i].rev);
        test.ok(!json[i].error);
      }

      test.done();
    });
  },

  'does not choke on individual conflicts': function (test) {
    var doc = { a: 1},
        docs = [ doc, { b: 2 }, { c: 3} ],
        db = this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        test.ok(json.ok);
        test.ok(doc._id);
        test.ok(doc._rev);
        delete doc._rev;
        db.saveAll(docs, function (err, json) {
          test.equal(err, null);
          test.equal(typeof doc._rev, 'undefined');
          test.equal(json[0].error, 'conflict');
          test.ok(json[1].rev);
          test.ok(json[2].rev);
          test.done();
        });
      }
    });
  },

});

exports['Database#load'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'returns a 404 if the document does not exist': function (test) {
    this.db.load('whatever', function (err, json) {
      test.equal(err.name, 'Not Found');
      test.equal(err.code, 404);
      test.equal(err.message, 'not found: missing');
      test.deepEqual(json, { error: 'not_found', reason: 'missing' });
      test.done();
    });
  },

  'regular documents': function (test) {
    var doc = { foo: 'bar' }, db = this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.load(doc._id, function (err, json) {
          test.equal(err, null);
          test.deepEqual(json, doc);
          test.done();
        });
      }
    });
  },

  'design documents': function (test) {
    var doc = { _id: '_design/foo' }, db = this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.load(doc._id, function (err, json) {
          test.equal(err, null);
          test.deepEqual(json, doc);
          test.done();
        });
      }
    });
  },

});

exports['Database#duplicate'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'a document': function (test) {
    var doc = { foo: 'bar' }, db =this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.duplicate(doc, 'test', function (err, json) {
          if (err) {
            test.equal(err, null);
            test.done();
          } else {
            db.load(json.id, function (err, json) {
              test.equal(err, null);
              test.equal(json.foo, 'bar');
              test.done();
            });
          }
        });
      }
    });
  },

  'an ID': function (test) {
    var db = this.db;

    db.save({ _id: 'from' }, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.duplicate('from', 'to', function (err, json) {
          test.equal(err, null);
          test.equal(json.id, 'to');
          test.done();
        });
      }
    });
  },

});

exports['Database#remove'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'remove a document ID': function (test) {
    var db = this.db;

    db.save({ _id: 'remove' }, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.remove('remove', function (err, json) {
          test.equal(err, null);
          test.ok(json.ok);
          test.done();
        });
      }
    });
  },
  
  'remove a (design) document': function (test) {
    var doc = { _id: '_design/test' }, db = this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.remove(doc, function (err, json) {
          test.equal(err, null);
          test.ok(json.ok);
          test.notEqual(json.rev, doc._rev);
          test.done();
        });
      }
    });
  },

});

exports['Database#removeAll'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'remove a few documents': function (test) {
    var docs = [ {}, {}, {} ], db = this.db;

    db.saveAll(docs, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        for (var i = json.length; i--;) {
          test.equal(json[i].error, null);
          test.equal(json[i].reason, null);
        }
        db.removeAll(docs, function (err, json) {
          test.equal(err, null);
          for (var i = json.length; i--;) {
            test.equal(json[i].error, null);
            test.equal(json[i].reason, null);
          }
          test.done();
        });
      }
    });
  },
  
});

exports['Database#revision'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'fetch a documents revision': function (test) {
    var doc = { _id: 'test' }, db = this.db;

    db.save(doc, function (err, json) {
      if (err) {
        test.equal(err, null);
        test.done();
      } else {
        db.revision(doc._id, function (err, rev) {
          test.equal(err, null);
          test.equal(rev, doc._rev);
          test.done();
        });
      }
    });
  },
  
});

function testExistsDoc(test, db, doc) {
  db.exists(doc._id, function (exists) { test.ok(!exists)});
  db.save(doc, function (err, json) {
    if (err) {
      test.equal(err, null);
      test.done();
    } else {
      db.exists(doc._id, function (exists) {
        test.ok(exists);
        test.done();
      });
    }
  });
}

exports['Database#exists'] = testCase({

  setUp: function (cb) { setUpDatabase.call(this, cb) },

  tearDown: function (cb) { tearDownDatabase.call(this, cb) },

  'check for regular documents': function (test) {
    testExistsDoc(test, this.db, { _id: 'te/st' });
  },
  
  'check for design documents': function (test) {
    testExistsDoc(test, this.db, { _id: '_design/te/st' });
  },

});

