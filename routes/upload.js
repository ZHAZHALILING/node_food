var express = require('express');
var router = express.Router();
var multer = require('multer');
var path = require('path');
const Database = require('better-sqlite3');
var fs = require('fs');
router.get('/', function (req, res,) {
    res.json({ message: 'hello world1!' });
});
// 连接数据库
const db = new Database('./my_good_db.db');

// 配置上传目录
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名：时间戳 + 原文件后缀
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// 过滤文件类型（仅允许图片）
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('仅支持 JPG/PNG/GIF/WEBP 格式图片'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 限制 5MB
    fileFilter: fileFilter
});
const baseUrl = process.env.BASE_URL;
// 上传图片接口
router.post('/image', upload.single('file'), function (req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({ code: 400, msg: '请选择要上传的图片' });
        }
        // 返回可访问的图片URL（public目录已被托管）
        const imageUrl = `/uploads/${req.file.filename}`;
        const fullImageUrl = baseUrl + imageUrl;
        res.json({
            code: 200,
            msg: '上传成功',
            data: {
                imageUrl: fullImageUrl, // 直接返回带域名的完整路径
                relativeUrl: imageUrl  // 可选，保留相对路径
            }
        });
    } catch (err) {
        res.status(500).json({ code: 500, msg: err.message });
    }
});

// 2. 新增头像上传接口（专门更新 wechat_user 表的 avatar）
router.post('/avatar', upload.single('avatar'), (req, res) => {
    try {
        const { openid } = req.body;
        if (!openid || !req.file) {
            return res.status(400).json({ code: 400, msg: '缺少 openid 或头像文件' });
        }

        // 生成可访问的头像 URL（和商品图片路径一致）
        const avatarUrl = `/uploads/${req.file.filename}`;
        const fullImageUrl = baseUrl + avatarUrl;
        // 更新 wechat_user 表的 avatar 字段
        const stmt = db.prepare(`
      UPDATE wechat_user 
      SET avatar = ?, update_time = CURRENT_TIMESTAMP 
      WHERE openid = ?
    `);
        stmt.run(avatarUrl, openid);

        res.json({
            code: 200,
            msg: '头像上传成功',
            data: { avatar: avatarUrl, avatarImage: fullImageUrl }
        });
    } catch (err) {
        res.status(500).json({ code: 500, msg: '上传失败', error: err.message });
    }
});



module.exports = router;