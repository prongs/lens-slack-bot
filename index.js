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
    var handleRegexString = "\\w{8}-\\w{4}-\\w{4}-\\w{4}-\\w{12}";
    var handleRegex = new RegExp(handleRegexString, "g");

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
        bot.startRTM(function (error, bot, response) {
            if (error) {
                console.error(error);
                throw new Error("Couldn't connect to slack", error);
            }
        });
        controller.on('rtm_close', function(){
            process.exit(1);
        });
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
        function parseFields(str) {
            if (!str) {
                return null;
            }
            var fields = str.trim().split(/\s*,\s*/);
            for (var i = 0; i < fields.length; i++) {
                fields[i] = fields[i].replace(/\s(.)/g, function (x) {
                    return x.toUpperCase().trim();
                }).replace(/^(.)/, function (x) {
                    return x.toLowerCase();
                });
            }
            return fields;
        }

        function respondWithDetails(message, handles, fields) {
            function reply(heading, details) {
                var reply = getMessage(heading, details);
                if (reply.length < 4000) {
                    bot.reply(message, reply, updateLastActiveTime);
                } else {
                    if (typeof(details) == "object") {
                        details = YAML.stringify(details);
                    }
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
                if (fields && fields.length == 1) {
                    if (fields[0] in query) {
                        reply(fields[0] + " for " + query.queryHandle.handleId, query[fields[0]]);
                    } else {
                        reply("No field named " + fields[0] + " in query " + query.queryHandle.handleId);
                    }
                } else {
                    var data = {};
                    if (fields) {
                        fields.forEach(function (fieldName) {
                            if (fieldName in query) {
                                data[fieldName] = query[fieldName];
                            }
                        });
                    } else {
                        data = query;
                    }
                    if (data) {
                        reply(query.queryHandle.handleId, data);
                    } else {
                        reply("No data found for " + query.queryHandle.handleId);
                    }
                }
            }

            handles.forEach(function (handle) {
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
            });
        }

        controller.hears(["^(((" + handleRegexString + ")\\s*,?\\s*)+)(:(.*?))?$"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                var handles = message.match[1].match(handleRegex);
                var fields = parseFields(message.match[5]);
                respondWithDetails(message, handles, fields);
            }
        );
        controller.hears(["(all\\s*)?(\\w+)\\squeries(.*?)(:\\s*(.*?))?$"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                var qs = {};
                if (message.match[3]) {
                    var params = message.match[3].trim().split(/[^a-zA-Z.]+/);
                    if (params.length % 2 != 0) {
                        bot.reply("Sorry couldn't parse your arguments: " + message.match[3], updateLastActiveTime);
                        return;
                    } else {
                        for (var i = 0; i < params.length; i += 2) {
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
                if (message.match[5]) {
                    var fields = parseFields(message.match[5]);
                }
                function reply(queries) {
                    var reply = "`" + JSON.stringify(qs) + "`(" + queries.length + " )";
                    for (var i = 0; i < queries.length; i++) {
                        queries[i] = queries[i].handleId;
                    }
                    if (queries.length > 0) {
                        reply = reply + "\n```" + YAML.stringify(queries) + "```";
                    }
                    bot.reply(message, reply, function () {
                        updateLastActiveTime();
                        if (fields) {
                            if (fields.length == 1 && fields[0].match(/details/i)) {
                                fields = null;
                            }
                            respondWithDetails(message, queries, fields);
                        }
                    });
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