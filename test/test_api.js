require.paths.push(__dirname);

var api = require('lib/api'),
    helpers = require('lib/helpers'),
    testCase = require('nodeunit').testCase,
    url = require('url'),
    events = require('events'),
    http = require('http'),
    DEFAULT_URL_STRING = 'http://localhost:5984';

exports['CouchAPI#constructor'] = {

  'creates a new instance without new': function (test) {
    var couch = api.CouchAPI();
    test.ok(couch instanceof api.CouchAPI);
    test.done();
  },

  'creates an instance with the given parameters': function (test) {
    var couch = api.CouchAPI('proto://server:1234', { h: 'v' });
    test.equal(couch.protocol, 'proto:');
    test.equal(couch.options.host, 'server');
    test.equal(couch.options.port, 1234);
    test.equal(couch.options.headers.h, 'v');
    test.done();
  },

  'CouchAPI has a numeric max_redirects property': function (test) {
    test.equal(typeof api.CouchAPI.max_redirects, 'number');
    test.done();
  },

};

exports['CouchAPI#json'] = testCase({

  setUp: function (cb) {
    this.couch = new api.CouchAPI(DEFAULT_URL_STRING);
    this.couch._string = function (options, callback) {
      callback(null, '"json"');
    };
    cb();
  },

  'parses strings to JSON': function (test) {
    this.couch.json('options', function (err, data) {
      test.equal(data, 'json');
      test.done();
    });
  },
  
  'does not need an options value': function (test) {
    this.couch.json(function (err, data) {
      test.equal(data, 'json');
      test.done();
    });
  },

  'does not need a callback': function (test) {
    test.doesNotThrow(this.couch.json.bind(this.couch), 'options');
    test.done();
  },

  'does not need any paramters': function (test) {
    test.doesNotThrow(this.couch.json.bind(this.couch));
    test.done();
  },

  'returns the received error': function (test) {
    this.couch._string = function (options, callback) {
      callback('error', '"json"');
    };
    this.couch.json(function (err, data) {
      test.equal(err, 'error');
      test.equal(data, 'json');
      test.done();
    });
  },

  'returns a SyntaxError if data is not JSON': function (test) {
    this.couch._string = function (options, callback) {
      callback(null, 'not json');
    };
    this.couch.json(function (err, data) {
      test.equal(data, 'not json');
      test.ok(err);
      test.equal(err.name, 'SyntaxError');
      test.done();
    });
  },

});

exports['CouchAPI#string'] = testCase({

  setUp: function (cb) {
    this.couch = new api.CouchAPI(DEFAULT_URL_STRING);
    this.couch._raw = function (options, callback) {
      callback(null, Buffer('raw'));
    };
    cb();
  },

  'converts buffers to strings': function (test) {
    this.couch.string('options', function (err, data) {
      test.equal(typeof data, 'string');
      test.equal(data, 'raw');
      test.done();
    });
  },
  
  'does not need an options value': function (test) {
    this.couch.string(function (err, data) {
      test.equal(data, 'raw');
      test.done();
    });
  },

  'does not need a callback': function (test) {
    test.doesNotThrow(this.couch.string.bind(this.couch), 'options');
    test.done();
  },

  'does not need any paramters': function (test) {
    test.doesNotThrow(this.couch.string.bind(this.couch));
    test.done();
  },

  'makes use of options.encoding if given': function (test) {
    var b64 = Buffer('test').toString('base64');

    this.couch._raw = function (options, callback) {
      callback(null, Buffer('test'));
    };
    this.couch.string({ encoding: 'base64' }, function (err, data) {
      test.equal(data, b64);
      test.done();
    });
  },

  'returns the received error': function (test) {
    this.couch._raw = function (options, callback) {
      callback('error', Buffer('test'));
    };
    this.couch.string(function (err, data) {
      test.equal(err, 'error');
      test.equal(data, 'test');
      test.done();
    });
  },

  'returns an error when not receiving a buffer': function (test) {
    this.couch._raw = function (options, callback) {
      callback(null, { foo: 'bar' });
    };
    this.couch.string(function (err, data) {
      test.equal(err.message, 'not a buffer');
      test.deepEqual(data, { foo: 'bar' });
      test.done();
    });
  },

  'but does not mask earlier errors': function (test) {
    this.couch._raw = function (options, callback) {
      callback('real error', { foo: 'bar' });
    };
    this.couch.string(function (err, data) {
      test.equal(err, 'real error');
      test.deepEqual(data, { foo: 'bar' });
      test.done();
    });
  },

});

