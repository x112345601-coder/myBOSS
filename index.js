// 1. 強制 IPv4 優先 (防止 Render 網路黑洞/Ghost Hang)
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
    InteractionType
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
        GatewayIntentBits.GuildMembers
    ]
});

client.once('clientReady', () => {
    console.log(`✅ [DISCORD] Boss 團審核機器人已登入: ${client.user.tag}`);
});

// 7. 產生支援「複選」的職業選單 (可選 1 ~ 5 個職業)
function createMultiRoleMenu() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_boss_jobs')
        .setPlaceholder('點擊選擇你的打王職業（可複選）...')
        .setMinValues(1) // 至少選 1 個
        .setMaxValues(5) // 最多可複選 5 個職業
        .addOptions([
            {
                label: '英雄',
                description: '包含英雄職業角色',
                value: '英雄',
                emoji: '⚔️'
            },
            {
                label: '黑騎士',
                description: '包含黑騎士職業角色',
                value: '黑騎',
                emoji: '🛡️'
            },
            {
                label: '聖騎士',
                description: '包含聖騎士職業角色',
                value: '聖騎',
                emoji: '🔨'
            },
            {
                label: '主教',
                description: '包含主教職業角色',
                value: '主教',
                emoji: '✨'
            },
            {
                label: '夜使者',
                description: '包含夜使者/標賊角色',
                value: '夜使',
                emoji: '🌟'
            },
            {
                label: '暗影神偷',
                description: '包含刀賊職業角色',
                value: '刀賊',
                emoji: '🗡️'
            },
            {
                label: '箭神',
                description: '包含箭神職業角色',
                value: '箭神',
                emoji: '🏹'
            },
            {
                label: '神射手',
                description: '包含神射手職業角色',
                value: '神射',
                emoji: '🎯'
            },
            {
                label: '拳霸',
                description: '包含拳霸職業角色',
                value: '拳霸',
                emoji: '🥊'
            },
            {
                label: '槍神',
                description: '包含槍神職業角色',
                value: '槍神',
                emoji: '🔫'
            }
        ]);

    return new ActionRowBuilder().addComponents(selectMenu);
}

// 8. 職業名稱與身分組 ID 的對照映射表
function getRoleIdByJob(jobName) {
    const roleMapping = {
        '英雄': process.env.ROLE_HERO,
        '黑騎': process.env.ROLE_DK,
        '聖騎': process.env.ROLE_PALADIN,
        '主教': process.env.ROLE_BISHOP,
        '夜使': process.env.ROLE_NL,
        '刀賊': process.env.ROLE_SHADOWER,
        '箭神': process.env.ROLE_BOWMASTER,
        '神射': process.env.ROLE_MARKSMAN,
        '拳霸': process.env.ROLE_BUCCANEER,
        '槍神': process.env.ROLE_CORSAIR
    };
    return roleMapping[jobName];
}

// 9. 新成員加入時，在驗證頻道發送驗證卡片
client.on('guildMemberAdd', async (member) => {
    console.log(`🔍 [EVENT] 偵測到新打手加入: ${member.user.tag}`);

    const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => 
        c.isTextBased() && c.permissionsFor(member.guild.members.me).has('SendMessages')
    );

    if (channel) {
        try {
            const row = createMultiRoleMenu();
            await channel.send({
                content: `⚔️ 歡迎打手 <@${member.id}> 加入 Boss 攻略組！\n請先於下方**勾選你的所有主力打王職業（可複選）**，接著輸入遊戲 ID 完成認證以解鎖頻道：`,
                components: [row]
            });
            console.log(`✅ [SUCCESS] 已發送認證選單給: ${member.user.tag}`);
        } catch (error) {
            console.error(`❌ [ERROR] 無法發送訊息:`, error);
        }
    }
});

// 10. 處理選單選擇與 Modal 提交
// 暫存使用者選好的職業（Key: userId, Value: jobsArray）
const tempSelectedJobs = new Map();

client.on('interactionCreate', async (interaction) => {
    // 步驟 A：玩家勾選完 1~多個職業後，暫存選擇並彈出遊戲 ID 輸入框
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_boss_jobs') {
        const selectedJobs = interaction.values; // 為一個陣列，例如 ['拳霸', '刀賊']
        tempSelectedJobs.set(interaction.user.id, selectedJobs);

        const modal = new ModalBuilder()
            .setCustomId('modal_boss_register')
            .setTitle('填寫打手認證資訊');

        const ingameIdInput = new TextInputBuilder()
            .setCustomId('boss_ingame_id')
            .setLabel("請輸入你的主要遊戲 ID (角色名稱):")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("例如：超帥狂戰士")
            .setRequired(true)
            .setMaxLength(16);

        const row = new ActionRowBuilder().addComponents(ingameIdInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    }

    // 步驟 B：玩家填寫 ID 提交表單
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_boss_register') {
        const ingameId = interaction.fields.getTextInputValue('boss_ingame_id');
        const member = interaction.member;
        const selectedJobs = tempSelectedJobs.get(member.id) || [];

        if (selectedJobs.length === 0) {
            return interaction.reply({ content: '❌ 選擇逾時或未選取職業，請重新在選單中選取！', ephemeral: true });
        }

        // 組合暱稱：例如 [克里斯] 拳霸/刀賊
        const jobsDisplay = selectedJobs.join('/');
        let newNickname = `[${ingameId}] ${jobsDisplay}`;

        // Discord 暱稱最長限制 32 字元，避免超出
        if (newNickname.length > 32) {
            newNickname = newNickname.substring(0, 32);
        }

        try {
            // 1. 自動修改伺服器暱稱
            await member.setNickname(newNickname);
            console.log(`✅ [NICKNAME] 已更新暱稱為: ${newNickname}`);

            // 2. 批次賦予所有勾選的職業身分組
            for (const job of selectedJobs) {
                const roleId = getRoleIdByJob(job);
                if (roleId && interaction.guild.roles.cache.has(roleId)) {
                    await member.roles.add(roleId);
                    console.log(`✅ [ROLE] 已賦予職業身分組: ${job}`);
                }
            }

            // 3. 賦予解鎖頻道的「已認證打手」通用身分組
            if (process.env.ROLE_VERIFIED && interaction.guild.roles.cache.has(process.env.ROLE_VERIFIED)) {
                await member.roles.add(process.env.ROLE_VERIFIED);
                console.log(`✅ [ROLE] 已賦予解鎖身分組: ROLE_VERIFIED`);
            }

            // 4. 寫入 Firebase 資料庫存檔
            await db.collection('boss_members').doc(member.id).set({
                discordTag: member.user.tag,
                ingameId: ingameId,
                jobs: selectedJobs,
                verifiedAt: new Date().toISOString()
            }, { merge: true });

            // 清理快取
            tempSelectedJobs.delete(member.id);

            await interaction.reply({
                content: `🎉 認證完成！你的暱稱已設定為 **${newNickname}**，並已為你解鎖所有打王頻道！`,
                ephemeral: true
            });

        } catch (error) {
            console.error('❌ [VERIFY_ERROR] 認證過程發生錯誤:', error);
            await interaction.reply({
                content: `❌ 認證失敗！請確認機器人身分組階層是否高於所有玩家身分組，並擁有管理暱稱與身分組權限。`,
                ephemeral: true
            });
        }
    }
});

// 11. 登入
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ [CRITICAL] 缺少 DISCORD_TOKEN 環境變數！');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
