"use strict";
if (!String.prototype.encodeHTML) {
  String.prototype.encodeHTML = function () {
    return this.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };
}
if (!String.prototype.decodeHTML) {
  String.prototype.decodeHTML = function () {
    return this.replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
  };
}
class Request {
  constructor(str, title) {
    if (!str) {
      this.all = true;
      return;
    }
    this.all = false;
    let lower = str.toLowerCase();
    if (lower.indexOf("select ") == 0) {
      // this is a sql.
      this.sql = str.decodeHTML();
      this.title = title || this.sql;
    }
    if (str.indexOf(":") > 0) {
      let context = str.split(":")[0].trim();
      if (context && context.toLowerCase().indexOf("queries")) {
        throw "You're trying to start new conversation.";
      }
    }
    if (str.match(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/)) {
      throw "You're trying to start new conversation.";
    }
    let fields = str.trim().split(/\s*,\s*/);
    for (let i = 0; i < fields.length; i++) {
      fields[i] = fields[i].replace(/\s(.)/g, (x) => x.toUpperCase().trim()).replace(/^(.)/, (x) => x.toLowerCase());
    }
    this.title = title || str;
    if (fields.length && fields.length == 1 && fields[0].indexOf('detail') == 0) {
      this.all = true;
      return;
    }
    this.fields = fields;
  }
}
module.exports = Request;