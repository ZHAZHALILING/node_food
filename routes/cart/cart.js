// 每日点菜购物车
var express = require('express');
var router = express.Router();
// 先引入 auth 中间件
const auth = require('../../middleware/auth');
// 引入 better-sqlite3
// const Database = require('better-sqlite3');
const sqlite3 = require('sqlite3').verbose();
// 连接你的数据库文件（路径：项目根目录的 my_good_db.db）
const db = new sqlite3.Database('/tmp/my_good_db.db');
// 2. 初始化购物车表（如果还没建）
const initCartTable = () => {
  db.exec(`
  CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dish_id INTEGER NOT NULL,
    create_date DATE NOT NULL, -- 存储 YYYY-MM-DD，用于按天去重
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, dish_id, create_date), -- 同一用户同一菜品同一天只能有一条
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES wechat_user(id) ON DELETE CASCADE
  );
`);
};
initCartTable();
/* 添加购物车接口 */
router.post('/addCart', auth,function (req, res) {
  try {
    const user_id = req.user.id;
    const { dish_id } = req.body;
    // 校验必填参数
    if (!dish_id) {
      return res.status(400).json({
        code: 400,
        message: '菜品ID不能为空'
      });
    }
    // 1. 先查询当天是否已经添加过
    const today = new Date().toISOString().split('T')[0]; // 获取 YYYY-MM-DD
    // 1. 先查询当天是否已经添加过
    const existStmt = db.prepare(`
      SELECT id FROM cart
      WHERE user_id = ? AND dish_id = ? AND create_date = ?
    `);
    const exist = existStmt.get(user_id, dish_id, today);
    if (exist) {
      return res.status(400).json({
        code: 400,
        message: '该餐饮当天已添加过购物车，无法重复添加'
      });
    }
    // 2. 不存在则插入新记录
    const stmt = db.prepare(`
      INSERT INTO cart (user_id, dish_id, create_date, update_time)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const info = stmt.run(user_id, dish_id, today);

    res.json({
      code: 200,
      message: '添加购物车成功',
      data: { cart_id: info.lastInsertRowid }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '添加购物车失败',
      error: err.message
    });
  }
});

/* 查询已加入购物车接口 */
router.get('/cartList', auth, function (req, res) {
  try {
    // const { user_id } = req.query;
    const user_id = req.user.id;
    if (!user_id) {
      return res.status(400).json({ code: 400, message: 'user_id 不能为空' });
    }

    // 联表查询：购物车表 cart JOIN 菜品表 dishes
    const query = db.prepare(`
      SELECT 
        c.*,                -- 购物车所有字段
        d.name AS dish_name, -- 菜品名称
        d.image_url,        -- 菜品图片
        d.description       -- 菜品描述
      FROM cart c
      LEFT JOIN dishes d 
        ON c.dish_id = d.id  -- 核心关联条件：cart.dish_id = dishes.id
      WHERE c.user_id = ?
      ORDER BY c.update_time DESC
    `);
    const data = query.all(user_id);
    // ✅ 核心：获取列表总长度（cartList.length）
    const total = data.length;
    res.json({
      code: 200,
      message: '查询购物车成功',
      data: {
        total: total,       // 购物车总数量（总长度）
        list: data      // 购物车列表数据
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询失败', error: err.message });
  }
});

/* 删除购物车商品接口 */
router.delete('/cartRemove', auth, function (req, res) {
  try {
    const { cart_id } = req.body;
    const user_id = req.user.id;
    // 校验必填参数
    if (!user_id || !cart_id) {
      return res.status(400).json({
        code: 400,
        message: 'user_id 和 cart_id 不能为空'
      });
    }

    // 执行删除（只删除当前用户的购物车项，保证安全）
    const stmt = db.prepare(`
      DELETE FROM cart 
      WHERE user_id = ? AND id = ?
    `);
    const result = stmt.run(user_id, cart_id);

    if (result.changes === 0) {
      return res.status(404).json({
        code: 404,
        message: '该购物车商品不存在或已删除'
      });
    }

    res.json({
      code: 200,
      message: '删除购物车商品成功'
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '删除购物车商品失败',
      error: err.message
    });
  }
});

/* 清空当前用户购物车接口 */
router.delete('/cartClear', auth,function (req, res) {
  try {
    const user_id = req.user.id;
    if (!user_id) {
      return res.status(400).json({
        code: 400,
        message: 'user_id 不能为空'
      });
    }

    const stmt = db.prepare(`
      DELETE FROM cart WHERE user_id = ?
    `);
    const result = stmt.run(user_id);

    res.json({
      code: 200,
      message: '清空购物车成功',
      data: { deleted_count: result.changes }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '清空购物车失败',
      error: err.message
    });
  }
});
// 2. 初始化购物车提交表（如果还没建）
const initCartSubmitTable = () => {
  // db.exec(`
  //   DROP TABLE IF EXISTS cart_submit_item;
  // `);
  // 然后再执行你原来的 CREATE TABLE 语句
  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_submit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    submit_date TEXT DEFAULT (date('now')),
    status TEXT DEFAULT 'pending',
    remark TEXT
  );
`);


  // 创建提交明细表里（关联具体菜品）
  db.exec(`
  CREATE TABLE IF NOT EXISTS cart_submit_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submit_id INTEGER NOT NULL,      -- 关联 cart_submit 的 id
    dish_id INTEGER NOT NULL,        -- 菜品ID
    image_url TEXT,
    description TEXT,
    dish_name TEXT ,         -- 菜品名称（冗余存储，避免菜品删除后丢失）
    FOREIGN KEY (submit_id) REFERENCES cart_submit(id) ON DELETE CASCADE
  );
`);
};
initCartSubmitTable();
/**
 * 提交购物车到管家端接口
 * 参数：user_id（必传）、cart_ids（可选，指定提交的购物车ID列表，不传则提交全部）
 */
router.post('/cartSubmit', auth,function (req, res) {
  try {
    const user_id = req.user.id;
    const { cart_ids = [], remark = '' } = req.body;

    // 1. 校验必填参数
    if (!user_id) {
      return res.status(400).json({
        code: 400,
        message: 'user_id 不能为空'
      });
    }

    // 2. 查询要提交的购物车数据
    let cartQuery = `
      SELECT c.*, d.name AS dish_name 
      FROM cart c
      LEFT JOIN dishes d ON c.dish_id = d.id
      WHERE c.user_id = ?
    `;
    let queryParams = [user_id];

    // 如果传了 cart_ids，只提交指定的购物车项
    if (cart_ids.length > 0) {
      cartQuery += ` AND c.id IN (${cart_ids.map(() => '?').join(',')})`;
      queryParams = queryParams.concat(cart_ids);
    }

    // 1. 查询当前用户购物车（关联 dishes 表获取图片和描述）
    const cartList = db.prepare(`
    SELECT c.*, d.name as dish_name, d.image_url, d.description
    FROM cart c
    JOIN dishes d ON c.dish_id = d.id
    WHERE c.user_id = ?
  `).all(user_id);
    if (cartList.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '暂无可提交的购物车商品'
      });
    }

    let submitResult;

    // 3. 开启事务，保证数据一致性
    db.transaction(() => {
      // 3.1 插入提交主记录（去掉 total_quantity 字段）
      const submitStmt = db.prepare(`
        INSERT INTO cart_submit (user_id, remark)
        VALUES (?, ?)
      `);
      submitResult = submitStmt.run(user_id, remark);
      const submitId = submitResult.lastInsertRowid;

      // 3.2 插入提交明细
      const itemStmt = db.prepare(`
        INSERT INTO cart_submit_item (submit_id, dish_id, dish_name,image_url, description)
        VALUES (?, ?, ?,?,?)
      `);
      cartList.forEach(item => {
        itemStmt.run(submitId, item.dish_id, item.dish_name, item.image_url, item.description );
      });

      // 可选：提交后清空购物车（根据需求决定是否保留）
      const clearCartStmt = db.prepare(`DELETE FROM cart WHERE user_id = ? ${cart_ids.length > 0 ? 'AND id IN (' + cart_ids.map(() => '?').join(',') + ')' : ''}`);
      clearCartStmt.run(...queryParams);
    })();

    // 4. 返回提交结果
    res.json({
      code: 200,
      message: '提交购物车到管家端成功',
      data: {
        submit_id: submitResult.lastInsertRowid, // 提交记录ID
        submit_time: new Date().toISOString(),    // 提交时间
        submit_date: new Date().toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\//g, '-'),    // 提交日期
        remark: remark,                           // 用户备注
        submit_count: cartList.length             // 提交的商品项数（可选，给前端展示用）
      }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '提交购物车到管家端失败',
      error: err.message
    });
  }
});


/**
 * 管家端查询待处理的购物车提交记录
 * 参数：status（可选，筛选状态，默认 pending）
 */
router.get('/cartSubmitList', function (req, res) {
  try {
    // 1. 查询提交主记录（关联用户信息，可选）
    const submitList = db.prepare(`
      SELECT cs.*, wu.openid 
      FROM cart_submit cs
      LEFT JOIN wechat_user wu ON cs.user_id = wu.id
      ORDER BY cs.submit_time DESC
    `).all();

    // // 2. 补充每条提交记录的菜品明细
    const result = submitList.flatMap(submit => {
      const items = db.prepare(`
    SELECT * FROM cart_submit_item WHERE submit_id = ?
  `).all(submit.id);

      // 把每个 item 都和 submit 信息合并，返回一维数组
      return items.map(item => ({
        ...submit,       // 提交记录的信息
        ...item,         // 菜品明细的信息
        submit_id: submit.id // 明确保留 submit_id 方便区分
      }));
    });

    res.json({
      code: 200,
      message: '查询待处理提交记录成功',
      data: {
        total: result.length,
        list: result
      }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '查询提交记录失败',
      error: err.message
    });
  }
});


// 管理端重置购物车接口
router.post('/resetCart', (req, res) => {
  try {
    // 默认重置今天，也可以由前端传 date 参数指定日期
    const date = req.body.date || new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`DELETE FROM cart WHERE create_date = ?`);
    const info = stmt.run(date);

    res.json({
      code: 200,
      message: `重置成功，删除了 ${info.changes} 条购物车记录`,
      data: { deletedCount: info.changes }
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '重置购物车失败',
      error: err.message
    });
  }
});

/**
 * 查询购物车提交历史（按每次提交为维度）
 * 接口地址：GET /api/cart/getSubmitHistory
 * 必须传 token
 */
router.get('/getSubmitHistory', auth, (req, res) => {
  try {
    const user_id = req.user.id;

    // 1. 查询【提交主记录】（一次提交一条）
    const submitList = db.prepare(`
      SELECT 
        id AS submit_id,
        remark,
        submit_time
      FROM cart_submit
      WHERE user_id = ?
      ORDER BY submit_time DESC
    `).all(user_id);

    // 2. 给每一次提交，查询对应的【菜品明细】
    for (let submit of submitList) {
      const items = db.prepare(`
        SELECT 
          dish_id,
          dish_name,
          image_url,
          description
        FROM cart_submit_item
        WHERE submit_id = ?
      `).all(submit.submit_id);

      // 把明细塞进当前提交记录
      submit.items = items;
      // 本次提交的菜品数量
      submit.totalCount = items.length;
    }

    // 返回结果
    res.json({
      code: 200,
      message: '查询成功',
      data: submitList
    });

  } catch (err) {
    console.error('查询提交历史失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询提交历史失败',
      error: err.message
    });
  }
});


module.exports = router;