exports['CouchAPI#raw'] = testCase({

  setUp: function (cb) {
    var request = this.request = new events.EventEmitter(),
        response = this.response = new events.EventEmitter();

    request.end = function () {};
    this.couch = new api.CouchAPI(DEFAULT_URL_STRING);
    this.couch.request = function (options, redirCb) {
      redirCb(response);
      return request;
    };

    this.readResponse = helpers.readResponse;
    helpers.readResponse = function (E, res, userCb) {
      // called by the rawCallback for @reques
      res.on('close', function (err) { userCb(err, new Buffer('data')) });
      res.on('end', function () { userCb(null, new Buffer('data')) });
    };
    
    this.redirectCallback = helpers.redirectCallback;
    this._redirect = function () {};
    helpers.redirectCallback = function (method, rawCb) {
      // callback sent to #request
      return function (res) {
        res.on('redirect', function (url) { rawCb(url, res) });
        res.on('data', function () { rawCb(null, res) });
      }
    };
    cb();
  },

  tearDown: function (cb) {
    helpers.readResponse = this.readResponse;
    helpers.redirectCallback = this.redirectCallback;
    cb();
  },

  'converts requests to buffers': function (test) {
    this.couch.raw('options', function (err, data) {
      test.ok(Buffer.isBuffer(data));
      test.equal(data, 'data');
      test.done();
    });
    this.response.emit('data');
    this.response.emit('end');
  },
  
  'does not need options': function (test) {
    this.couch.raw(function (err, data) {
      test.ok(Buffer.isBuffer(data));
      test.equal(data.toString(), 'data');
      test.done();
    });
    this.response.emit('data');
    this.response.emit('end');
  },

  'does not need a callback': function (test) {
    test.doesNotThrow(this.couch.raw.bind(this.couch), 'options');
    this.response.emit('data');
    this.response.emit('end');
    test.done();
  },
  
  'does not need any parameters': function (test) {
    test.doesNotThrow(this.couch.raw.bind(this.couch));
    this.response.emit('data');
    this.response.emit('end');
    test.done();
  },

  'passes options to the request': function (test) {
    var request = this.request;

    this.couch.request = function (options, cb) {
      test.equal(options, 'options');
      test.done();
      return request;
    }
    this.couch.raw('options');
  },

  'sends the request error to the callback': function (test) {
    this.couch.raw('options', function (err, data) {
      test.equal(err, 'req-error');
      test.equal(data, null);
      test.done();
    });
    this.request.emit('error', 'req-error');
  },
  
  'sends the response error to the callback': function (test) {
    this.couch.raw('options', function (err, data) {
      test.equal(err, 'res-error');
      test.equal(data, 'data');
      test.done();
    });
    this.response.emit('data');
    this.response.emit('close', 'res-error');
  },
  
  'calls helpers.redirectCallback with method GET': function (test) {
    helpers.redirectCallback = function (method, callback) {
      test.equal(method, 'GET');
      test.equal(typeof callback, 'function');
      test.done();
      return function () {};
    };
    this.couch.raw();
  },

  'calls helpers.redirectCallback with options.method': function (test) {
    helpers.redirectCallback = function (method, callback) {
      test.equal(method, 'METHOD');
      test.equal(typeof callback, 'function');
      test.done();
      return function () {};
    };
    this.couch.raw({ method: 'METHOD' });
  },

  'calls _redirect with Location and options on redirects': function (test) {
    this.couch._redirect = function (url, options, callback) {
      test.equal(url, 'location');
      test.equal(options, 'options');
      test.equal(typeof callback, 'function');
      test.done();
    };
    this.couch.raw('options');
    this.response.emit('redirect', 'location');
  },

});

exports['CouchAPI#_redirect'] = testCase({

  setUp: function (cb) {
    this.raw = api.CouchAPI.prototype.raw;
    api.CouchAPI.prototype.raw = function () {};
    this.couch = new api.CouchAPI(DEFAULT_URL_STRING);
    cb();
  },

  tearDown: function (cb) {
    api.CouchAPI.prototype.raw = this.raw;
    cb();
  },

  'emits error on too many callbacks': function (test) {
    api.CouchAPI.prototype.raw = function (opts, callback) {
      this._redirect('somewhere', {}, callback);
    };
    this.couch._redirect('start', {}, function (err, data) {
      test.ok(err instanceof Error);
      test.equal(err.message, 'too many redirects');
      test.equal(data, null);
      test.done();
    });
  },

  'creates a new instance and calls raw with options': function (test) {
    var opts = { method: 'METHOD', query: 'QUERY', headers: 'HEADERS' };

    api.CouchAPI.prototype.raw = function (options, cb) {
      test.equal(this.getUrl(), 'proto://target:80/somewhere?p=v');
      test.equal(this._redirects, 1);
      test.deepEqual(options, opts);
      test.equal(cb, 'callback');
      test.done();
    };
    this.couch._redirect('proto://target/somewhere?p=v', opts, 'callback');
  },

});

