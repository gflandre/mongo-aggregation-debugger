/**
 * index.js
 * @author  Guillaume Flandre
 * @copyright Copyright (c) Guillaume Flandre 2015. All rights reserved.
 */
var util = require('util');
var _ = require('underscore');
var async = require('async');
var clor = require("clor");
var MongoClient = require('mongodb').MongoClient;

/**
 * Mongo Aggregation Debugger module
 *
 * Provides ways to debug mongo's aggregation framework
 *
 * Initialize by providing MongoDb connection credentials
 *   - host {string}     (default: 'localhost') the host info
 *   - port {number}     (default: 27017) the port info
 *   - username {string} (optional) the mongodb username
 *   - password {string} (optional) the mongodb password
 *   - options {object} (opional) standard mongodb options
 */
var mongoAggregationDebugger = function (mongoParams) {
  my = {};

  my.defaultMongoParams = {
    host: 'localhost',
    port: 27017,
    username: null,
    password: null,
    options: {}
  };

  my.mongoParams = _.extend(my.defaultMongoParams, mongoParams || {});

  my.collectionName = 'documents';

  /**
   * Private
   */
  var generateDatabaseName;
  var debug;
  var buildConnectionUrl;
  var getMongoConnection;

  /**
   * Public
   */
  var log;
  var stages;
  var exec;

  /**
   * that
   */
  var that = {};

  /*************************************************************************************************
   *                                        PRIVATE METHODS
   ************************************************************************************************/
  /**
   * Generates a rather unique database name
   * @return {string} the database name
   */
  generateDatabaseName = function () {
    return 'mongo_aggregation_debugger_' + process.pid + '_' + Date.now();
  };

  /**
   * Builds the mongodb connection url from the params passed
   * @return {string} the mongodb connection url
   */
  buildConnectionUrl = function () {
    if (!my.mongoParams.host) {
      my.mongoParams.host = my.defaultMongoParams.host;
    }

    var url = 'mongodb://';

    if (my.mongoParams.username && my.mongoParams.password) {
      url += my.mongoParams.username + ':' + my.mongoParams.password + '@';
    }

    url += my.mongoParams.host;

    if (my.mongoParams.port) {
      url += ':' + my.mongoParams.port;
    }

    my.debugDatabaseName = my.debugDatabaseName || generateDatabaseName();

    url += '/' + my.debugDatabaseName;

    return url;
  };

  /**
   * Get the mongodb's Db instance
   * @param  {function} cb(err, db)
   */
  getMongoConnection = function (cb) {
    MongoClient.connect(buildConnectionUrl(), my.mongoParams.options, cb);
  };

  /**
   * Partition an aggregation query into several subsets
   * @param  {array}    query       The aggregation query
   * @param  {boolean}  skipStages  Whether to directly run the full query or not
   * @return {array}                Query parts
   */
  partitionQuery = function (query, skipStages) {
    var queryParts = [];

    if (skipStages) {
      queryParts.push(query);
    } else {
      query.forEach(function (queryPart, index) {
        if (index === 0) {
          queryParts.push([ queryPart ]);
        } else {
          var part = _.clone(queryParts[index - 1]);
          part.push(queryPart);
          queryParts.push(part);
        }
      });
    }

    return queryParts;
  };

  /**
   * Actually runs the debugging part
   * @param  {mixed}    data       An array of objects that will be the data
   *                               the aggregation will be performed on.
   *                               Also accepts a single object.
   * @param  {array}    query      The aggregation query
   * @param  {function} beforeEach Callback called before each stage of the aggregation.
   *                               Arguments passed:
   *                                 - queryPart {array}  The query run for this stage
   *                                                      of the aggregation
   *                                 - index     {number} The current aggregation stage number
   * @param  {function} afterEach  Callback called after each stage of the aggregation.
   *                               Arguments passed:
   *                                 - results  {array}  The results of that aggregation stage
   *                                 - index    {number} The current aggregation stage number
   * @param  {boolean}  skipStages (optional, default: false) Whether to directly run the
   *                                                          full query or not
   * @param  {function} cb(err)
   */
  debug = function (data, query, beforeEach, afterEach, skipStages, cb) {
    var doSkipStegaes = false;

    if (typeof skipStages === 'function' && typeof cb === 'undefined') {
      cb = skipStages;
      doSkipStages = false;
    } else if (typeof skipStages === 'boolean') {
      doSkipStages = skipStages;
    } else {
      return cb(new Error('Invalid `skipStages` value'));
    }

    if (typeof cb !== 'function') {
      throw new Error('Invalid callback');
    }

    if (!Array.isArray(data)) {
      if (data && typeof data === 'object') {
        data = [ data ];
      } else {
        return cb(new Error('Invalid `data`'));
      }
    }

    if (!Array.isArray(query)) {
      return cb(new Error('Invalid `query`'));
    }

    if (typeof beforeEach !== 'function') {
      beforeEach = function () {};
    }

    if (typeof afterEach !== 'function') {
      afterEach = function () {};
    }

    getMongoConnection(function (err, db) {
      if (err) {
        return cb(err);
      }

      var collection = db.collection(my.collectionName);
      var queryParts = partitionQuery(query, doSkipStages);

      var series = [
        function insert (cb) {
          collection.insert(data, cb);
        }
      ];

      queryParts.forEach(function (queryPart, index) {
        series.push(
          function (cb) {
            beforeEach(queryPart, index);

            (function (index) {
              collection.aggregate(queryPart, function (err, results) {
                if (err) {
                  return cb(err);
                }

                afterEach(results, index);
                return cb();
              });
            })(index);
          }
        );
      });

      series.push(
        function dropDatabase (cb) {
          db.dropDatabase(cb);
        }
      );

      async.series(series, function (err) {
        if (err) {
          db.dropDatabase(function (anotherErr) {
            db.close();
            return cb(anotherErr || err);
          });
        }

        db.close();
        return cb();
      });
    });
  };

  /*************************************************************************************************
   *                                        PUBLIC METHODS
   ************************************************************************************************/
  /**
   * Logging mode, displays results in console
   * @param  {mixed}    data    An array of objects that will be the data
   *                            the aggregation will be performed on.
   *                            Also accepts a single object.
   * @param  {array}    query   The aggregation query
   * @param  {object}   options (optional) Display options:
   *                              - showQuery {boolean} (default: false) Outputs each stage's query
   * @param  {function} cb(err)
   */
  log = function (data, query, options, cb) {
    if (typeof options === 'function' && typeof cb === 'undefined') {
      cb = options;
    }

    if (typeof cb !== 'function') {
      cb = function () {};
    }

    options = options || {};

    util.debug(clor.cyan('Mongo aggregation debugger [Start]\n'));

    var beforeEach = function (queryPart, index) {
      var operationType = _.keys(queryPart[queryPart.length - 1])[0];
      console.log(clor.bgWhite.black(' Stage ' + (index + 1) + ' ') + ' ' +
                  clor.bgBlue(' ' + operationType + ' '));
      if (options.showQuery) {
        console.log(util.inspect(queryPart, {
          depth: null,
          colors: true
        }));
        console.log('\n' + clor.bgGreen.black(' Results '));
      }
    };

    var afterEach = function (results) {
      console.log(util.inspect(results, {
        depth: null,
        colors: true
      }));
      console.log('\n');
    };

    debug(data, query, beforeEach, afterEach, function (err) {
      if (err) {
        return cb(err);
      } else {
        util.debug(clor.cyan('Mongo aggregation debugger [End]'));
        return cb();
      }
    });
  };

  /**
   * Programmatic mode, returns an array of each aggregation stage's data
   * @param  {mixed}    data    An array of objects that will be the data
   *                            the aggregation will be performed on.
   *                            Also accepts a single object.
   * @param  {array}    query   The aggregation query
   * @param  {function} cb(err, output)
   */
  stages = function (data, query, cb) {
    if (typeof cb !== 'function') {
      cb = function () {};
    }

    var output = [];

    var beforeEach = function (queryPart, index) {
      output.push({
        query: queryPart
      });
    };

    var afterEach = function (results, index) {
      output[index] = output[index] || {};
      output[index].results = results;
    };

    debug(data, query, beforeEach, afterEach, function (err) {
      if (err) {
        return cb(err);
      } else {
        return cb(null, output);
      }
    });
  };

  /**
   * Exec mode, returns only the last result, without running intermediate aggregation stages
   * @param  {mixed}    data    An array of objects that will be the data
   *                            the aggregation will be performed on.
   *                            Also accepts a single object.
   * @param  {array}    query   The aggregation query
   * @param  {function} cb(err, output)
   */
  exec = function (data, query, cb) {
    if (typeof cb !== 'function') {
      cb = function () {};
    }

    var output;

    var afterEach = function (results) {
      output = results;
    };

    debug(data, query, null, afterEach, true, function (err) {
      if (err) {
        return cb(err);
      } else {
        return cb(null, output);
      }
    });
  };

  that.log = log;
  that.stages = stages;
  that.exec = exec;

  return that;
};

module.exports = mongoAggregationDebugger;
