"use strict";
var nconf = require("nconf");
var Botkit = require('botkit');
var LensClient = require("lens-node-client");
var YAML = require("yamljs");
var NodeCache = require("node-cache");
var cleverbot = require("cleverbot.io");
var mapreduce = require('mapred')(); // multi-core execution (fastest)
var alasql = require('alasql'); // alasql
var Request = require("request");
const replies = {
  thank: ["You're welcome.", "No problem.", "No trouble at all.", "My pleasure.", "Glad to help.", "Anytime.",
    "I serve at your pleasure."],
  exit: ['Nice talking to you.', "Maybe later.", "As you wish."],
  default: ["I don\'t know what to say."]
};
const smileys = {
  'default': ["simple_smile", "beers", "sunglasses", "robot_face", "v", "muscle", "computer"]
};

Array.prototype.randomElement = function () {
  return this[Math.floor(Math.random() * this.length)]
};

const get_reply_to = ((str) => (replies[str] || replies.default).randomElement() + " :" + (smileys[str] || smileys.default).randomElement() + ":")
const getMessage = (heading, details) => {
  if (!details || details == "") {
    return heading;
  }
  if (typeof details == "object") {
    details = YAML.stringify(details);
  }
  return "`" + heading + "`:\n```" + details + "```";
};

class QueryCache {
  constructor(extracter) {
    this.queryCache = new NodeCache({stdTTL: 200, checkperiod: 240});
    this.extracter = extracter;
  }
  get(handle, callback, error_callback) {
    this.queryCache.get(handle, (error, value)=>{
      if (value) {
        callback(value);
      } else {
        this.extracter(handle, (query) => {
          this.queryCache.set(handle, query);
          callback(query);
        }, (error) => {
          console.error("Value doesn't exist in system for " + handle + " error: " + error);
          error_callback(error);
        });
      }
    });
  }
}

class LensSlackBot {
  constructor() {
    nconf.argv()
      .env()
      .file({file: nconf.get("HOME") + '/lens_config.json'});

    this.slackToken = nconf.get("slackToken");
    this.client = new LensClient({
      lensServerBaseUrl: nconf.get("lensServerBaseUrl"),
      username: nconf.get("lensUsername"),
      password: nconf.get("lensPassword")
    });
    this.handleRegexString = "\\w{8}-\\w{4}-\\w{4}-\\w{4}-\\w{12}";
    this.handleRegex = new RegExp(this.handleRegexString, "g");
    this.lastActiveTime = new Date();
    this.updateLastActiveTime = () => {
      this.lastActiveTime = new Date();
    };
    this.queryCache = new QueryCache(this.client.getQuery);
  }

  respondWithDetails(message, handles, request) {
    let detailsSent = 0;

    const parseFieldsAndSend = (response, convo) => {
      request = new Request(response.text);
      detailsSent = 0;
      sendAllQueryDetails(convo);
      convo.next();
    };

    const markDetailsSent = (convo) => {
      detailsSent++;
      if (detailsSent == handles.length) {
        convo.ask("Do you want More fields?", [
          {
            pattern: this.bot.utterances.no,
            callback: (response, convo) => {
              convo.say(get_reply_to('exit'));
              convo.next();
            }
          },
          {
            pattern: this.bot.utterances.yes,
            callback: (response, convo) => {
              convo.ask("Tell me.", parseFieldsAndSend);
              convo.next();
            }
          },
          {
            default: true,
            callback: parseFieldsAndSend
          }
        ]);
        convo.next();
      }
    };

    const reply = (heading, details, convo) => {
      const reply = getMessage(heading, details);
      if (reply.length < 4000) {
        if (convo) {
          convo.say(reply);
          convo.next();
          this.updateLastActiveTime();
        } else {
          this.bot.reply(message, reply, this.updateLastActiveTime);
        }
      } else {
        if (typeof(details) == "object") {
          details = YAML.stringify(details);
        }
        this.bot.api.files.upload({
          content: details,
          filetype: 'yaml',
          title: heading,
          filename: heading,
          channels: message.channel
        }, (error, json) => {
          console.log(error);
          console.log(json);
        });
      }
    };
    const sendAllQueryDetails = (convo) => {
      const sendFromCacheOrAPI = () => {
        handles.forEach((handle) => {
          this.queryCache.get(handle, (query) => {
            sendQueryDetails(query.lensQuery, convo);
          }, (error) => {
            markDetailsSent(convo);
          });
        });
      };
      if(request.sql) {
        // Do analysis here
        console.log("sql: " + request.sql);
      } else if (request.all || request.fields.indexOf('status') >= 0) {
        this.queryCache.del(handles, sendFromCacheOrAPI)
      } else {
        sendFromCacheOrAPI();
      }
    };

    const sendQueryDetails = (query, convo) => {
      const fields = request.fields;
      if (fields && fields.length == 1 && !request.all) {
        if (fields[0] in query) {
          reply(fields[0] + " for " + query.queryHandle.handleId, query[fields[0]], convo);
        } else {
          reply("No field named " + fields[0] + " in query " + query.queryHandle.handleId, "", convo);
        }
      } else {
        let data = {};
        if (!request.all) {
          fields.forEach((fieldName) => {
            if (fieldName in query) {
              data[fieldName] = query[fieldName];
            }
          });
        } else {
          data = query;
        }
        if (data) {
          reply(query.queryHandle.handleId, data, convo);
        } else {
          reply("No data found for " + query.queryHandle.handleId, "", convo);
        }
      }
      markDetailsSent(convo);
    };

    if (handles && handles.length) {
      this.bot.startConversation(message, (error, convo) => {
        sendAllQueryDetails(convo);
        convo.on('end', (convo) => {
          console.log("Conversation ended: " + convo);
        })
      })
    }
  }

