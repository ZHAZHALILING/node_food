// 用户信息与身份管理
var express = require('express');
var router = express.Router();
const axios = require('axios'); // 用于调用微信接口
const crypto = require('crypto'); // 生成token
const jwt = require('jsonwebtoken');

const SQL = require('sql.js');
// 创建内存数据库（sql.js 使用内存数据库）
const db = new SQL.Database();

// 初始化数据库表
const initDatabase = () => {
    db.run(`
        CREATE TABLE IF NOT EXISTS wechat_user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            openid TEXT UNIQUE NOT NULL,
            nickname TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            identity_type TEXT NOT NULL,
            token TEXT DEFAULT '',
            expire_time DATETIME,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
};

initDatabase();
const baseUrl = process.env.BASE_URL;
// 建议把密钥放到 .env 环境变量里，比如 JWT_SECRET=your_secret_key
const JWT_SECRET = process.env.JWT_SECRET;
// 1. 生成随机token
const generateToken = (openid) => {
    // 1. 生成 JWT，直接设置 30 天过期
    const token = jwt.sign(
        { openid }, //  payload 里存 openid
        JWT_SECRET,
        { expiresIn: '30d' } // 30天过期，支持 'd' 天、'h' 小时等单位
    );
    // 2. 计算 30 天后的过期时间（和你原来的逻辑一致，用于数据库存储）
    const expireTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { token, expireTime };
};

// 3. 微信登录接口
router.post('/wechatLogin', async (req, res) => {
    try {
        const { code, identityType } = req.body;
        // 校验参数
        if (!code) {
            return res.status(400).json({
                code: 400,
                message: '缺少code'
            });
        }
        if (!identityType) {
            return res.status(400).json({
                code: 400,
                message: '缺少身份类型'
            });
        }
        if (!['butler', 'housekeeper'].includes(identityType)) {
            return res.status(400).json({
                code: 400,
                message: '身份类型不合法'
            });
        }

        // 调用微信接口获取openid（替换成你的小程序appid和secret）
        const appid = process.env.WX_APPID;
        const secret = process.env.WX_SECRET;
        const wxRes = await axios.get(
            `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
        );

        const { openid } = wxRes.data;
        if (!openid) {
            return res.status(500).json({
                code: 500,
                message: '微信授权失败'
            });
        }
        // 生成带有效期的Token
        const { token, expireTime } = generateToken(openid);
        
        // 发送响应
        const sendResponse = (user) => {
            res.json({
                code: 200,
                message: '登录成功',
                data: {
                    token,
                    openid,
                    identityType: user.identity_type,
                    expireTime: expireTime, // 前端可显示过期时间
                    userInfo: {
                        id: user.id,
                        user_id: user.id,
                        name: user.nickname,
                        avatar: user.avatar ? baseUrl + user.avatar : '', // 拼接完整URL
                    }
                }
            });
        };
        
        // 查询用户是否存在
        try {
            const findUser = db.get('SELECT * FROM wechat_user WHERE openid = ?', [openid]);
            
            if (findUser) {
                // 更新身份类型
                db.run(`
                    UPDATE wechat_user 
                    SET identity_type = ?, token = ?, expire_time = ?, update_time = CURRENT_TIMESTAMP 
                    WHERE openid = ?
                `, [identityType, token, expireTime.toISOString(), openid]);
                
                const user = { ...findUser, identity_type: identityType, token, expire_time: expireTime };
                sendResponse(user);
            } else {
                // 新增用户：存储Token + 过期时间
                const result = db.run(`
                    INSERT INTO wechat_user (openid, identity_type, token, expire_time) 
                    VALUES (?, ?, ?, ?)
                `, [openid, identityType, token, expireTime.toISOString()]);
                
                const user = {
                    id: result.lastID,
                    openid,
                    identity_type: identityType,
                    token,
                    expire_time: expireTime,
                    nickname: '',
                    avatar: ''
                };
                sendResponse(user);
            }
        } catch (err) {
            return res.status(500).json({
                code: 500,
                message: '数据库操作失败',
                error: err.message
            });
        }
    } catch (err) {
        res.status(500).json({
            code: 500,
            message: '登录失败',
            error: err.message
        });
    }
});

// 校验Token是否失效接口（无需鉴权，直接传token查询）
router.get('/checkToken', (req, res) => {
    try {
        const token = req.query.token || req.headers.token;
        if (!token) {
            return res.status(400).json({
                code: 400,
                message: '请传入Token'
            });
        }
        // 1. 查询Token是否存在 + 未过期
        try {
            const findUser = db.get(`
                SELECT id, openid, identity_type FROM wechat_user 
                WHERE token = ? AND expire_time > datetime('now')
            `, [token]);
            
            if (findUser) {
                // Token有效
                res.json({
                    code: 200,
                    message: 'Token有效',
                    data: {
                        isValid: true,
                        identityType: findUser.identity_type,
                        openid: findUser.openid
                    }
                });
            } else {
                // Token失效/不存在
                res.json({
                    code: 401,
                    message: 'Token已失效/不存在',
                    data: {
                        isValid: false
                    }
                });
            }
        } catch (err) {
            return res.status(500).json({
                code: 500,
                message: '查询Token失败',
                error: err.message,
                data: {
                    isValid: false
                }
            });
        }
    } catch (err) {
        res.status(500).json({
            code: 500,
            message: '校验Token失败',
            error: err.message,
            data: {
                isValid: false
            }
        });
    }
});

// 退出登录接口
router.post('/logout', (req, res) => {
    try {
        // 从请求头或请求体获取 token
        const token = req.headers.authorization?.split(' ')[1] || req.body.token || req.query.token;
        if (!token) {
            return res.status(400).json({
                code: 400,
                message: '请传入Token'
            });
        }
        
        // 查询用户并验证 token
        try {
            const findUser = db.get(`
                SELECT id, openid FROM wechat_user 
                WHERE token = ? AND expire_time > datetime('now')
            `, [token]);
            
            if (!findUser) {
                return res.status(401).json({
                    code: 401,
                    message: 'Token无效或已过期'
                });
            }
            
            // 将 token 置空，使其失效
            db.run(`
                UPDATE wechat_user 
                SET token = '', expire_time = datetime('now'), update_time = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [findUser.id]);
            
            res.json({
                code: 200,
                message: '退出登录成功'
            });
        } catch (err) {
            return res.status(500).json({
                code: 500,
                message: '数据库操作失败',
                error: err.message
            });
        }
    } catch (err) {
        res.status(500).json({
            code: 500,
            message: '退出登录失败',
            error: err.message
        });
    }
});

module.exports = router;
