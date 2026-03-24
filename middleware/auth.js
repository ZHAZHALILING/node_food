// middleware/auth.js
const jwt = require('jsonwebtoken');
// 引入 better-sqlite3
const Database = require('better-sqlite3');
// 连接你的数据库文件（路径：项目根目录的 my_good_db.db）
const db = new Database('./my_good_db.db');
module.exports = (req, res, next) => {
    // 从请求头获取 token
    const token = req.headers.authorization
        ? req.headers.authorization.split(' ')[1]
        : undefined;
    if (!token) {
        return res.status(401).json({ code: 401, message: '未提供token' });
    }

    try {
        // 1. 先验证 token 本身是否有效
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const openid = decoded.openid;
        // console.log('decoded payload:', decoded); // 打印完整 payload 确认字段
        // console.log('openid:', openid);
        // console.log('查询参数 openid:', openid);
        // console.log('查询参数 token:', token);
       
        // 2. 再查数据库，确认 token 未过期且与当前用户一致
        const user = db.prepare('SELECT * FROM wechat_user WHERE openid = ? AND token = ?').get(openid, token);
        // console.log('查询参数 user:', user);

        if (!user) {
            return res.status(401).json({ code: 401, message: 'token无效或已注销' });
        }
        if (new Date(user.expire_time) < new Date()) {
            return res.status(401).json({ code: 401, message: 'token已过期，请重新登录' });
        }
        // 将用户信息挂载到 req 上，供后续接口使用
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ code: 401, message: 'token验证失败' });
    }
};