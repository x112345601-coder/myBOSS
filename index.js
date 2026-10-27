// 1. 強制 IPv4 優先 (防止 Render 網路黑洞)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// 2. 引入必要模組
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    InteractionType, 
    PermissionsBitField 
} = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');

console.log('⏳ 正在初始化系統與服務...');

// 3. 致命錯誤阻斷機制
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] 發生未捕獲的致命例外:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] 發生未處理的 Promise 拒絕:', reason);
    process.exit(1);
});

// 4. 初始化 Firebase Admin SDK
try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('缺少 FIREBASE_SERVICE_ACCOUNT 環境變數！');
    }
    
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('🔥 [FIREBASE] Firebase Admin SDK 成功初始化！');
    }
} catch (error) {
    console.error('❌ [FIREBASE_ERROR] Firebase 初始化失敗:', error.message);
    process.exit(1);
}

const db = admin.firestore();

// 5. 建立 Express 保活伺服器 (供 UptimeRobot Ping)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    console.log('🌐 [PING] 收到保活請求');
    res.status(200).send('Boss Bot Status: OK ⚔️');
});

app.listen(PORT, () => {
    console.log(`🌐 [EXPRESS] 保活伺服器已於 Port ${PORT} 啟動`);
});

// 6. 初始化 Discord 機器人 Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 認證打手身分組 ID (直接內建，Render 免設)
const VERIFIED_ROLE_ID = '1564554884949475380';

// 職業清單定義
const JOB_LIST = [
    { label: '英雄', emoji: '⚔️', color: '#E74C3C' },
    { label: '黑騎士', emoji: '🛡️', color: '#2C3E50' },
    { label: '聖騎士', emoji: '🔨', color: '#F1C40F' },
    { label: '主教', emoji: '✨', color: '#F39C12' },
    { label: '夜使者', emoji: '🌟', color: '#9B59B6' },
    { label: '暗影神偷', emoji: '🗡️', color: '#34495E' },
    { label: '箭神', emoji: '🏹', color: '#2ECC71' },
    { label: '神射手', emoji: '🎯', color: '#16A085' },
    { label: '拳霸', emoji: '🥊', color: '#E67E22' },
    { label: '槍神', emoji: '🔫', color: '#1ABC9C' }
];

// 7. 啟動時自動檢查並建立伺服器缺少的職業身分組
async function ensureRoles(guild) {
    console.log(`🔄 正在檢查伺服器【${guild.name}】身分組完整性...`);
    for (const job of JOB_LIST) {
        let role = guild.roles.cache.find(r => r.name === job.label);
        if (!role) {
            try {
                role = await guild.roles.create({
                    name: job.label,
                    color: job.color,
                    reason: 'Boss 機器人自動建立職業身分組'
                });
                console.log(`➕ [ROLE_CREATED] 已自動建立身分組: ${job.label}`);
            } catch (err) {
                console.error(`❌ 無法自動建立身分組 ${job.label}:`, err.message);
            }
        }
    }
}

client.once('clientReady', async () => {
    console.log(`✅ [DISCORD] Boss 團審核機器人已成功登入為: ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await ensureRoles(guild);
    }
});

// 8. 建立支援複選的職業選單
function createMultiRoleMenu() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_boss_jobs')
        .setPlaceholder('點擊選擇你的打王職業（可複選）...')
        .setMinValues(1)
        .setMaxValues(JOB_LIST.length)
        .addOptions(
            JOB_LIST.map(job => ({
                label: job.label,
                description: `選擇 ${job.label} 職業`,
                value: job.label,
                emoji: job.emoji
            }))
        );

    return new ActionRowBuilder().addComponents(selectMenu);
}

// 9. 允許管理員在驗證頻道打 !setup 發送常駐驗證面板
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!setup' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const row = createMultiRoleMenu();
        await message.channel.send({
            content: `⚔️ **Boss 團成員身分驗證**\n請點擊下方選單**勾選你的所有主力打王職業（可複選）**，接著輸入遊戲 ID 完成認證以解鎖頻道：`,
            components: [row]
        });
        await message.delete().catch(() => {});
        console.log(`📌 [SETUP] 管理員已在 #${message.channel.name} 建立常駐驗證面板`);
    }
});

