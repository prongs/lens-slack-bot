"use strict";
var nconf = require("nconf");
var Botkit = require('botkit');
var LensClient = require("lens-node-client");
var YAML = require("yamljs");
var alasql = require('alasql'); // alasql
var Request = require("./request");
var QueryCache = require("./cache");
var Table = require('easy-table');

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

const get_reply_to = ((str) => (replies[str] || replies.default).randomElement() + " :" + (smileys[str] || smileys.default).randomElement() + ":");
const getMessage = (heading, details) => {
  if (!details || details == "") {
    return heading;
  }
  if (typeof details == "object") {
    details = YAML.stringify(details);
  }
  return "`" + heading + "`:\n```" + details + "```";
};
// Define udfs in alasql:

alasql.fn.milliseconds_since = (timestamp) => {
  return new Date().getTime() - timestamp;
};
alasql.fn.milliseconds_to_time = (duration) => {
  let milliseconds = parseInt((duration % 1000) / 100);
  let seconds = parseInt((duration / 1000) % 60);
  let minutes = parseInt((duration / (1000 * 60)) % 60);
  let hours = parseInt(duration / (1000 * 60 * 60));
  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;
  if (milliseconds < 10) {
    milliseconds = "00" + milliseconds;
  } else if (millseconds < 100) {
    milliseconds = "0" + milliseconds;
  }
  return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
};

alasql.fn.time_since = (timestamp) => {
  return alasql.fn.milliseconds_to_time(alasql.fn.milliseconds_since(timestamp));
};

