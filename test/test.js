"use strict";
var QueryCache = require("../cache");
var nconf = require("nconf");
var LensClient = require("lens-node-client");
var alasql = require('alasql'); // alasql

nconf.argv()
  .env()
  .file({file: nconf.get("HOME") + '/lens_config.json'});

const slackToken = nconf.get("slackToken");
const client = new LensClient({
  lensServerBaseUrl: nconf.get("lensServerBaseUrl"),
  username: "rajat.khandelwal",
  password: nconf.get("lensPassword")
});
var cache = new QueryCache(client.getQuery.bind(client));
let handles = ["974eb990-6514-4077-9955-fe17cde2c35e", "0fa8dc75-20bf-46c8-9894-d868de26a670", "0fa8dc75-20bf-46c8-9894-d868de26a670"];

cache.get(handles, (queries) => {
  queries = queries.map((query) => (query.lensQuery));
  let res = alasql("select submittedUser from ?", [queries]);
  console.log(res);
});