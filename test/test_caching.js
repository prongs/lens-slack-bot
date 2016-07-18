"use strict";
process.env.NODE_ENV = 'test';
var chai = require('chai');
var Cache = require('../cache');
var should = chai.should();
const cache = new Cache((x, callback) => {
  callback(x);
});

describe("Cache testing", ()=> {
  it("should return on get", (done) => {
    cache.get(2, (value) => {
      value.should.equal(2);
      // get from cache should also succeed
      cache.get(2, (value) => {
        value.should.equal(2);
        done();
      }, (error) => {
        error.should.fail();
      })
    }, (error) => {
      error.should.fail();
    });
  });
});
