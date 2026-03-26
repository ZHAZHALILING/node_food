// 用户信息与身份管理
var express = require('express');
var router = express.Router();
const axios = require('axios'); // 用于调用微信接口
const crypto = require('crypto'); // 生成token
const jwt = require('jsonwebtoken');

const sqlite3 = require('sqlite3').verbose();

// 连接你的数据库文件（路径：项目根目录的 my_good_db.db）
const db = new sqlite3.Database('/tmp/my_good_db.db');
const baseUrl = process.env.BASE_URL;
// 建议把密钥放到 .env 环境变量里，比如 JWT_SECRET=your_secret_key
const JWT_SECRET = process.env.JWT_SECRET;

router.get('/', function (req, res) {
    res.json({ message: 'Express111222222' });
});

module.exports = router;
