"use strict";
process.env.NODE_ENV = 'test';
var chai = require('chai');
var Request = require('../request');
var should = chai.should();
const request = (str) => (new Request(str));

describe("Request parsing", ()=> {
  it("should split on comma", (done) => {
    let r = request("field 1, field 2");
    r.fields.should.have.length(2);
    r.all.should.equal(false);
    done();
  });
  it("should auto convert to camel case", (done) => {
    let r = request("a b");
    r.fields[0].should.equal("aB");
    r.all.should.equal(false);
    done();
  });
  it("should check for details word in the word list", (done)=>{
    let r = request("detail blah blah");
    r.all.should.equal(true);
    done();
  });
});
