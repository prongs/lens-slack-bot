"use strict";
var Promise = require("bluebird");
var NodeCache = require("node-cache");
class Cache {
  constructor(extracter) {
    this.cache = new NodeCache({stdTTL: 200, checkperiod: 240});
    this.extracter = extracter;
  }

  get_single(key, callback) {
    this.cache.get(key, (error, value)=> {
      if (value) {
        callback && callback(null, value);
      } else {
        this.extracter(key, (value) => {
          this.cache.set(key, value);
          callback && callback(null, value);
        }, (error) => {
          error = error || "Value doesn't exist in system for " + key;
          console.error(error);
          callback && callback(error, null);
        });
      }
    });
  }

  get_multiple(keys, callback) {
    let counter = 0;
    let values = new Array(keys.length);
    let errors = [];
    const mark = () => {
       counter++;
      if (counter == keys.length) {
        callback && callback(errors, values);
      }
    };
    keys.forEach((item, index, array) => {
      this.get_single(item, (error, value) => {
        if (value) {
          values[index] = value;
        } else {
          values[index] = undefined;
          errors.push(error);
        }
        mark();
      });
    })
  }
  get(key_or_keys, callback) {
    if(Object.prototype.toString.call( key_or_keys ) =="[object Array]") {
      this.get_multiple(key_or_keys, callback);
    } else {
      this.get_single(key_or_keys, callback);
    }
  }

  del(key_or_keys, callback) {
    if(Object.prototype.toString.call( key_or_keys ) =="[object Array]") {
      let deleted = 0;
      key_or_keys.forEach((key) => {
        this.cache.del(key, () => {
          deleted++;
          if (deleted == key_or_keys.length) {
            callback();
          }
        });
      })
    } else {
      this.cache.del(key_or_keys, callback);
    }
  }
}
module.exports = Cache;