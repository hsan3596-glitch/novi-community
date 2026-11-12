const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages
    ]
});

// ================= الإعدادات الأساسية =================
const BOT_TOKEN = 'MTU3MDM4NjMyMzM2NDEyMjYyNg.GTaqMA.m6hpZOWG7GPCzTZYOlL_KUhitnsHnzSqdoVKUQ';
const CLIENT_ID = '1570386323364122626';
const CLIENT_SECRET = 'qA3X6Kc91FRanVXuStKXdcJfAWSuGTZW';
const REDIRECT_URI = 'http://localhost:3000/api/auth/discord/callback';

const GUILD_ID = '1369384169536225280';
const STAFF_APPLIES_CHANNEL_ID = '1540823904241721354';

let applications = {}; 

const ADMIN_IDS = [
    '714571252584677397', '230413951865847808', '1502716833139265617',
    '1279134672105902093', '1455267470255591424', '1169319951866269746',
    '303712162994716684', '999358163541307532', '1346240919833153547',
    '1541459602233884793', '1495831640755146854', '1149821286072205432', '1531475573128429588'
];

const PORT = 3000;

client.once('ready', async () => {
    console.log(`✅ تم تسجيل الدخول كـ ${client.user.tag}`);
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) await guild.members.fetch();
    } catch (err) {}
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/api/auth/discord', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('لم يتم توفير الكود');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) return res.status(400).send('فشل مصادقة ديسكورد');

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });

        const userData = await userResponse.json();
        res.redirect(`/index.html?user_id=${userData.id}&username=${userData.username}&avatar=${userData.avatar}`);
    } catch (error) {
        res.status(500).send('خطأ أثناء المصادقة');
    }
});

app.get('/api/apply/status/:userId', (req, res) => {
    const userId = req.params.userId;
    const appData = applications[userId];
    if (!appData) return res.json({ status: 'none' });
    res.json({ status: appData.status });
});

// استقبال طلب التقديم متضمنًا الاسم (fullName)
app.post('/api/apply', async (req, res) => {
    try {
        const { userId, username, fullName, age, experience, reason } = req.body;
        applications[userId] = { status: 'pending', username, fullName, age, experience, reason };

        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'السيرفر غير موجود' });

        const channel = guild.channels.cache.get(STAFF_APPLIES_CHANNEL_ID);
        if (!channel) return res.status(500).json({ error: 'روم التقديمات غير موجود' });

        const embed = {
            color: 0x5865F2,
            title: '📥 طلب انضمام جديد للطاقم الإداري',
            fields: [
                { name: '📝 الاسم:', value: `\`${fullName}\``, inline: false },
                { name: '👤 العضو (ديسكورد):', value: `<@${userId}> (${username})`, inline: false },
                { name: '📅 العمر:', value: `\`${age}\``, inline: true },
                { name: '💼 الخبرة:', value: experience, inline: false },
                { name: '💡 السبب:', value: reason, inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        const row = {
            type: 1,
            components: [
                { type: 2, label: 'قبول الطلب ✅', style: 3, custom_id: `approve_${userId}` },
                { type: 2, label: 'رفض الطلب ❌', style: 4, custom_id: `reject_${userId}` }
            ]
        };

        await channel.send({ embeds: [embed], components: [row] });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error in /api/apply:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [action, userId] = interaction.customId.split('_');
    if (!['approve', 'reject'].includes(action)) return;

    if (!ADMIN_IDS.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية لاتخاذ هذا القرار!', ephemeral: true });
    }

    const targetUser = await client.users.fetch(userId).catch(() => null);

    if (action === 'approve') {
        if (applications[userId]) applications[userId].status = 'approved';
        if (targetUser) await targetUser.send('🎉 **مبروك!** تم قبول طلب انضمامك للطاقم الإداري في سيرفر Novi Community. تفقد الموقع لتحديث حالتك.').catch(() => {});
        await interaction.update({ content: `✅ **تم قبول الطلب** بواسطة ${interaction.user.tag}`, embeds: [], components: [] });
    } else if (action === 'reject') {
        if (applications[userId]) applications[userId].status = 'rejected';
        if (targetUser) await targetUser.send('عذراً، تم رفض طلب انضمامك للطاقم الإداري في سيرفر Novi Community في الوقت الحالي. شكراً لاهتمامك!').catch(() => {});
        await interaction.update({ content: `❌ **تم رفض الطلب** بواسطة ${interaction.user.tag}`, embeds: [], components: [] });
    }
});

app.get('/api/stats', (req, res) => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.status(404).json({ error: 'غير موجود' });
    res.json({
        total: guild.memberCount,
        online: guild.presences ? guild.presences.cache.filter(p => p.status !== 'offline').size : 0,
        offline: guild.memberCount - (guild.presences ? guild.presences.cache.filter(p => p.status !== 'offline').size : 0),
        bots: guild.members.cache.filter(m => m.user.bot).size
    });
});

app.get('/api/staff', async (req, res) => {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.status(404).json({ error: 'غير موجود' });

    let staffList = [];
    for (const id of ADMIN_IDS) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member) {
            const highestRole = member.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).first();
            let badges = [];
            let sortWeight = highestRole ? highestRole.position : 0;

            if (id === '714571252584677397') { badges = ['Owner', 'Developer']; sortWeight = 99999; }
            else if (id === '230413951865847808') { badges = ['Owner']; sortWeight = 88888; }

            staffList.push({
                name: member.displayName,
                username: member.user.username,
                role: highestRole ? highestRole.name : 'Admin',
                rolePosition: sortWeight,
                badges,
                avatar: member.user.displayAvatarURL({ dynamic: true, size: 256 })
            });
        }
    }
    staffList.sort((a, b) => b.rolePosition - a.rolePosition);
    res.json(staffList);
});

app.listen(PORT, () => console.log(`🌐 السيرفر يعمل على البورت ${PORT} (http://localhost:3000)`));
client.login(BOT_TOKEN);