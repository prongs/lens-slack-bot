var nconf = require("nconf");
var Botkit = require('botkit');
var LensClient = require("lens-node-client");
var YAML = require("yamljs");

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

    function forEachHandle(text, callback) {
        text.match(/\w{8}-(\w{4}-){3}\w{12}/g).forEach(callback);
    }

    this.start = function () {
        console.log("starting lens bot");
        var controller = Botkit.slackbot({debug: true});
        controller.spawn({token: slackToken}).startRTM();
        controller.hears(["details", "query details"], ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                forEachHandle(message.text, function (handle) {
                    client.getQuery(handle, function (lensQuery) {
                        bot.reply(message, "`" + handle + "`:\n```" + YAML.stringify(lensQuery) + "```");
                    });
                });
            }
        );

        controller.hears(["status", "query status"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                forEachHandle(message.text, function (handle) {
                    client.getQuery(handle, function (lensQuery) {
                        bot.reply(message, "`" + handle + "`:\n```" + YAML.stringify(lensQuery.status) + "```");
                    });
                });
            }
        );
        controller.hears([".*?queries.*"],
            ['direct_message', 'direct_mention', 'mention', 'ambient'],
            function (bot, message) {
                var matches = message.text.match(/(\w+)=(.*?)/g);
                var qs = {};
                var queryParams = [];
                for(var i in matches) {
                    var kv = matches[i].split("=");
                    qs[kv[0]] = kv[1].replace(/`/g,"");
                }
                if(!('state' in qs)) {
                    var split = message.text.split("queries");
                    if(split.length > 1) {
                        qs['state'] = split[0];
                    }
                }
                if('state' in qs) {
                    qs['state'] = qs['state'].toUpperCase().trim();
                }
                client.listQueries(qs, function(queries){
                    var reply = "`" + JSON.stringify(qs) + "`(" + queries.length +" )";
                    if(queries.length > 0) {
                        reply = reply + "\n```" + YAML.stringify(queries) + "```";
                    }
                    bot.reply(message, reply);
                });
            }
        );
    }
}
module.exports = LensSlackBot;
if (require.main == module) {
    var bot = new LensSlackBot();
    bot.start();
}