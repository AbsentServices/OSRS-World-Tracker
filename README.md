# OSRS World Population & Activity Tracker

A real-time Old School RuneScape world monitoring system featuring web sockets, a live browser dashboard, and configurable Discord webhook alerts.

## Features
- **Real-Time WebSockets:** Pushes server population shifts directly to connected browser clients.
- **Discord Webhook Alerts:** Triggers formatted rich embeds when player spikes/drops exceed a configured threshold.
- **Tailwind Dashboard:** Clean, responsive UI displaying live activity streams and current world listings.

## Quick Start
Clone repository:
bash
1.   git clone [https://github.com/YOUR_USERNAME/osrs-world-tracker.git](https://github.com/YOUR_USERNAME/osrs-world-tracker.git)
   cd osrs-world-tracker

2. Install dependencies:
Bash
npm install

3. Configure environment variables:
Bash
cp .env.example .env

**Add your Discord Webhook URL to .env.**

4. Run the server:
Bash
npm start

5. **Open http://localhost:4000 in your browser.**



# Step-by-Step GitHub Upload Instructions

Run the following commands in your terminal from the root folder of your project (`osrs-world-tracker/`):

bash
## 1. Initialize local Git repository
git init

## 2. Stage all files
git add .

## 3. Commit files
git commit -m "Initial commit: OSRS World Tracker with WebSockets, Webpage, and Discord Webhooks"

## 4. Rename main branch
git branch -M main

## 5. Link your GitHub repository (replace URL with your GitHub repo link)
git remote add origin https://github.com/YOUR_USERNAME/osrs-world-tracker.git

## 6. Push code to GitHub
git push -u origin main
