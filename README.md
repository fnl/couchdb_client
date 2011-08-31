A CouchDB client and API library for Node
-----------------------------------------

TODO: caching via Redis (after my thesis is written...)

**Why another?** Appart from the Redis caching, I needed an API with
streaming and redirection support, a *well documented API*, and in general a
client with *sufficent tests*, thereby roboust to all kinds of errors (from socket
errors to "HTTP status errors") that are reported with meaningful messages.

Running the tests: `nodeunit test` (and therefore, the only dependency so far
is nodeunit: `npm i nodeunit`). Takes about 3s and requires CouchDB to be 
running at localhost:5984.

Synopsis/Usage:

```javascript
var api = require('./lib/api'),
    server = api.Server('http://localhost:5984'),
    ddoc = {
      views: { simple: { map: function (doc) { emit(null, doc) } } },
      _id: '_design/example'
    },
    db,
    example_view;

// create a database
server.create('hello_world', function (err) { if (err) console.log(err) });
db = server.database('hello_world');

// save some documents
db.save(ddoc, function (err, json) {
  if (err) console.log(err);
  console.log('design saved as', json.id, '(' + ddoc._rev + ')');
});
db.save({foo: 'bar'}, function (err) { if (err) console.log(err) });

// query the view
example_view = db.view('example/simple');
example_view.query({ include_docs: true }, function (err, json) {
  if (err) console.log(err);
  for (var i = json.rows.length; i--;) {
    console.log(json.rows[i].doc.foo); // logs 'bar'
  }
});
```

API Documentation: see jsdoc/index.html

**ID/name policy for documents and databases**: Database names may contain any
character (as long as CouchDB permits it). Document IDs may contain any character,
but not start with an _ (a CouchDB policy, this client would accept those names as
long as they do not contain a /, too). Design document and local document IDs may
contain any characters, except /s in design document IDs (although you are well
advised to stick with ASCII only for design documents). Function names (views,
shows, lists, ...) may contain any characters (ASCII only advisable...). However,
keep in mind that CouchDB name policy is (except for slashes in design document IDs)
*far* more strict than all these "limitations"!

License: [MIT](http://www.opensource.org/licenses/mit-license.php)

Author: Florian Leitner (florian.leitner@gmail.com)