exports['Server#constructor'] = testCase({
  
  setUp: function (cb) {
    this.server = new api.Server();
    cb();
  },

  'creates a new server instance': function (test) {
    test.ok(this.server);
    test.ok(this.server instanceof api.Server);
    test.done();
  },

  'creates a new server instance without new': function (test) {
    var server = api.Server();

    test.ok(server);
    test.ok(server instanceof api.Server);
    test.done();
  },

  'responds to #getUrl and #json': function (test) {
    test.equal(typeof this.server.json, 'function');
    test.equal(typeof this.server.getUrl, 'function');
    test.equal(this.server.getUrl(), 'http://localhost:5984/');
    test.done();
  },

});

exports['Server#database'] = testCase({

  setUp: function (cb) {
    this.server = new api.Server();
    cb();
  },

  'creates a new Database instance': function (test) {
    var db = this.server.database('db_name');

    test.ok(db instanceof api.Database);
    test.equal(db.options.path, '/db_name');
    test.done();
  },

  'throws TypeError if no name is given': function (test) {
    test.throws(this.server.database, TypeError);
    test.done();
  },

  'URL-encodes the database name': function (test) {
    var db = this.server.database('/+%$@');
    
    test.equal(db.options.path, '/%2F%2B%25%24%40');
    test.done();
  },

});

exports['Server#exits'] = testCase({

  setUp: function (cb) {
    this.existsPattern = helpers.existsPattern;
    this.server = new api.Server();
    cb();
  },

  tearDown: function (cb) {
    helpers.existsPattern = this.existsPattern;
    cb();
  },

  'URL-encodes database names': function (test) {
    var name = '/%@:';

    helpers.existsPattern = function (db) {
      test.equal(db, encodeURIComponent(name));
      test.done();
    }
    this.server.exists(name);
  },

  'does nothing if no arguments are present': function (test) {
    helpers.existsPattern = function (name, callback) {
      test.equal(name, undefined);
      test.equal(callback, undefined);
      test.done();
    }
    this.server.exists();
  },

  'does nothing if only a callback is present': function (test) {
    helpers.existsPattern = function (name, callback) {
      test.equal(typeof name, 'function');
      test.equal(callback, undefined);
      test.done();
    }
    this.server.exists(function () {});
  },

});

exports['Server#create'] = {

  'calls #_db with PUT, name, and callback': function (test) {
    var server = api.Server();

    server._db = function (method, name, callback) {
      test.equal(method, 'PUT');
      test.equal(name, 'NAME');
      test.equal(callback, 'CALLBACK');
      test.done();
    }
    server.create('NAME', 'CALLBACK');
  },

};

exports['Server#destroy'] = {

  'calls #_db with DELETE, name, and callback': function (test) {
    var server = api.Server();

    server._db = function (method, name, callback) {
      test.equal(method, 'DELETE');
      test.equal(name, 'NAME');
      test.equal(callback, 'CALLBACK');
      test.done();
    }
    server.destroy('NAME', 'CALLBACK');
  },

};

exports['Server#_db'] = {

  'calls #_json with options and callback': function (test) {
    var server = api.Server();

    server._json = function (options, callback) {
      test.equal(options.method, 'METHOD');
      test.equal(options.path, 'NAME');
      test.equal(typeof callback, 'function');
      test.done();
    }
    server._db('METHOD', 'NAME', 'CALLBACK');
  },

  'URL-encodes the name': function (test) {
    var server = api.Server(),
        name = '/%:@';

    server._json = function (options, callback) {
      test.equal(options.path, encodeURIComponent(name));
      test.done();
    }
    server._db('METHOD', name, 'CALLBACK');
  },

};

