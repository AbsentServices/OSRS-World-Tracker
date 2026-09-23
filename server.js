const express = require('express');
const axios = require('axios');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const ALERT_THRESHOLD = parseInt(process.env.ALERT_THRESHOLD || '10', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

let previousWorldData = {};
let activityLogs = [];

// Fetch OSRS server listing via OSRS Wiki API
async function fetchWorldData() {
    try {
        const response = await axios.get(
            'https://runescape.wiki/api/v2/osrs/worlds',
            {
                headers: {
                    'User-Agent': 'OSRS-World-Tracker - @absent'
                }
            }
        );
        
        const currentData = {};
        // If the response returns an array directly or wraps it under a property:
        const rawData = response.data.worlds || response.data;
        const list = Array.isArray(rawData) ? rawData : [];

        list.forEach(w => {
            const worldId = w.id || w.number;
            currentData[worldId] = {
                players: w.players,
                location: w.location || 'Unknown',
                activity: w.activity || 'Standard'
            };
        });

        detectChanges(currentData);
        previousWorldData = currentData;
    } catch (error) {
        console.error('Error querying OSRS servers:', error.message);
    }
}

function detectChanges(currentData) {
    const timestamp = new Date().toLocaleTimeString();

    for (const [worldId, data] of Object.entries(currentData)) {
        if (previousWorldData[worldId]) {
            const prevCount = previousWorldData[worldId].players;
            const diff = data.players - prevCount;

            if (diff !== 0) {
                const logEntry = {
                    timestamp,
                    world: worldId,
                    type: diff > 0 ? 'LOGIN' : 'LOGOUT',
                    count: Math.abs(diff),
                    total: data.players,
                    activity: data.activity
                };

                activityLogs.unshift(logEntry);
                if (activityLogs.length > 200) activityLogs.pop();

                // Broadcast via WebSocket to Frontend
                broadcast({ type: 'WORLD_UPDATE', data: logEntry, currentData });

                // Dispatch Discord Webhook if threshold is reached
                if (Math.abs(diff) >= ALERT_THRESHOLD && DISCORD_WEBHOOK_URL) {
                    sendDiscordWebhook(logEntry);
                }
            }
        }
    }
}

async function sendDiscordWebhook(log) {
    const isLogin = log.type === 'LOGIN';
    const embed = {
        username: 'OSRS World Monitor',
        avatar_url: 'https://oldschool.runescape.wiki/images/f/f6/Coins_detail.png',
        embeds: [{
            title: `${isLogin ? '📈 Player Spike' : '📉 Player Drop'} on World ${log.world}`,
            description: `A net change of **${isLogin ? '+' : '-'}${log.count} player(s)** was detected.`,
            color: isLogin ? 0x4CAF50 : 0xF44336,
            fields: [
                { name: 'World', value: `World ${log.world}`, inline: true },
                { name: 'New Population', value: `${log.total} / 2000`, inline: true },
                { name: 'Activity', value: log.activity, inline: true }
            ],
            footer: { text: 'OSRS Tracker Alert System' },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        await axios.post(DISCORD_WEBHOOK_URL, embed);
    } catch (err) {
        console.error('Failed to dispatch Discord webhook:', err.message);
    }
}

function broadcast(payload) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

// REST Route for Initial Client State
app.get('/api/state', (req, res) => {
    res.json({ worlds: previousWorldData, logs: activityLogs });
});

setInterval(fetchWorldData, POLL_INTERVAL);
fetchWorldData();

server.listen(PORT, () => {
    console.log(`OSRS World Tracker online at http://localhost:${PORT}`);
});