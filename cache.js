"use strict";
var NodeCache = require("node-cache");
class Cache {
  constructor(extracter) {
    this.cache = new NodeCache({stdTTL: 200, checkperiod: 240});
    this.extracter = extracter;
  }

  get_single(key, callback, error_callback) {
    this.cache.get(key, (error, value)=> {
      if (value) {
        callback(value);
      } else {
        this.extracter(key, (value) => {
          this.cache.set(key, value);
          callback(value);
        }, (error) => {
          console.error("Value doesn't exist in system for " + key + " error: " + error);
          error_callback(error);
        });
      }
    });
  }

  get_multiple(keys, callback, error_callback) {
    let counter = 0;
    let values = new Array(keys.length);
    keys.forEach((item, index, array) => {
      this.get(item, (value) => {
        counter++;
        values[index] = value;
        if (counter == keys.length) {
          callback(values);
        }
      }, (error) => {
        // increase the counter neverthless.
        values[index] = undefined;
        counter++;
      });
    })
  }
  get(key_or_keys, callback, error_callback) {
    if(Object.prototype.toString.call( key_or_keys ) =="[object Array]") {
      this.get_multiple(key_or_keys, callback, error_callback);
    } else {
      this.get_single(key_or_keys, callback, error_callback);
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