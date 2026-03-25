// middleware/auth.js
const jwt = require('jsonwebtoken');
// 引入 better-sqlite3
// const Database = require('better-sqlite3');
const sqlite3 = require('sqlite3').verbose();
// 连接你的数据库文件（路径：项目根目录的 my_good_db.db）
const db = new sqlite3.Database('/tmp/my_good_db.db');
module.exports = (req, res, next) => {
    try {
        // 适合 sqlite3

        // 1. 获取 token
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ code: 401, message: '请先登录' });
        }

        // 2. 校验 token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const openid = decoded.openid;

        // 3. sqlite3 异步查询（重点！！！）
        const sql = 'SELECT * FROM wechat_user WHERE openid = ? AND token = ?';
        db.get(sql, [openid, token], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ code: 401, message: 'token无效或已过期' });
            }

            // 4. 挂载用户信息 → 这里才能拿到！
            req.user = user;
            console.log('查询参数 user1:', user);
            next();
        });
    } catch (err) {
        return res.status(401).json({ code: 401, message: 'token验证失败' });
    }
};