// 10. 新成員加入時，自動抓取系統頻道或第一個可發言頻道發送選單
client.on('guildMemberAdd', async (member) => {
    console.log(`🔍 [EVENT] 新打手加入: ${member.user.tag}`);

    const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => 
        c.isTextBased() && c.permissionsFor(member.guild.members.me).has('SendMessages')
    );

    if (channel) {
        try {
            const row = createMultiRoleMenu();
            await channel.send({
                content: `👋 歡迎打手 <@${member.id}> 加入！\n請於下方選單**勾選你的打王職業（可複選）**並輸入遊戲 ID 以解鎖打王頻道：`,
                components: [row]
            });
            console.log(`✅ 已在 #${channel.name} 發送驗證選單`);
        } catch (error) {
            console.error(`❌ 無法發送訊息:`, error);
        }
    }
});

// 11. 處理選單選擇與 Modal 輸入
const tempSelectedJobs = new Map();

client.on('interactionCreate', async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_boss_jobs') {
        tempSelectedJobs.set(interaction.user.id, interaction.values);

        const modal = new ModalBuilder()
            .setCustomId('modal_boss_register')
            .setTitle('填寫遊戲角色名稱');

        const ingameIdInput = new TextInputBuilder()
            .setCustomId('boss_ingame_id')
            .setLabel("請輸入你的主要遊戲 ID (角色名稱):")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("例如：超帥狂戰士")
            .setRequired(true)
            .setMaxLength(16);

        modal.addComponents(new ActionRowBuilder().addComponents(ingameIdInput));
        await interaction.showModal(modal);
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_boss_register') {
        const ingameId = interaction.fields.getTextInputValue('boss_ingame_id');
        const member = interaction.member;
        const selectedJobs = tempSelectedJobs.get(member.id) || [];

        if (selectedJobs.length === 0) {
            return interaction.reply({ content: '❌ 選擇逾時或未選取職業，請重新在選單中選取！', ephemeral: true });
        }

        // 暱稱格式：[遊戲ID] 職業A/職業B
        const jobsDisplay = selectedJobs.join('/');
        let newNickname = `[${ingameId}] ${jobsDisplay}`;
        if (newNickname.length > 32) newNickname = newNickname.substring(0, 32);

        try {
            // A. 修改伺服器暱稱
            await member.setNickname(newNickname);
            console.log(`✅ [NICKNAME] 已更新暱稱: ${newNickname}`);

            // B. 批次賦予所有勾選的職業身分組 (依名稱配對)
            for (const jobName of selectedJobs) {
                const role = interaction.guild.roles.cache.find(r => r.name === jobName);
                if (role) {
                    await member.roles.add(role);
                    console.log(`✅ [ROLE] 已賦予職業身分組: ${jobName}`);
                }
            }

            // C. 賦予認證打手身分組 (使用內建 ID)
            const verifiedRole = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
            if (verifiedRole) {
                await member.roles.add(verifiedRole);
                console.log(`✅ [ROLE] 已賦予認證打手身分組`);
            }

            // D. 存入 Firebase
            await db.collection('boss_members').doc(member.id).set({
                discordTag: member.user.tag,
                ingameId: ingameId,
                jobs: selectedJobs,
                verifiedAt: new Date().toISOString()
            }, { merge: true });

            tempSelectedJobs.delete(member.id);

            await interaction.reply({
                content: `🎉 認證完成！你的暱稱已設定為 **${newNickname}**，並已為你發放對應職業身分組與認證打手權限！`,
                ephemeral: true
            });
        } catch (error) {
            console.error('❌ [VERIFY_ERROR] 設定失敗:', error);
            await interaction.reply({
                content: `❌ 設定失敗！請確認機器人身分組階層是否排在最上方，並擁有「管理暱稱」與「管理身分組」權限。`,
                ephemeral: true
            });
        }
    }
});

// 12. 登入
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ [CRITICAL] 缺少 DISCORD_TOKEN 環境變數！');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