exports['Database#constructor'] = testCase({
  
  setUp: function (cb) {
    this.db = new api.Database();
    cb();
  },

  'creates a new database instance': function (test) {
    test.ok(this.db);
    test.ok(this.db instanceof api.Database);
    test.done();
  },

  'creates a new database instance without new': function (test) {
    var db = api.Database();

    test.ok(db);
    test.ok(db instanceof api.Database);
    test.done();
  },

  'responds to #getUrl and #json': function (test) {
    test.equal(typeof this.db.json, 'function');
    test.equal(typeof this.db.getUrl, 'function');
    test.equal(this.db.getUrl(), 'http://localhost:5984/');
    test.done();
  },

});

function designTest(name, Klass) {
  return function (test) {
    var result = this.db[name]('ddoc/na/me');

    test.ok(result instanceof Klass);
    test.equal(result.options.path, '/_design/ddoc/_' + name + '/na%2Fme');
    test.done();
  };
}

exports['Database#view,show,list,update'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    cb();
  },

  'a new View': designTest('view', api.View),
  'a new Show': designTest('show', api.Show),
  'a new List': designTest('list', api.List),
  'a new Update': designTest('update', api.Update),

  'fails with a TypeError if name not ddoc/name': function (test) {
    test.throws(function () { this.db.view('illegal') }, TypeError);
    test.done();
  },

});

exports['Database#save'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, { id: 'anID', rev: 'aRev' });
    };
    cb();
  },

  'throws type errors if doc not an object': function (test) {
    var db = this.db;

    test.throws(this.db.save, TypeError);
    test.throws(function () { db.save(function () {}) }, TypeError);
    test.done();
  },

  'uses POST and no path if doc has no _id': function (test) {
    this.db._json = function (opts, callback) {
      test.equal(opts.method, 'POST');
      test.equal(opts.path, '');
      test.done();
    };
    this.db.save({}, { method: 'METHOD', path: 'PATH' });
  },

  'uses PUT and ID as path if doc has an _id': function (test) {
    var pfID = helpers.pathForId;

    helpers.pathForId = function () { return 'PATHFORID' };
    this.db._json = function (opts, callback) {
      test.equal(opts.method, 'PUT');
      test.equal(opts.path, 'PATHFORID');
      test.done();
    };
    this.db.save({ _id: 'id' }, { method: 'METHOD', path: 'PATH' });
    helpers.pathForId = pfID;
  },

  'sets document id and rev on success': function (test) {
    var doc = {};

    this.db.save(doc, function (err, json) {
      test.equal(doc._id, 'anID');
      test.equal(doc._rev, 'aRev');
      test.done();
    });
  },

  'sets id on success only if undefined': function (test) {
    var doc = { _id: 'otherID' };

    this.db.save(doc, function (err, json) {
      test.equal(doc._id, 'otherID');
      test.equal(doc._rev, 'aRev');
      test.done();
    });
  },

  'does not set id or rev on errors': function (test) {
    var doc = {};

    this.db._json = function (opts, callback) {
      callback('error', { id: 'anID', rev: 'aRev' });
    };
    this.db.save(doc, function (err, json) {
      test.equal(typeof doc._id, 'undefined');
      test.equal(typeof doc._rev, 'undefined');
      test.done();
    });
  },

});

exports['Database#saveAll'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, [
        { id: 'a', rev: 1 }, { id: 'b', rev: 2 }, { id: 'c', rev: 3 }
      ]);
    };
    cb();
  },

  'modifies the posted documents': function (test) {
    var docs = [{}, {}, {}];

    this.db.saveAll(docs, function (err, json) {
      for (var i = json.length; i--;) {
        test.equal(docs[i]._id, json[i].id);
        test.equal(docs[i]._rev, json[i].rev);
      }
      test.done();
    });
  },

  'does not modify the posted documents if an error occurred': function (test) {
    var docs = [{}, {}, {}];

    this.db._json = function (opts, callback) {
      callback('error', [
        { id: 'a', rev: 1 }, { id: 'b', rev: 2 }, { id: 'c', rev: 3 }
      ]);
    };
    this.db.saveAll(docs, function (err, json) {
      test.equal(err, 'error');
      for (var i = json.length; i--;) {
        test.equal(docs[i]._id, null);
        test.equal(docs[i]._rev, null);
      }
      test.done();
    });
  },

  'sets path and method, and preserves all-or-nothing mode': function (test) {
    var docs = [{}, {}, {}];

    this.db._json = function (opts, callback) {
      test.equal(opts.method, 'POST');
      test.equal(opts.path, '_bulk_docs');
      test.ok(opts.data.all_or_nothing);
      test.done();
    };
    this.db.saveAll(docs, { data: { all_or_nothing: true } });
  },

});

