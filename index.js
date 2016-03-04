var nconf = require("nconf");
var Botkit = require('botkit');
var LensClient = require("lens-node-client");
var YAML = require("yamljs");
var NodeCache = require("node-cache");
var queryCache = new NodeCache({stdTTL: 200, checkperiod: 240});

function LensSlackBot() {
    nconf.argv()
        .env()
        .file({file: nconf.get("HOME") + '/lens_config.json'});

    var slackToken = nconf.get("slackToken");
    var client = new LensClient({
        lensServerBaseUrl: nconf.get("lensServerBaseUrl"),
        username: nconf.get("lensUsername"),
        password: nconf.get("lensPassword")
    });
    var handleRegexString = "\\w{8}-(\\w{4}-){3}\\w{12}";

    function getMessage(heading, details) {
        if (!details) {
            return heading;
        }
        if (typeof details == "object") {
            details = YAML.stringify(details);
        }
        return "`" + heading + "`:\n```" + details + "```";
    }

    this.start = function () {
        console.log("starting lens bot");
        var controller = Botkit.slackbot({debug: true});
        var bot = controller.spawn({token: slackToken});
        bot.startRTM();
        var lastActiveTime = new Date();

        function updateLastActiveTime() {
            lastActiveTime = new Date();
        }

        controller.on('tick', function () {
            var now = new Date();
            if (now.getTime() - lastActiveTime.getTime() > 1000 * 60 * 1) { // 1 minute idle timeout
                bot.say({type: "ping", id: now.getTime()}, updateLastActiveTime);
            }
        });
        controller.hears(["^\\s*(\\w{8}-\\w{4}-\\w{4}-\\w{4}-\\w{12})\\s*:\\s*(.*?)\\s*$"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                var handle = message.match[1];
                var fields = message.match[2].split(/\s*,\s*/);
                for (var i = 0; i < fields.length; i++) {
                    fields[i] = fields[i].replace(/\s(.)/g, function (x) {
                        return x.toUpperCase().trim();
                    }).replace(/^(.)/, function (x) {
                        return x.toLowerCase();
                    });
                }
                function reply(heading, details) {
                    var reply = getMessage(heading, details);
                    if (reply.length < 4000) {
                        bot.reply(message, reply, updateLastActiveTime);
                    } else {
                        bot.api.files.upload({
                            content: details,
                            filetype: 'yaml',
                            title: heading,
                            filename: heading,
                            channels: message.channel
                        }, function (error, json) {
                            console.log(error);
                            console.log(json);
                        });
                    }
                }

                function sendQueryDetails(query) {
                    if (fields.length == 1) {
                        if (fields[0] in query) {
                            reply(fields[0] + " for " + query.queryHandle.handleId, query[fields[0]]);
                        } else {
                            reply("No field named " + fields[0] + " in query " + query.queryHandle.handleId);
                        }
                    } else {
                        var data = {};
                        fields.forEach(function (fieldName) {
                            if (fieldName in query) {
                                data[fieldName] = query[fieldName];
                            }
                        });
                        if (data) {
                            reply(query.queryHandle.handleId, data);
                        } else {
                            reply("No data found for " + query.queryHandle.handleId);
                        }
                    }
                }

                queryCache.get(handle, function (error, value) {
                    if (!error) {
                        if (!value) {
                            client.getQuery(handle, function (query) {
                                queryCache.set(handle, query);
                                sendQueryDetails(query);
                            })
                        } else {
                            sendQueryDetails(value);
                        }
                    }
                });
            }
        );
        controller.hears([".*?queries.*"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                var matches = message.text.match(/(\w+)=`(.*?)`/g);
                var qs = {};
                var queryParams = [];
                for (var i in matches) {
                    var kv = matches[i].split("=");
                    qs[kv[0]] = kv[1].replace(/`/g, "");
                }
                if (!('state' in qs)) {
                    var split = message.text.split("queries");
                    if (split.length > 1) {
                        qs['state'] = split[0].replace(/all/g, '');
                    }
                }
                if ('state' in qs) {
                    qs['state'] = qs['state'].toUpperCase().trim();
                }
                if (!('user' in qs)) {
                    if (message.text.indexOf("all") > -1) {
                        qs['user'] = 'all';
                    }
                }
                function reply(queries) {
                    var reply = "`" + JSON.stringify(qs) + "`(" + queries.length + " )";
                    for (var i = 0; i < queries.length; i++) {
                        queries[i] = queries[i].handleId;
                    }
                    if (queries.length > 0) {
                        reply = reply + "\n```" + YAML.stringify(queries) + "```";
                    }
                    bot.reply(message, reply, updateLastActiveTime);
                }

                if (!('user' in qs)) {
                    bot.api.users.info({user: message.user}, function (error, json) {
                        if (json && json.user && json.user.name) {
                            qs['user'] = json.user.name;
                            client.listQueries(qs, reply);
                        }
                    });
                } else {
                    client.listQueries(qs, reply);
                }
            }
        );
    }
}
module.exports = LensSlackBot;
if (require.main == module) {
    var bot = new LensSlackBot();
    bot.start();
}