alasql.fn.to_time = (timestamp) => {
  return new Date(timestamp);
};

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
    this.queryCache = new QueryCache(this.client.getQuery.bind(this.client));
  }

  getRequest(str) {
    if (this.team_data.sql_shortcuts && this.team_data.sql_shortcuts[str]) {
      return new Request(this.team_data.sql_shortcuts[str])
    }
    return new Request(str);
  }

  reply(message, heading, details, convo) {
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
  }

  respondWithDetails(message, handles, request) {
    let detailsSent = 0;

    const parseRequestAndSend = (response, convo) => {
      request = this.getRequest(response.text);
      detailsSent = 0;
      sendAllQueryDetails(convo);
    };

    const markDetailsSent = (convo, amount, end) => {
      if (!amount) {
        amount = 1;
      }
      detailsSent += amount;
      if (detailsSent == handles.length) {
        if (!end) {
          convo.ask("Do you want to analyze more?", [
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
                convo.ask("Tell me.", parseRequestAndSend);
                convo.next();
              }
            },
            {
              default: true,
              callback: parseRequestAndSend
            }
          ]);
        }
        convo.next();
      }
    };
    const sendAllQueryDetails = (convo) => {
      this.bot.startTyping(message);
      const sendFromCacheOrAPI = () => {
        this.queryCache.get(handles, (errors, queries)=> {
          if (errors && errors.length && errors.length == queries.length) {
            this.reply(message, "Few errors encountered while getting queries", JSON.stringify(errors), convo);
            markDetailsSent(convo, queries.length, true);
          } else {
            queries.forEach((query)=> {
              if (query) {
                sendQueryDetails(query.lensQuery, convo);
              } else {
                // ignore the error for now.
                markDetailsSent(convo);
              }
            });
          }
        });
      };
      if (request.error) {
        this.reply(message, "Error in your request", request.error, convo);
        markDetailsSent(convo, handles.length, true);
      } else if (request.sql) {
        // Do analysis here
        console.log("sql: " + request.sql);
        this.queryCache.get(handles, (errors, queries)=> {
          if (errors && errors.length) {
            this.reply(message, "Few errors encountered while getting queries", JSON.stringify(errors), convo);
          }
          queries = queries.filter(query=>query);
          console.log(JSON.stringify(queries));
          alasql.promise(request.sql, [queries.map((query) => {
            query = query.lensQuery;
            query.handle = query.queryHandle.handleId;
            if (query.queryConf && query.queryConf.properties) {
              let conf = {};
              query.queryConf.properties.reduce((obj, x)=> {
                if (x.key.indexOf("mapred") == 0 && x.key.indexOf("queue") > 0) {
                  query.queue = x.value;
                }
                let keys = x.key.split(".");
                let local_conf = conf;
                for (let i = 0; i < keys.length - 1; i++) {
                  let key = keys[i];
                  if (!local_conf[key]) {
                    local_conf[key] = {};
                  }
                  local_conf = local_conf[key];
                }
                local_conf[keys[keys.length - 1]] = x.value;
              });
              query.queryConf = conf;
            }
            return query;
          })]).then((result)=> {
            let table = new Table();
            result.forEach((row)=> {
              for (let key in row) {
                if (row.hasOwnProperty(key)) {
                  let value = row[key];
                  if (typeof (value) == "object") {
                    value = JSON.stringify(value);
                  }
                  table.cell(key, value);
                }
              }
              table.newRow();
            });
            this.reply(message, request.sql, table.toString(), convo);
            markDetailsSent(convo, queries.length);
          }).catch((error)=> {
            console.log("error: " + error);
            this.reply(message, "Query Invalid: " + error);
            markDetailsSent(convo, queries.length);
          });
        });
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
          this.reply(message, fields[0] + " for " + query.queryHandle.handleId, query[fields[0]], convo);
        } else {
          this.reply(message, "No field named " + fields[0] + " in query " + query.queryHandle.handleId, "", convo);
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
          this.reply(message, query.queryHandle.handleId, data, convo);
        } else {
          this.reply(message, "No data found for " + query.queryHandle.handleId, "", convo);
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
    const controller = Botkit.slackbot({debug: true, json_file_store: nconf.get("HOME") + '/lens-slack-bot-store'});
    const bot = controller.spawn({token: this.slackToken});
    bot.startRTM((error, bot, response) => {
      if (error) {
        console.error(error);
        throw new Error("Couldn't connect to slack", error);
      }
      // read team data here, since team id is not available before starting RTM
      bot.identifyTeam((error, team_id)=> {
        if (error) {
          console.log("Error reading team data");
          process.exit(1);
        }
        controller.storage.teams.get(team_id, (error, team_data) => {
          this.team_data = team_data || {};
        })
      });
      this.bot = bot;
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
        this.respondWithDetails(message, message.match[1].match(this.handleRegex), this.getRequest(message.match[5]));
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
        let request;
        if (message.match[5]) {
          request = this.getRequest(message.match[5]);
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
        this.bot.startTyping(message);
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
    controller.hears(["what do you know", "what have you learned"], ["direct_message", "direct_mention"], (bot, message) => {
      for (let key in this.team_data) {
        if (this.team_data.hasOwnProperty(key) && key != "id") {
          this.reply(message, "I know " + key, this.team_data[key]);
        }
      }
    });
    controller.hears(["^training$"], ["direct_message", "direct_mention"], (bot, message) => {
      const saveSql = (name, sql, callback) => {
        if (!this.team_data['sql_shortcuts']) {
          this.team_data['sql_shortcuts'] = {};
        }
        this.team_data.sql_shortcuts[name] = sql;
        this.team_data.id = message.team;
        controller.storage.teams.save(this.team_data, (err) => {
          if (err) {
            console.log("Error saving data");
          } else {
            callback();
          }
        });
      };
      const askSql = (response, convo) => {
        convo.ask("Tell me your sql", (response, convo) => {
          askName(response, convo);
          convo.next();
        }, {key: 'sql'});
        convo.next();
      };
      const askName = (response, convo) => {
        convo.ask("Tell me the shorthand name for the sql", (response, convo) => {
          let name = convo.extractResponse("name");
          let sql = convo.extractResponse("sql");
          saveSql(name, sql, ()=> {
            convo.say("Saved `" + sql + "` as `" + name + "`");
            convo.next();
          });
          convo.next();
        }, {key: 'name'});
      };
      this.bot.startConversation(message, (error, convo) => {
        convo.ask("What do you want me to learn?", [
          {
            pattern: "sql",
            callback: askSql
          },
          {
            default: true,
            callback: (error, convo) => {
              convo.silentRepeat();
            }
          }
        ]);
        convo.next();
      });
    });
    if (nconf.get("upgrade_secret")) {
      controller.hears(["^upgrade$"], ["direct_message", "direct_mention"], (bot, message) => {
        this.bot.startConversation(message, (error, convo) => {
          convo.ask("Provide the upgrade secret.", [
            {
              default: true,
              callback: (error, convo) => {
                if (convo.extractResponse('secret') == nconf.get("upgrade_secret")) {
                  convo.say("Going down for upgrade.");
                  convo.next();
                  process.exit();
                }
                convo.next();
              }
            }
          ], {key: 'secret'});
          convo.next();
        });
      });
    }
  }
}
module.exports = LensSlackBot;
if (require.main == module) {
  const bot = new LensSlackBot();
  bot.start();
}