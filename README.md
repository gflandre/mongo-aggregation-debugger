# Mongo Aggregation Debugger

[![Build Status](https://travis-ci.org/gflandre/mongo-aggregation-debugger.svg?branch=master)](https://travis-ci.org/gflandre/mongo-aggregation-debugger.svg)
[![NPM](https://nodei.co/npm/mongo-aggregation-debugger.png?compact=true)](https://nodei.co/npm/mongo-aggregation-debugger/)

Mongo Aggregation Debugger helps debug MongoDb aggregation queries
by being able to visualize each stage of the pipeline

## Why use it
It is pretty hard to understand why a specific aggregation query fails or doesn't output the
right results since it can be pretty complex and go through a lot of stages before returning values.

The Mongo Aggregation Debugger helps you understand what is going on by either:
  - outputting in the console the results of each stage of the aggregation pipeline
  - returning an array of results of each stage of teh aggregation pipeline for programmatic use
  - running the query in a temporary database and outputting the results,
    very useful for automated testing

## How it works
You give the debugger access to your instance of mongodb, and it creates a temporary collection
in which it will run each stage of the aggregation query in series.
The temporary database is dropped after each debug.

## Install
```
npm install mongo-aggregate-debugger
```

## Instantiation
```
var mad = require('mongo-aggregation-debugger')();
```

You can provide an optional object as an argument to specify the mongodb connection information:

key | default value | description
------------ | ------------- | -------------
host | `localhost` | mongodb host name
port | `27017` | mongodb port number
username | `null` | (optional) username of the mongodb instance
password | `null` | (optional) password of the mongodb instance
options | `{}` | (optional) additional mongodb [options](http://mongodb.github.io/node-mongodb-native/2.0/api/MongoClient.html)

## API
### `log`
This method outputs in the console the result of each stage of the aggregation pipeline.

#### Use
`mad.log(data, query, [options,] callback)`

argument | type | values | description
------------ | ------------- | ------------- | -------------
data | `array` | | The data to run the query against
query | `array` | | The aggregation query
options | `object` | `showQuery`: `boolean` | Whether to show the query of the stage being run or not
callback | `function(err)` | | The callback returned when all stages were executed

#### Example:
```javascript
var mad = require('mongo-aggregation-debugger')();

var data = [{
  foo: 'bar',
  test: true,
  array: [ 1, 2, 3 ]
}, {
  foo: 'bar2',
  test: false,
  array: [ 10, 20 ]
}];

var query = [{
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

mad.log(data, query, function (err) {
  if (err) {
    // do something
  }

  console.log('All done!');
});
```

Running the code above would output this in your console:
<img width="811" alt="capture d ecran 2015-07-05 a 14 24 46" src="https://cloud.githubusercontent.com/assets/234451/8511630/bf2bf4d6-2321-11e5-97af-3b9397d8775b.png">

Example with the `showQuery` option:
```
mad.log(data, query, { showQuery: true }, function (err) {
  if (err) {
    // do something
  }

  console.log('All done!');
});
```
<img width="833" alt="capture d ecran 2015-07-05 a 14 28 37" src="https://cloud.githubusercontent.com/assets/234451/8511636/31278bea-2322-11e5-822b-ee0d847e904e.png">

### `stages`
This method returns the result of each stage of the aggregation pipeline for programmatic use.

#### Use
`mad.stages(data, query, callback)`

argument | type | description
------------ | ------------- | ------------- | -------------
data | `array` | The data to run the query against
query | `array` | The aggregation query
callback | `function(err, results)` | `results` is an array composed of as many objects as there are stages in the aggregation pipeline. Each object has a `query` attribute which is the query of the stage and a `result` attribute with the results of that query

#### Example:
```javascript
var util = require('util');
var mad = require('mongo-aggregation-debugger')();

var data = [{
  foo: 'bar',
  test: true,
  array: [ 1, 2, 3 ]
}, {
  foo: 'bar2',
  test: false,
  array: [ 10, 20 ]
}];

var query = [{
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

mad.stages(data, query, function (err, results) {
  if (err) {
    // do something
  }

  console.log(util.inspect(results, { depth: null }));
});
```

The output is:
```javascript
[ { query: [ { '$match': { test: true } } ],
    results:
     [ { _id: 5599279a731b5aba47df6d97,
         foo: 'bar',
         test: true,
         array: [ 1, 2, 3 ] } ] },
  { query:
     [ { '$match': { test: true } },
       { '$project': { foo: 1, array: 1 } } ],
    results: [ { _id: 5599279a731b5aba47df6d97, foo: 'bar', array: [ 1, 2, 3 ] } ] },
  { query:
     [ { '$match': { test: true } },
       { '$project': { foo: 1, array: 1 } },
       { '$unwind': '$array' } ],
    results:
     [ { _id: 5599279a731b5aba47df6d97, foo: 'bar', array: 1 },
       { _id: 5599279a731b5aba47df6d97, foo: 'bar', array: 2 },
       { _id: 5599279a731b5aba47df6d97, foo: 'bar', array: 3 } ] },
  { query:
     [ { '$match': { test: true } },
       { '$project': { foo: 1, array: 1 } },
       { '$unwind': '$array' },
       { '$group':
          { _id: '$foo',
            foo: { '$first': '$foo' },
            sum: { '$sum': '$array' } } } ],
    results: [ { _id: 'bar', foo: 'bar', sum: 6 } ] } ]
```

### `exec`
This method only runs the entirequery passed, not all the stages seperately. It is useful for automated tests since it creates and drops a temporary database.

#### Use
`mad.exec(data, query, callback)`

argument | type | description
------------ | ------------- | ------------- | -------------
data | `array` | The data to run the query against
query | `array` | The aggregation query
callback | `function(err, results)` | `results` is the results of the query being run

#### Example:
```javascript
var util = require('util');
var mad = require('mongo-aggregation-debugger')();

var data = [{
  foo: 'bar',
  test: true,
  array: [ 1, 2, 3 ]
}, {
  foo: 'bar2',
  test: false,
  array: [ 10, 20 ]
}];

var query = [{
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

mad.exec(data, query, function (err, results) {
  if (err) {
    // do something
  }

  console.log(util.inspect(results, { depth: null }));
});
```

The output is:
```javascript
[ { _id: 'bar', foo: 'bar', sum: 6 } ]
```

## Unit tests
In order to test this lib you'll need to install mocha: `npm install -g mocha`.
Then just run the `mocha` command at the root of your project.

## More info
[MongoDb](https://www.mongodb.org/)

[MongoDb Aggregation Framework](http://docs.mongodb.org/manual/core/aggregation-introduction/)

## Contribute
If you think it would make sense to add some features/methods don't hesitate to fork and
make pull requests.

## Licence
Distributed under the MIT License.
