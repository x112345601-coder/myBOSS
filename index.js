// ==========================================
// 1. 強制 IPv4 優先 (防止 Render IPv6 網路黑洞導致 Ghost Hang)
// ==========================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// ==========================================
// 2. 引入必要模組 (Node.js + Discord.js v14 + Express + Firebase)
// ==========================================
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    InteractionType, 
    PermissionsBitField,
    Events
} = require('discord.js');
const express = require('express');
const admin = require('firebase-admin');

console.log('⏳ [INIT] 正在初始化系統與服務...');

// ==========================================
// 3. 致命錯誤阻斷機制 (Foolproof & Crash Fast)
// ==========================================
process.on('uncaughtException', (error) => {
    console.error('❌ [CRITICAL] 發生未捕獲的致命例外:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] 發生未處理的 Promise 拒絕:', reason);
    process.exit(1);
});

// ==========================================
// 4. 初始化 Firebase Admin SDK (單一變數 + 防重複初始化)
// ==========================================
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

// ==========================================
// 5. 建立 Express 保活伺服器 (供 UptimeRobot 5 分鐘定時 Ping)
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    console.log('🌐 [PING] 收到 UptimeRobot 保活請求');
    res.status(200).send('Boss Bot Status: OK 🚀');
});

app.listen(PORT, () => {
    console