  start() {
    console.log("starting lens bot");
    const controller = Botkit.slackbot({debug: true});
    this.bot = controller.spawn({token: this.slackToken});
    this.bot.startRTM((error, bot, response) => {
      if (error) {
        console.error(error);
        throw new Error("Couldn't connect to slack", error);
      }
    });
    controller.on('rtm_close', () => {
      this.client.invalidateSession(() => {
        process.exit(1);
      }, () => {
        console.error("Error closing session");
        process.exit(2);
      });
      process.exit(1);
    });
    controller.on('tick', () => {
      const now = new Date();
      if (now.getTime() - this.lastActiveTime.getTime() > 1000 * 60) { // 1 minute idle timeout
        this.bot.say({type: "ping", id: now.getTime()}, this.updateLastActiveTime);
      }
    });

    controller.hears(["thank"], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
      this.bot.reply(message, get_reply_to('thank'));
    });
    controller.hears(["^(((" + this.handleRegexString + ")\\s*,?\\s*)+)(:(.*?))?$"],
      ['direct_message', 'direct_mention', 'mention', 'ambient'],
      (bot, message) => {
        this.respondWithDetails(message, message.match[1].match(this.handleRegex), new Request(message.match[5]));
      }
    );
    controller.hears(["^(all\\s*)?(\\w+)\\squeries(.*?)(:\\s*(.*?))?$"],
      ['direct_message', 'direct_mention', 'mention', 'ambient'], (bot, message) => {
        const qs = {};
        if (message.match[3]) {
          const params = message.match[3].trim().split(/[^a-zA-Z0-9_/.-]+/);
          if (params.length % 2 != 0) {
            this.bot.reply(message,
              "Sorry couldn't parse your arguments: " + message.match[3], this.updateLastActiveTime);
            return;
          } else {
            for (let i = 0; i < params.length; i += 2) {
              qs[params[i]] = params[i + 1];
            }
          }
        }
        if (!('state' in qs)) {
          if (message.match[2]) {
            qs['state'] = message.match[2]
          }
        }
        if ('state' in qs) {
          qs['state'] = qs['state'].toUpperCase().trim();
        }
        if (!('user' in qs)) {
          if (message.match[1] || message.text.indexOf("all") > -1) {
            qs['user'] = 'all';
          }
        }
        let fields, request;
        if (message.match[5]) {
          request = new Request(message.match[5]);
        }
        const reply = (queries) => {
          let reply = "`" + JSON.stringify(qs) + "`(" + queries.length + " )";
          for (let i = 0; i < queries.length; i++) {
            queries[i] = queries[i].queryHandle.handleId;
          }
          if (queries.length > 0) {
            reply = reply + "\n```" + YAML.stringify(queries) + "```";
          }
          this.bot.reply(message, reply, () => {
            this.updateLastActiveTime();
            if (request) {
              this.respondWithDetails(message, queries, request);
            }
          });
        };

        if (!('user' in qs)) {
          this.bot.api.users.info({user: message.user}, (error, json)=> {
            if (json && json.user && json.user.name) {
              qs['user'] = json.user.name;
              this.client.listQueries(qs, reply);
            }
          });
        } else {
          this.client.listQueries(qs, reply);
        }
      }
    );
  }
}
module.exports = LensSlackBot;
if (require.main == module) {
  const bot = new LensSlackBot();
  bot.start();
}