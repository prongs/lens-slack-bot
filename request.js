"use strict";
class Request {
  constructor(str) {
    if (!str) {
      this.all = true;
      return;
    }
    this.all = false;
    let lower = str.toLowerCase();
    if (lower.indexOf("select") == 0) {
      // this is a sql.
      this.sql = str;
    }
    let fields = str.trim().split(/\s*,\s*/);
    for (let i = 0; i < fields.length; i++) {
      fields[i] = fields[i].replace(/\s(.)/g, (x) => x.toUpperCase().trim()).replace(/^(.)/, (x) => x.toLowerCase());
    }
    if (fields.length && fields.length == 1 && fields[0].indexOf('detail') == 0) {
      this.all = true;
      return;
    }
    this.fields = fields;
  }
}
module.exports = Request;