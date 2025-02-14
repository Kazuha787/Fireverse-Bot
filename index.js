const axios = require('axios');
const fs = require('fs').promises;
const banner = require('./banner.js');

console.log(banner);

class FireverseMusicBot {
    constructor(token, accountIndex) {
        this.baseUrl = 'https://api.fireverseai.com';
        this.token = token;
        this.accountIndex = accountIndex;
        this.playedSongs = new Set();
        this.dailyPlayCount = 0;
        this.DAILY_LIMIT = 50;
        this.lastHeartbeat = Date.now();
        this.totalListeningTime = 0;
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.8',
            'content-type': 'application/json',
            'origin': 'https://app.fireverseai.com',
            'referer': 'https://app.fireverseai.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'x-version': '1.0.100',
            'sec-ch-ua': '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'sec-gpc': '1',
            'token': token
        };
    }

    log(message, overwrite = false) {
        const prefix = `[Account ${this.accountIndex}] `;
        if (overwrite) {
            process.stdout.write(`\r${prefix}${message}`);
        } else {
            console.log(`${prefix}${message}`);
        }
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    async initialize() {
        try {
            await this.getUserInfo();
            await this.getDailyTasks();
            return true;
        } catch (error) {
            this.log('❌ Error initializing bot: ' + error.message);
            return false;
        }
    }

    async getUserInfo() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/userInfo/getMyInfo`,
                { headers: this.headers }
            );
            const { level, expValue, score, nextLevelExpValue } = response.data.data;
            this.log('\n📊 User Stats:');
            this.log(`Level: ${level} | EXP: ${expValue}/${nextLevelExpValue} | Score: ${score}`);
            this.log(`Total Listening Time: ${Math.floor(this.totalListeningTime / 60)} minutes\n`);
        } catch (error) {
            this.log('❌ Error getting user info: ' + error.message);
        }
    }

    async getDailyTasks() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/musicTask/getListByCategory?taskCategory=1`,
                { headers: this.headers }
            );
            
            if (response.data?.data && Array.isArray(response.data.data)) {
                this.log('\n📋 Daily Tasks:');
                response.data.data.forEach(task => {
                    if (task && task.name) {
                        let progress;
                        if (task.taskKey === 'play_music' && task.unit === 'minutes') {
                            progress = `${Math.floor(this.totalListeningTime / 60)}/${task.completeNum}`;
                        } else {
                            progress = task.itemCount || `${task.completedRounds || 0}/${task.maxCompleteLimit || task.completeNum || 0}`;
                        }
                        this.log(`- ${task.name}: ${progress} (${task.rewardScore} points)`);
                    }
                });
                this.log('');
            }
        } catch (error) {
            this.log('❌ Error getting daily tasks: ' + error.message);
        }
    }

    async getRecommendedSongs() {
        try {
            const response = await axios.post(
                `${this.baseUrl}/home/getRecommend`,
                { type: 1 },
                { headers: this.headers }
            );
            return response.data?.data || [];
        } catch (error) {
            this.log('❌ Error getting recommended songs: ' + error.message);
            return [];
        }
    }

    async addToHistory(musicId) {
        try {
            await axios.post(
                `${this.baseUrl}/musicHistory/addToHistory/${musicId}`,
                {},
                { headers: this.headers }
            );
        } catch (error) {
            this.log('❌ Error adding to history: ' + error.message);
        }
    }

    async getMusicDetails(musicId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/music/getDetailById?musicId=${musicId}`,
                { headers: this.headers }
            );
            return response.data?.data;
        } catch (error) {
            this.log('❌ Error getting music details: ' + error.message);
            return null;
        }
    }

    async sendHeartbeat() {
        try {
            const now = Date.now();
            if (now - this.lastHeartbeat >= 30000) {
                await axios.post(
                    `${this.baseUrl}/music/userOnlineTime/receiveHeartbeat`,
                    {},
                    { headers: this.headers }
                );
                this.lastHeartbeat = now;
                process.stdout.write('💓');
            }
        } catch (error) {
            // Silent heartbeat errors
        }
    }

    async playMusic(musicId) {
        try {
            await axios.post(
                `${this.baseUrl}/musicUserBehavior/playEvent`,
                { musicId, event: 'playing' },
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async endMusic(musicId) {
        try {
            await axios.post(
                `${this.baseUrl}/musicUserBehavior/playEvent`,
                { musicId, event: 'playEnd' },
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            this.log('❌ Error ending music: ' + error.message);
            return false;
        }
    }

    async likeMusic(musicId) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/musicMyFavorite/addToMyFavorite?musicId=${musicId}`,
                {},
                { headers: this.headers }
            );
            return response.data?.success || false;
        } catch (error) {
            this.log('❌ Error liking music: ' + error.message);
            return false;
        }
    }

    async commentMusic(musicId, content = "good one") {
        try {
            const commentData = {
                content,
                musicId,
                parentId: 0,
                rootId: 0
            };
            
            const response = await axios.post(
                `${this.baseUrl}/musicComment/addComment`,
                commentData,
                { headers: this.headers }
            );
            return response.data?.success || false;
        } catch (error) {
            this.log('❌ Error commenting on music: ' + error.message);
            return false;
        }
    }

    async playSession() {
        try {
            if (this.dailyPlayCount >= this.DAILY_LIMIT) {
                this.log(`\n🎵 Daily limit reached (${this.DAILY_LIMIT}/${this.DAILY_LIMIT}). Waiting for reset...`);
                return false;
            }

            const songs = await this.getRecommendedSongs();
            if (!songs || songs.length === 0) {
                this.log('\n❌ No songs available, retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                return true;
            }

            for (const song of songs) {
                if (this.playedSongs.has(song.id)) continue;

                this.playedSongs.add(song.id);
                this.dailyPlayCount++;

                const musicDetails = await this.getMusicDetails(song.id) || {};
                const duration = musicDetails.duration || song.duration || 180;
                
                await this.addToHistory(song.id);

                const songName = song.musicName || musicDetails.musicName || 'Unknown Song';
                const author = song.author || musicDetails.author || 'Unknown Artist';

                this.log('\n▶️  Now Playing:');
                this.log(`🎵 Title: ${songName}`);
                this.log(`👤 Artist: ${author}`);
                this.log(`🆔 Music ID: ${song.id}`);
                this.log(`📊 Progress: ${this.dailyPlayCount}/${this.DAILY_LIMIT} songs today`);
                this.log(`⏱️  Duration: ${this.formatTime(duration)}`);

                const likeSuccess = await this.likeMusic(song.id);
                this.log(`${likeSuccess ? '❤️' : '💔'} Like status: ${likeSuccess ? 'Success' : 'Failed'}`);
                
                const commentSuccess = await this.commentMusic(song.id);
                this.log(`💬 Comment status: ${commentSuccess ? 'Success' : 'Failed'}`);

                if (await this.playMusic(song.id)) {
                    let secondsPlayed = 0;
                    
                    for (let timeLeft = duration; timeLeft > 0; timeLeft--) {
                        await this.sendHeartbeat();
                        secondsPlayed++;
                        this.totalListeningTime++;
                        
                        this.log(`⏳ Time remaining: ${this.formatTime(timeLeft)} | Listening time: ${Math.floor(this.totalListeningTime / 60)} minutes`, true);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    const endSuccess = await this.endMusic(song.id);
                    
                    if (endSuccess) {
                        this.log('\n✅ Finished playing');
                    } else {
                        this.log('\n⚠️ Song ended but playEnd event failed');
                    }
                    
                    await this.getUserInfo();
                    await this.getDailyTasks();
                    break;
                } else {
                    this.log('\n❌ Failed to play song');
                }
            }

            return true;
        } catch (error) {
            this.log('❌ Error in play session: ' + error.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return true;
        }
    }

    async startDailyLoop() {
        while (true) {
            const shouldContinue = await this.playSession();
            
            if (!shouldContinue) {
                this.log('\n⏰ Waiting 24 hours before next session...');
                for (let timeLeft = 24 * 60 * 60; timeLeft > 0; timeLeft--) {
                    this.log(`⏳ Next session in: ${this.formatTime(timeLeft)}`, true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                this.dailyPlayCount = 0;
                this.playedSongs.clear();
                this.totalListeningTime = 0;
                this.log('\n🔄 Starting new daily session');
                await this.getUserInfo();
                await this.getDailyTasks();
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
}

    async function readTokens() {
        try {
            const content = await fs.readFile('tokens.txt', 'utf-8');
            return content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        } catch (error) {
            console.error('❌ Error reading tokens.txt:', error.message);
            process.exit(1);
        }
    }

    async function main() {
        const tokens = await readTokens();
        
        if (tokens.length === 0) {
            console.error('❌ No tokens found in tokens.txt');
            process.exit(1);
        }

        console.log(`📱 Found ${tokens.length} account(s)`);
        
        const bots = tokens.map((token, index) => new FireverseMusicBot(token, index + 1));
        
        const initResults = await Promise.all(bots.map(bot => bot.initialize()));
        
        const activeBots = bots.filter((_, index) => initResults[index]);
        
        if (activeBots.length === 0) {
            console.error('❌ No accounts could be initialized successfully');
            process.exit(1);
        }

        await Promise.all(activeBots.map(bot => bot.startDailyLoop()));
    }

    main().catch(console.error);