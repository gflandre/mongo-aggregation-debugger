/**
 * @file index_spec.js
 * @author Guillaume Flandre
 * @copyright Copyright (c) Guillaume Flandre 2015. All rights reserved.
 */
var assert = require('assert');
var sinon = require('sinon');
var proxyquire =  require('proxyquire');

describe('mongo-aggregation-debugger', function () {
  var data = {};
  var query = [];
  var mad;

  before(function () {
    data = [{
      foo: 'bar',
      test: true,
      array: [ 1, 2, 3 ]
    }, {
      foo: 'bar2',
      test: false,
      array: [ 10, 20 ]
    }];

    query = [{
      '$match': {
        test: true
      }
    }, {
      '$project': {
        foo: 1,
        array: 1
      }
    }, {
      '$unwind': "$array"
    }, {
      '$group': {
        _id: "$foo",
        foo: { $first: "$foo" },
        sum: { $sum: "$array" }
      }
    }];

    sinon.spy(console, 'log');

    mad = require(__dirname + '/../index')();
  });

  describe('#log()', function () {
    beforeEach(function () {
      console.log.reset();
    });

    it('should output results if no query is shown', function (done) {
      mad.log(data, query, function (err) {
        assert.equal(console.log.callCount, 12);
        done();
      });
    });

    it('should output more results if query is shown', function (done) {
      mad.log(data, query, { showQuery: true }, function (err) {
        assert.equal(console.log.callCount, 20);
        done();
      });
    });
  });

  describe('#stages()', function () {
    it('should return an error if data is invalid', function (done) {
      mad.stages(null, query, function (err) {
        assert.notEqual(typeof err, undefined);
        done();
      });
    });

    it('should return an error if query is invalid', function (done) {
      mad.stages(data, 'test', function (err) {
        assert.notEqual(typeof err, undefined);
        done();
      });
    });

    it('should return valid data stages', function (done) {
      mad.stages(data, query, function (err, results) {
        assert.equal(!!err, false);
        assert.equal(results.length, 4);

        assert.equal(results[0].query.length, 1);
        assert.equal(results[0].results.length, 1);
        assert.equal(results[0].results[0].test, true);

        assert.equal(results[1].query.length, 2);
        assert.equal(results[1].results.length, 1);
        assert.equal(typeof results[1].results[0].test, 'undefined');

        assert.equal(results[2].query.length, 3);
        assert.equal(results[2].results.length, 3);

        assert.equal(results[3].query.length, 4);
        assert.equal(results[3].results.length, 1);
        assert.equal(results[3].results[0]._id, 'bar');
        assert.equal(results[3].results[0].sum, 6);

        done();
      });
    });
  });

  describe('#exec()', function () {
    it('should return valid data', function (done) {
      mad.exec(data, query, function (err, results) {
        assert.equal(!!err, false);
        assert.equal(results.length, 1);

        assert.equal(results[0]._id, 'bar');
        assert.equal(results[0].sum, 6);

        done();
      });
    });
  });
});
