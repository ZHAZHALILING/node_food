// 菜品库管理
var express = require('express');
var router = express.Router();
// 先引入 auth 中间件
const auth = require('../../middleware/auth');
// 引入 better-sqlite3
const Database = require('better-sqlite3');
// 连接你的数据库文件（路径：项目根目录的 my_good_db.db）
const db = new Database('./my_good_db.db');
const baseUrl = process.env.BASE_URL;

// 2. 初始化菜品表（如果还没建）
const initDishTable = () => {
  // 创建 dishes 表 提交菜品（如果不存在）
  db.exec(`
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
initDishTable();

//  提交菜品接口
router.post('/submit', auth,(req, res) => {
  const { name, imageUrl, description } = req.body;
  // 校验参数
  if (!name) {
    return res.status(400).json({ code: 400, msg: '菜品名称不能为空' });
  }
  try {
    // 插入数据库
    const stmt = db.prepare('INSERT INTO dishes (name, image_url, description) VALUES (?, ?, ?)');
    const info = stmt.run(name, imageUrl, description);
    // 返回登录结果
    res.json({
      code: 200,
      message: '提交成功',
      data: {
        id: info.lastInsertRowid,
        name,
        imageUrl,
        description
      }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '请求失败',
      error: err.message
    });
  }
});


/* 新增：查询所有菜品数据的接口 */
router.get('/list', function (req, res) {
  try {
    // 预编译 SQL，查询 dishes 表所有数据
    const query = db.prepare('SELECT * FROM dishes');
    const data = query.all(); // all() 拿到所有行

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
      message: '查询失败',
      error: err.message
    });
  }
});

module.exports = router;
