A CouchDB client and API library for Node
-----------------------------------------

TODO: caching via Redis (after my thesis is written...)

**Why another?** Appart from the Redis cachin I want to add Redis, I need
streaming and redirection support, a *well documented API*, and in general a
client with *sufficent tests*, thereby roboust to all kinds of errors (from socket
errors to "HTTP status errors") that are reported with meaningful info.

Running the tests: `nodeunit test` (and therefore, the only dependency so far
is nodeunit: `npm i nodeunit`). Takes about 3s and requires CouchDB to run on
localhost:5984.

Synopsis/Usage:

```javascript
  var api = require('couch_client/lib/api'),
      server = api.Server(); // localhost:5984, no auth
      db = server.database('funny chars/in db name!?'),
      ddoc = { foo: 'bar', _id: '_design/ex/ample&?' };
  
  db.save(ddoc, function (err, json) {
    if (err) throw err;
    console.log('saved as', json.id, ' (' + ddoc._rev + ')');
  });
```

API Documentation: [see jsdoc](jsdoc/index.html)

ID/name policy: Database names may contain any character (as long as CouchDB
permits it). Document IDs may contain any character, but not start with an _
(a CouchDB policy, this client would accept those names as long as they do not
contain a /, too). Design documents and local documents may contain any character
(although you are well advised to stick with ASCII only). Function names (views,
shows, lists, ...) may contain any characters (ASCII only advisable...).

License: [MIT](http://www.opensource.org/licenses/mit-license.php)

Author: Florian Leitner (florian.leitner@gmail.com)