# lens-slack-bot

A [slack](http://api.slack.com/) [bot](https://api.slack.com/bot-users) for interacting with a lens installation. 
  
This is developed using [botkit](https://github.com/howdyai/botkit/) and [lens-node-client](https://github.com/prongs/lens-node-client/).

## Installation

* install as nodejs package. 
* Create $HOME/lens_config.json with content like the following:
```
     {
         "slackToken":"your-bot's slack-token",
         "lensServerBaseUrl": "http://lens-installation/lensapi/",
         "lensUsername":"admin-user-name",
         "lensPassword":"admin-user-password",
         "upgrade_secret": "secret with which you can ask the bot to suicide."
     } 
```
* Run the following code with node:
```
var bot = new LensSlackBot();
bot.start();
```
* Go to slack and wait for your bot to come online :) The upgrade secret is useful when you have a script that's starting bot in a loop. 
So you ask the bot to upgrade, provide the upgrade secret, and it goes offline. Then the external script can bring it up again. 


## What can this bot do:

### Query analysis

A command is made up of two parts: collection, and action. Collection and action are separated by `:`. The bot will understand 
the collection, run the action over that and reply to you in chat. Then it'll ask if you want to analyze more. There you can 
provide more action commands. Here, the context is the original collection, and you can put action commands to analyze over the
same collection. Once you reply no, the context is lost, and you can analyze over a different collection. 

#### How to specify a Collection

* Space separated list of query handles
* `running queries` == your queries that are in running state. Similarly `queued queries`, `successful queries`, `failed queries` etc. 
* `all running queries` == all queries in running state. Similarly for other query states.

#### Actions:

* Comma separated List of fields to extract. e.g. `status, user query`. Note that here, `user query` translates to `userQuery`, but you can specify whichever is comfortable. 
* A sql. e.g. `select priority, count(*) num from ? group by priority`. We use [alasql](https://github.com/agershun/alasql) for running
  sql on in-memory data. The first `?` in the query refers to the collection currently in context. 
* A shortcut which the bot already knows. The shortcuts are developed by training the bot. 

### Training
As mentioned earlier, sql analysis can be done on a query collection. Now, Writing sql everytime could be troublesome, so there's a 
feature to save your sql queries so that they can be refered by a short name. 

* You can ask the bot to show what it has learned so far by asking `what do you know`/`what have you learned`.
* You can perform training by writing `training` in a private chat with the bot. Then Answer `sql` for `what do you want me to learn` and
   answer the next questions. 

### Upgrade
You can tell the bot to `upgrade` itself. It'll ask you for an upgrade secret. The secret should be deployed in the config xml
and shared with people who should have the capability to upgrade. 

## More chat instructions to be added soon :)
## Contributing

* Fork it
* Add/change code
* Raise a pull-request
* Star it :)