# OSRS World Population & Activity Tracker

A real-time Old School RuneScape world monitoring system featuring web sockets, a live browser dashboard, and configurable Discord webhook alerts.

## Features
- **Real-Time WebSockets:** Pushes server population shifts directly to connected browser clients.
- **Discord Webhook Alerts:** Triggers formatted rich embeds when player spikes/drops exceed a configured threshold.
- **Tailwind Dashboard:** Clean, responsive UI displaying live activity streams and current world listings.

![Website](/images/website.png)
![Discordwebhook](/images/discordwebhook.png)


## Setup
- Make a file named .env
- Make sure to put this in the file

``` PORT=4000 (Your port)
HOST=0.0.0.0 (Your IP)
DISCORD_WEBHOOK_URL=  (Webhook for Discord)
POLL_INTERVAL_MS=30000 (how fast you want to poll the worlds 30000 = 30 Seconds)
  