exports['Database#load'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, { _id: 'test', _rev: 1 });
    };
    cb();
  },

  'throws a type error if ID not a string': function (test) {
    test.throws(this.db.load, TypeError);
    test.done();
  },

  'sets path and method on the options': function (test) {
    this.db._json = function (opts, cb) {
      test.equal(opts.path, 'test');
      test.equal(opts.method, 'GET');
      test.done();
    };
    this.db.load('test', { path: 'PATH', method: 'METHOD' });
  },

});

exports['Database#duplicate'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, { id: opts.headers.Destination, rev: 1 });
    };
    cb();
  },

  'throws a TypeError if from_id is not a string or doc': function (test) { 
    var db = this.db;

    test.throws(function () { db.duplicate(null, 'to') }, TypeError);
    test.throws(function () { db.duplicate({}, 'to') }, TypeError);
    test.done();
  },

  'throws a TypeError if to_id is not a string': function (test) {
    var db = this.db;

    test.throws(function () { db.duplicate('from', {}) }, TypeError);
    test.done();
  },
  
  'sets path, query.rev, headers.Destination, and method': function (test) {
    this.db._json = function (opts, callback) {
      test.equal(opts.path, 'test');
      test.equal(opts.query.rev, 'check');
      test.equal(opts.headers.Destination, 'target');
      test.equal(opts.method, 'COPY');
      test.done();
    };
    this.db.duplicate(
      { _id: 'test', _rev: 'check' }, 'target', { method: 'METHOD' }
    );
  },

});

exports['Database#remove'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, { id: opts.headers.Destination, rev: 1 });
    };
    cb();
  },

});

exports['Database#remove'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._json = function (opts, callback) {
      callback(null, { ok: true, rev: 'new', id: 'test' });
    };
    this.db.revision = function (id, callback) {
      callback(null, 'revision');
    };
    cb();
  },

  'throws a TypeError if id_or_doc is not a string or object': function (test) {
    test.throws(this.db.remove, TypeError);
    test.throws(function () { this.db.remove(1) }, TypeError);
    test.done();
  },

  'throws a TypeError if doc has no _id string': function (test) {
    test.throws(function () { this.db.remove([]) }, TypeError);
    test.throws(function () { this.db.remove({ _id: 1 }) }, TypeError);
    test.done();
  },

  'throws a TypeError if doc has no _rev string': function (test) {
    test.throws(function () { this.db.remove({ _id: 'id' }) }, TypeError);
    test.throws(function () { this.db.remove({ _id: 'id', _rev: 1 }) },
                TypeError);
    test.done();
  },
  
  'reports an Error if the revision could not be found': function (test) {
    this.db.revision = function (id, callback) {
      callback(null, null);
    }
    this.db.remove('id', function (err, json) {
      test.ok(err instanceof Error);
      test.equal(err.message, 'rev not found');
      test.equal(json, null);
      test.done();
    });
  },

  'accpets rev as query parameter for ID strings': function (test) {
    this.db.remove('id', { query: { rev: 'rev' } }, function (err, json) {
      test.equal(err, null);
      test.ok(json.ok);
      test.equal(json.rev, 'new');
      test.done();
    });
  },

  'accpets rev as query parameter for documents': function (test) {
    this.db.remove({ _id: 'id' }, { query: { rev: 'rev' } },
                   function (err, json) {
      test.equal(err, null);
      test.ok(json.ok);
      test.equal(json.rev, 'new');
      test.done();
    });
  },

});

exports['Database#revision'] = testCase({

  setUp: function (cb) {
    this.db = new api.Database();
    this.db._raw = function (opts, callback) {
      callback(null, null, { etag: '"revision"' });
    };
    cb();
  },

  'throws a TypeError if id is not a string': function (test) {
    test.throws(this.db.revision, TypeError);
    test.throws(function () { this.db.revision({}) }, TypeError);
    test.done();
  },

  'extracts the revision from the ETag': function (test) {
    this.db.revision('id', function (err, rev) {
      test.equal(err, null);
      test.equal(rev, 'revision');
      test.done();
    });
  },

  'returns errors if they occurred': function (test) {
    this.db._raw = function (opts, callback) { callback('error') };
    this.db.revision('id', function (err, rev) {
      test.equal(err, 'error');
      test.equal(rev, null);
      test.done();
    });
  },
  
});

