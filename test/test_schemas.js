/* jshint node: true, mocha: true */

'use strict';

if (process.browser) {
  return;
}

var schemas = require('../lib/_schemas'),
    assert = require('assert'),
    path = require('path');


var DPATH = path.join(__dirname, 'dat');


suite('schemas', function () {

  suite('assemble', function () {

    var assemble = schemas.assemble;

    test('missing file', function (done) {
      assemble('./dat/foo', function (err) {
        assert(err);
        done();
      });
    });

    test('single file', function (done) {
      var opts = {ackVoidMessages: true};
      assemble(path.join(DPATH, 'Hello.avdl'), opts, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          namespace: 'org.apache.avro.test',
          protocol: 'Simple',
          doc: 'An example protocol in Avro IDL.\n\nInspired by the Avro specification IDL page:\nhttps://avro.apache.org/docs/current/idl.html#example',
          types: [
            {
              aliases: ['org.foo.KindOf'],
              doc: 'An enum.',
              type: 'enum',
              name: 'Kind',
              symbols: ['FOO', 'BAR', 'BAZ']
            },
            {type: 'fixed', doc: 'A fixed.', name: 'MD5', size: 16},
            {
              type: 'record',
              name: 'TestRecord',
              doc: 'A record.',
              fields: [
                {
                  type: {type: 'string', foo: 'first and last'},
                  order: 'ignore',
                  name: 'name'
                },
                {type: 'Kind', order: 'descending', name: 'kind'},
                {type: 'MD5', name: 'hash'},
                {
                  doc: 'A field.',
                  type: ['MD5', 'null'],
                  aliases: ['hash'],
                  name: 'nullableHash'
                },
                {
                  type: {
                    type: 'array',
                    items: {type: 'long', logicalType: 'date'}
                  },
                  name: 'arrayOfDates'
                },
                {
                  type: {type: 'map', values: 'boolean'},
                  name: 'someMap',
                  'default': {'true': true}
                }
              ]
            },
            {
              type: 'error',
              name: 'TestError',
              doc: 'An error.',
              fields: [{type: 'string', name: 'message'}]
            },
            {type: 'error', name: 'EmptyError', fields: []}
          ],
          messages: {
            hello: {
              doc: 'Greeting.',
              response: 'string',
              request: [{ type: 'string', name: 'greeting', 'default': 'hi'}]
            },
            echo: {
              response: 'TestRecord',
              request: [{type: 'TestRecord', name: 'record'}]
            },
            add: {
              doc: 'Adding.',
              response: 'int',
              request: [
                {type: 'int', name: 'arg1'},
                {type: 'int', name: 'arg2'}
              ]
            },
            echoBytes: {
              doc: 'Echoing.',
              response: 'bytes',
              request: [{type: 'bytes', name: 'data'}]
            },
            error: {response: 'null', request: [], errors: ['TestError']},
            errors: {
              response: 'string',
              request: [],
              errors: ['TestError', 'EmptyError']
            },
            ping: {response: 'null', request: [], 'one-way': true}
          }
        });
        done();
      });
    });

    test('custom file', function (done) {
      assemble(path.join(DPATH, 'Custom.avdl'), function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          doc: 'A protocol using advanced features.',
          namespace: 'org.apache.avro.test',
          messages: {
            ok: {
              response: {type: 'enum', symbols: ['SUCCESS', 'FAILURE']},
              request: []
            },
            hash: {
              response: 'int',
              request: [
                {
                  name: 'fixed',
                  type: {type: 'fixed', size: 2},
                  'default': 'aa'
                },
                {type: 'long', name: 'length'}
              ]
            },
            import: {
              response: 'null',
              request: [],
              'one-way': true
            }
          }
        });
        done();
      });
    });

    test('custom import hook', function (done) {
      var hook = createImportHook({'foo.avdl': 'protocol Foo {}'});
      assemble('foo.avdl', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {protocol: 'Foo'});
        done();
      });
    });

    test('duplicate message', function (done) {
      var hook = createImportHook({
        '1.avdl': 'protocol First { double one(); int one(); }'
      });
      assemble('1.avdl', {importHook: hook}, function (err) {
        assert(/duplicate message/.test(err.message));
        done();
      });
    });

    test('import idl', function (done) {
      var hook = createImportHook({
        '1.avdl': 'import idl "2.avdl"; protocol First {}',
        '2.avdl': 'protocol Second { int one(); }'
      });
      assemble('1.avdl', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'First',
          messages: {one: {request: [], response: 'int'}}
        });
        done();
      });
    });

    test('import idl inside protocol', function (done) {
      var hook = createImportHook({
        '1.avdl': 'protocol First {int two(); import idl "2.avdl";}',
        '2.avdl': 'protocol Second { fixed Foo(1); }'
      });
      assemble('1.avdl', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'First',
          messages: {two: {request: [], response: 'int'}},
          types: [{name: 'Foo', type: 'fixed', size: 1, namespace: ''}]
        });
        done();
      });
    });

    test('duplicate message from import', function (done) {
      var hook = createImportHook({
        '1.avdl': 'import idl "2.avdl";\nprotocol First { double one(); }',
        '2.avdl': 'protocol Second { int one(); }'
      });
      assemble('1.avdl', {importHook: hook}, function (err) {
        assert(/duplicate message/.test(err.message));
        done();
      });
    });

    test('repeated import', function (done) {
      var hook = createImportHook({
        '1.avdl': 'import idl "2.avdl";import idl "3.avdl";protocol A {}',
        '2.avdl': 'import idl "3.avdl";protocol B { enum Number { ONE } }',
        '3.avdl': 'protocol C { enum Letter { A } }'
      });
      assemble('1.avdl', {importHook: hook}, function (err, attrs) {
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [
            {name: 'Letter', type: 'enum', symbols: ['A'], namespace: ''},
            {name: 'Number', type: 'enum', symbols: ['ONE'], namespace: ''}
          ]
        });
        done();
      });
    });

    test('import protocol', function (done) {
      var hook = createImportHook({
        '1': 'import protocol "2";import protocol "3.avpr"; protocol A {}',
        '2': JSON.stringify({
          protocol: 'B',
          types: [{name: 'Letter', type: 'enum', symbols: ['A']}],
          messages: {ping: {request: [], response: 'boolean'}}
        }),
        '3.avpr': '{"protocol": "C"}'
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          messages: {ping: {request: [], response: 'boolean'}},
          types: [
            {name: 'Letter', type: 'enum', symbols: ['A'], namespace: ''}
          ]
        });
        done();
      });
    });

    test('import protocol with namespace', function (done) {
      var hook = createImportHook({
        'A': 'import protocol "B";import protocol "C";protocol A {}',
        'B': JSON.stringify({
          protocol: 'bb.B',
          namespace: 'b', // Takes precedence.
          types: [{name: 'Letter', type: 'enum', symbols: ['A']}]
        }),
        'C': JSON.stringify({
          protocol: 'C',
          namespace: 'c',
          types: [{name: 'Letter', type: 'enum', symbols: ['A']}]
        })
      });
      assemble('A', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [
            {namespace: 'b', name: 'Letter', type: 'enum', symbols: ['A']},
            {namespace: 'c', name: 'Letter', type: 'enum', symbols: ['A']}
          ]
        });
        done();
      });
    });

    test('import protocol with namespaced name', function (done) {
      var hook = createImportHook({
        'A': 'import protocol "B";protocol A {}',
        'B': JSON.stringify({
          protocol: 'b.B',
          types: [{name: 'Letter', type: 'enum', symbols: ['A']}]
        })
      });
      assemble('A', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [
            {namespace: 'b', name: 'Letter', type: 'enum', symbols: ['A']}
          ]
        });
        done();
      });
    });

    test('import protocol with duplicate message', function (done) {
      var hook = createImportHook({
        'A': 'import protocol "B";import protocol "C";protocol A {}',
        'B': JSON.stringify({
          protocol: 'B',
          messages: {ping: {request: [], response: 'boolean'}}
        }),
        'C': JSON.stringify({
          protocol: 'C',
          messages: {ping: {request: [], response: 'boolean'}}
        })
      });
      assemble('A', {importHook: hook}, function (err) {
        assert(/duplicate message/.test(err.message));
        done();
      });
    });

    test('import schema', function (done) {
      var hook = createImportHook({
        '1': 'import schema "2"; protocol A {}',
        '2': JSON.stringify({name: 'Number', type: 'enum', symbols: ['1']})
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [
            {name: 'Number', type: 'enum', symbols: ['1'], namespace: ''}
          ]
        });
        done();
      });
    });

    test('import hook error', function (done) {
      var hook = function (fpath, kind, cb) {
        if (path.basename(fpath) === 'A.avdl') {
          cb(null, 'import schema "hi"; protocol A {}');
        } else {
          cb(new Error('foo'));
        }
      };
      assemble('A.avdl', {importHook: hook}, function (err) {
        assert(/foo/.test(err.message));
        done();
      });
    });

    test('import hook idl error', function (done) {
      var hook = function (fpath, kind, cb) {
        if (path.basename(fpath) === 'A.avdl') {
          cb(null, 'import idl "hi"; protocol A {}');
        } else {
          cb(new Error('bar'));
        }
      };
      assemble('A.avdl', {importHook: hook}, function (err) {
        assert(/bar/.test(err.message));
        done();
      });
    });

    test('import invalid kind', function (done) {
      var hook = createImportHook({'A.avdl': 'import foo "2";protocol A {}'});
      assemble('A.avdl', {importHook: hook}, function (err) {
        assert(/invalid import/.test(err.message));
        done();
      });
    });

    test('import invalid JSON', function (done) {
      var hook = createImportHook({
        '1': 'import schema "2"; protocol A {}',
        '2': '{'
      });
      assemble('1', {importHook: hook}, function (err) {
        assert(err);
        assert.equal(err.path, '2');
        done();
      });
    });

    test('annotated union', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { /** 1 */ @bar(true) union { null, int } foo(); }'
      });
      assemble('1', {importHook: hook}, function (err) {
        assert(/union annotations/.test(err.message));
        done();
      });
    });

    test('commented import', function (done) {
      var hook = createImportHook({
        '1': '/* import idl "2"; */ // import idl "3"\nprotocol A {}',
        '2': 'foo', // Invalid IDL.
        '3': 'bar'  // Same.
      });
      assemble('1', {importHook: hook}, function (err) {
        assert.strictEqual(err, null);
        done();
      });
    });

    test('qualified name', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { fixed one.One(1); }',
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [{name: 'one.One', type: 'fixed', size: 1}]
        });
        done();
      });
    });

    test('inline fixed', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { record Two { fixed One(1) one; } }',
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [{
            name: 'Two',
            type: 'record',
            fields: [
              {name: 'one', type: {name: 'One', type: 'fixed', size: 1}}
            ]
          }]
        });
        done();
      });
    });

    test('one way void', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { void ping(); @foo(true) void pong(); }',
      });
      var opts = {importHook: hook, oneWayVoid: true};
      assemble('1', opts, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          messages: {
            ping: {response: 'null', request: [], 'one-way': true},
            pong: {
              response: {foo: true, type: 'null'},
              request: [],
              'one-way': true
            }
          }
        });
        done();
      });
    });

    test('javadoc precedence', function (done) {
      var hook = createImportHook({
        '1': 'protocol A {/**1*/ @doc(2) fixed One(1);}',
      });
      var opts = {importHook: hook};
      assemble('1', opts, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [
            {name: 'One', type: 'fixed', size: 1, doc: 2}
          ]
        });
        done();
      });
    });

    test('reset namespace', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { import idl "2"; }',
        '2': '@namespace("b") protocol B { @namespace("") fixed One(1); }'
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [{name: 'One', type: 'fixed', size: 1, namespace: ''}]
        });
        done();
      });
    });

    test('reset nested namespace', function (done) {
      var hook = createImportHook({
        '1': 'protocol A { import idl "2"; }',
        '2': 'import idl "3"; @namespace("b") protocol B {}',
        '3': 'protocol C { fixed Two(1); }'
      });
      assemble('1', {importHook: hook}, function (err, attrs) {
        assert.strictEqual(err, null);
        assert.deepEqual(attrs, {
          protocol: 'A',
          types: [{name: 'Two', type: 'fixed', size: 1, namespace: ''}]
        });
        done();
      });
    });

    // Import hook from strings.
    function createImportHook(imports) {
      return function (fpath, kind, cb) {
        var fname = path.basename(fpath);
        var str = imports[fname];
        delete imports[fname];
        process.nextTick(function () { cb(null, str); });
      };
    }

  });

  suite('parseTypeAttrs', function () {

    var parseTypeAttrs = schemas.parseTypeAttrs;

    test('anonymous record', function () {
      assert.deepEqual(
        parseTypeAttrs('/** A foo. */ record { int foo; }'),
        {
          doc: 'A foo.',
          type: 'record',
          fields: [{type: 'int', name: 'foo'}]
        }
      );
    });

    test('fixed', function () {
      assert.deepEqual(
        parseTypeAttrs('@logicalType("address") @live(true) fixed Address(6)'),
        {
          type: 'fixed',
          size: 6,
          live: true,
          name: 'Address',
          logicalType: 'address'
        }
      );
    });

    test('implicit collection tags', function () {
      assert.deepEqual(
        parseTypeAttrs('record { array int bars; }'),
        {
          type: 'record',
          fields: [{type: {type: 'array', items: 'int'}, name: 'bars'}]
        }
      );
    });

    test('mismatched implicit collection tags', function () {
      assert.throws(function () {
        parseTypeAttrs('record { array < int bars; }');
      }, />/);
    });

  });

  suite('parseProtocolAttrs', function () {

    var parseProtocolAttrs = schemas.parseProtocolAttrs;

    test('anonymous protocol with javadoced type', function () {
      assert.deepEqual(
        parseProtocolAttrs('protocol { /** Foo. */ int; }'),
        {attrs: {types: [{doc: 'Foo.', type: 'int'}]}, imports: []}
      );
    });

    test('invalid message suffix', function () {
      assert.throws(function () {
        parseProtocolAttrs('protocol { void foo() repeated; }');
      }, /suffix/);
    });

  });

  suite('parseAttrs', function () {

    var parseAttrs = schemas.parseAttrs;

    test('inline protocol', function () {
      assert.deepEqual(
        parseAttrs('protocol { /** Foo. */ int; }'),
        {types: [{doc: 'Foo.', type: 'int'}]}
      );
    });

    test('protocol path', function () {
      assert.deepEqual(
        parseAttrs(path.join(DPATH, 'Ping.avdl')),
        {
          protocol: 'Ping',
          messages: {ping: {request: [], response: 'id.Id'}},
          types: [{type: 'fixed', name: 'Id', size: 64, namespace: 'id'}]
        }
      );
    });

    test('path to type schema', function () {
      assert.deepEqual(
        parseAttrs(path.join(DPATH, 'Id.avsc')),
        {type: 'fixed', name: 'Id', size: 64, namespace: 'id'}
      );
    });

    test('path to type IDL', function () {
      assert.deepEqual(
        parseAttrs(path.join(DPATH, 'Id.avdl')),
        {type: 'fixed', name: 'Id', size: 64, namespace: 'id'}
      );
    });

    test('protocol with imports', function () {
      assert.throws(function () {
        parseAttrs('protocol { import idl "foo.avdl"; }');
      }, /unresolvable/);
    });

    test('invalid string', function () {
      var str = 'protocol { void foo() repeated; }';
      assert.equal(parseAttrs(str), str);
    });

  });

  suite('Tokenizer', function () {

    var Tokenizer = schemas.Tokenizer;

    test('next', function () {
      assert.deepEqual(
        getTokens('hello; "you"'),
        [
          {id: 'name', pos: 0, val: 'hello'},
          {id: 'operator', pos: 5, val: ';'},
          {id: 'string', pos: 6, val: '"you"'}
        ]
      );
    });

    test('next silent', function () {
      var t = new Tokenizer('fee 1');
      assert.equal(t.next().val, 'fee');
      assert.strictEqual(t.next({val: '2', silent: true}), undefined);
      assert.equal(t.next().val, '1');
    });

    test('invalid comment', function () {
      assert.throws(function () { getToken('/** rew'); });
    });

    test('invalid string', function () {
      assert.throws(function () { getToken('"rewr\\"re'); }, /unterminated/);
    });

    test('valid JSON', function () {
      [
        {str: '324,', val: 324},
        {str: '3,', val: 3},
        {str: '-54,', val: -54},
        {str: '-5.4)', val: -5.4},
        {str: '"324",', val: '324'},
        {str: '"hello \\"you\\""r', val: 'hello "you"'},
        {str: '{}o', val: {}},
        {str: '{"a": 1},', val: {a: 1}},
        {str: '[]', val: []},
        {str: 'true+1', val: true},
        {str: 'null.1', val: null},
        {str: 'false::', val: false},
        {str: '["[", {"}": null}, true]', val: ['[', {'}': null}, true]},
      ].forEach(function (el) {
        assert.deepEqual(getToken(el.str, 'json').val, el.val);
      });
    });

    test('invalid JSON', function () {
      assert.throws(function () { getToken('{"rew": "3}"', 'json'); });
      assert.throws(function () { getToken('{"rew": "3}"]', 'json'); });
    });

    test('name', function () {
      [
        {str: 'hi', val: 'hi'},
        {str: '`i3i`', val: 'i3i'}
      ].forEach(function (el) {
        assert.deepEqual(getToken(el.str).val, el.val);
      });
    });

    test('non-matching', function () {
      assert.throws(function () { getToken('\n1', 'name'); });
      assert.throws(function () { getToken('{', undefined, '}'); });
    });

    function getToken(str, id, val) {
      var tokenizer = new Tokenizer(str);
      return tokenizer.next({id: id, val: val});
    }

    function getTokens(str) {
      var tokenizer = new Tokenizer(str);
      var tokens = [];
      var token;
      while ((token = tokenizer.next()).id !== '(eof)') {
        tokens.push(token);
      }
      return tokens;
    }

  });

});
