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
         "lensPassword":"admin-user-password"
     } 
```
* Run the following code with node:
```
var bot = new LensSlackBot();
bot.start();
```
* Go to slack and wait for your bot to come online :)


## What can this bot do:

Once your bot is online, it accepts the following types of commands:

### query-handle
It'll reply with the details of the query when you give him the id.
### multiple query-handles separated by comma/space/whatever
It'll do the same thing as above, but for all queries
### single/multiple query ids followed by ':' followed by the fields you want
It'll do the same thing as the above two, except that it'll not give you the entire query detail, it'll just give you the fields you wanted, as specified by the part of your message after the `:`
example message: `90625106-3bd7-42c2-b324-2da753c0de22: status, priority, driver query, user query`
### query status followed by the word 'queries'
Will give you the list of your queries with the given status
e.g. `running queries`, `queued queries`
### The above command followed by extra filters
Same thing, the filters will be considered. Possible Filters are defined by [lens query list api](http://lens.apache.org/resource_QueryServiceResource.html#path__queryapi_queries.html). 
e.g. `running queries queryName=my_query`
### Either of the above two commands prefixed by 'all'
Does the same thing as those commands, except it gives you the list of queries of `all` users, not just yours.
### Either of the above three commands followed by ':' and list of fields to extract
First gives the list of queries considering your filters. Then for each query, extracts the desired fields and gives them. 
e.g. `all queued queries: priority`
You can ask for all details like this: `all queued queries: details`

## More chat instructions to be added soon :)
## Contributing

* Fork it
* Add/change code
* Raise a pull-request
* Star it :)