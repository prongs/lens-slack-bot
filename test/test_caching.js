"use strict";
process.env.NODE_ENV = 'test';
var chai = require('chai');
var Cache = require('../cache');
var should = chai.should();

describe("Pass through Cache testing", ()=> {
  const cache = new Cache((x, callback) => {
    callback(x);
  });
  it("should return on get", (done) => {
    cache.get(2, (error, value) => {
      value.should.equal(2);
      should.not.exist(error);
      // get from cache should also succeed
      cache.get(2, (error, value) => {
        value.should.equal(2);
        should.not.exist(error);
        done();
      })
    });
  });
});

describe("Failing cache testing", ()=> {
  const cache = new Cache((x, callback, error_callback) => {
    error_callback("error");
  });
  it("should fail on get", (done) => {
    cache.get(2, (error, value) => {
      should.not.exist(value);
      error.should.equal("error");
      // get from cache should also succeed
      cache.get(2, (error, value) => {
        should.not.exist(value);
        error.should.equal("error");
        done();
      });
    });
  })
});
