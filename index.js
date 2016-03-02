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
        var controller = Botkit.slackbot({});
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
    }
}
module.exports = LensSlackBot;
var bot = new LensSlackBot();
bot.start();