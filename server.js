const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
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


const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const ALERT_THRESHOLD = parseInt(process.env.ALERT_THRESHOLD || '10', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

let previousWorldData = {};
let activityLogs = [];

// Rate-limiting queue for Discord Webhooks
const webhookQueue = [];
let isProcessingQueue = false;

async function processWebhookQueue() {
    if (isProcessingQueue || webhookQueue.length === 0) return;
    isProcessingQueue = true;

    while (webhookQueue.length > 0) {
        const payload = webhookQueue.shift();
        try {
            await axios.post(DISCORD_WEBHOOK_URL, payload);
        } catch (err) {
            if (err.response?.status === 429) {
                // If hit with 429, requeue the message and wait for Discord's retry_after time
                const retryAfter = (err.response.data?.retry_after || 1) * 1000;
                webhookQueue.unshift(payload);
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                continue;
            }
            console.error('Failed to dispatch Discord webhook:', err.message);
        }

        // Wait 500ms between successfully sent webhooks to avoid Discord rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    isProcessingQueue = false;
}


// Known F2P World IDs to guard against scraping gaps
const F2P_WORLDS = new Set([
    301, 308, 316, 326, 335, 371, 372, 379, 380, 381, 382, 383, 384, 385, 
    393, 394, 433, 434, 435, 436, 437, 469, 475, 476, 483, 501, 562, 563, 571
]);

async function fetchWorldData() {
    try {
        const response = await axios.get('https://oldschool.runescape.com/slu?order=WmpLA', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const currentData = {};

        $('table tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length < 5) return;

            const worldCellText = $(cells[0]).text().trim(); 
            const typeText = $(cells[3]).text().trim().toLowerCase(); // Normalize to lowercase
            const activityText = $(cells[4]).text().trim();

            // 🛑 1. Filter out F2P using case-insensitive check
            if (typeText.includes('free')) return;

            const worldIdMatch = worldCellText.match(/\d+/);

            if (worldIdMatch) {
                let rawId = parseInt(worldIdMatch[0], 10);
                // Convert relative numbers like "World 1" to "301"
                const worldId = rawId < 300 ? rawId + 300 : rawId;

                // 🛑 2. Hard block known F2P world numbers as a second layer
                if (F2P_WORLDS.has(worldId)) return;

                const players = parseInt($(cells[1]).text().trim().replace(/,/g, ''), 10) || 0;

                currentData[worldId] = {
                    players,
                    location: $(cells[2]).text().trim() || 'Unknown',
                    activity: activityText === '-' ? 'Standard' : (activityText || 'Standard')
                };
            }
        });

        if (Object.keys(currentData).length === 0) {
            console.warn('Scraper warning: No world rows found on the page.');
            return;
        }

        detectChanges(currentData);
        previousWorldData = currentData;
    } catch (error) {
        console.error('Error querying OSRS servers:', error.message);
    }
}

        // Loop through all table rows across the page
        // This Tracks all worlds even F2p
 /*       $('table tr').each((_, row) => {
            const cells = $(row).find('td');
            
            // Skip headers or rows with fewer than 3 cells
            if (cells.length < 3) return;

            const worldText = $(cells[0]).text().trim();
            const playersText = $(cells[1]).text().trim();
            const locationText = $(cells[2]).text().trim();
            const activityText = cells.length > 3 ? $(cells[3]).text().trim() : 'Standard';

            // Extract numeric world ID (e.g., "World 301" or "301" -> 301)
            const worldIdMatch = worldText.match(/\d+/);
            if (worldIdMatch) {
                const worldId = parseInt(worldIdMatch[0], 10);
                const players = parseInt(playersText.replace(/,/g, ''), 10) || 0;

                currentData[worldId] = {
                    players,
                    location: locationText || 'Unknown',
                    activity: activityText || 'Standard'
                };
            }
        });*/


function detectChanges(currentData) {
    const timestamp = new Date().toLocaleTimeString();

    for (const [worldId, data] of Object.entries(currentData)) {
        if (previousWorldData[worldId]) {
            const prevCount = previousWorldData[worldId].players;
            const diff = data.players - prevCount;

            // Only process when 5 or more players log in
            if (diff >= 5) {
                const logEntry = {
                    timestamp,
                    world: worldId,
                    type: 'LOGIN',
                    count: diff,
                    total: data.players,
                    activity: data.activity
                };

                activityLogs.unshift(logEntry);
                if (activityLogs.length > 200) activityLogs.pop();

                // Broadcast via WebSocket to Frontend
                broadcast({ type: 'WORLD_UPDATE', data: logEntry, currentData });

                // Dispatch Discord Webhook if threshold is reached
                if (diff >= ALERT_THRESHOLD && DISCORD_WEBHOOK_URL) {
                    sendDiscordWebhook(logEntry);
                }
            }
        }
    }
}

function getEmbedColor(totalPlayers) {
    if (totalPlayers >= 1500) {
        return 0xFF0000; // Red for high population / crowded
    } else if (totalPlayers >= 800) {
        return 0xFFA500; // Orange for medium population
    } else if (totalPlayers >= 300) {
        return 0xFFFF00; // Yellow for low-medium population
    } else {
        return 0x00FF00; // Green for quiet / low population
    }
}

function sendDiscordWebhook(log) {
    const isLogin = log.type === 'LOGIN';
    const embedColor = getEmbedColor(log.total);

    const embed = {
        username: 'OSRS World Monitor',
        avatar_url: 'https://oldschool.runescape.wiki/images/f/f6/Coins_detail.png',
        embeds: [{
            title: `${isLogin ? '📈 Player Spike' : '📉 Player Drop'} on World ${log.world}`,
            description: `A net change of **${isLogin ? '+' : '-'}${log.count} player(s)** was detected.`,
            color: embedColor,
            fields: [
                { name: 'World', value: `World ${log.world}`, inline: true },
                { name: 'Location', value: log.location || 'Unknown', inline: true },
                { name: 'New Population', value: `${log.total} / 2000`, inline: true },
                { name: 'Activity', value: log.activity || 'Standard', inline: true }
            ],
            footer: { text: 'OSRS Tracker Alert System' },
            timestamp: new Date().toISOString()
        }]
    };

    // Push into queue and kick off the rate-limited processor
    webhookQueue.push(embed);
    processWebhookQueue();
}

/*function sendDiscordWebhook(log) { //Discord 
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

    // Push into queue and kick off the rate-limited processor
    webhookQueue.push(embed);
    processWebhookQueue();
}*/

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


const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`OSRS World Tracker online at http://${HOST}:${PORT}`);
});