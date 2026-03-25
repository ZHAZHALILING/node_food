// 菜品库管理
var express = require('express');
var router = express.Router();
// 先引入 auth 中间件
const auth = require('../../middleware/auth');
const SQL = require('sql.js');
// 创建内存数据库（sql.js 使用内存数据库）
const db = new SQL.Database();

// 初始化数据库表
const initDatabase = () => {
    db.run(`
        CREATE TABLE IF NOT EXISTS dishes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            image_url TEXT,
            description TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
};

initDatabase();
const baseUrl = process.env.BASE_URL;



//  提交菜品接口
router.post('/submit', auth,(req, res) => {
  const { name, imageUrl, description } = req.body;
  // 校验参数
  if (!name) {
    return res.status(400).json({ code: 400, msg: '菜品名称不能为空' });
  }
  try {
    // 插入数据库
    const result = db.run('INSERT INTO dishes (name, image_url, description) VALUES (?, ?, ?)', [name, imageUrl, description]);
    
    // 返回结果
    res.json({
      code: 200,
      message: '提交成功',
      data: {
        id: result.lastID,
        name,
        imageUrl,
        description
      }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '插入数据库失败',
      error: err.message
    });
  }
});


/* 新增：查询所有菜品数据的接口 */
router.get('/list', function (req, res) {
  try {
    // 查询 dishes 表所有数据，按创建时间倒序排序
    const data = db.all('SELECT * FROM dishes ORDER BY create_time DESC');

    // 返回 JSON 格式数据
    res.json({
      code: 200,
      message: '查询成功',
      data: data
    });
  } catch (err) {
    // 错误处理
    res.status(500).json({
      code: 500,
      message: '查询数据库失败',
      error: err.message
    });
  }
});

module.exports = router;
