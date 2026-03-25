// 每日点菜购物车
var express = require('express');
var router = express.Router();
// 先引入 auth 中间件
const auth = require('../../middleware/auth');

const SQL = require('sql.js');
// 创建内存数据库（sql.js 使用内存数据库）
const db = new SQL.Database();

// 初始化数据库表
const initDatabase = () => {
    // 创建购物车表
    db.run(`
        CREATE TABLE IF NOT EXISTS cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            dish_id INTEGER NOT NULL,
            create_date DATE NOT NULL,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, dish_id, create_date)
        )
    `);
    
    // 创建购物车提交表
    db.run(`
        CREATE TABLE IF NOT EXISTS cart_submit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            submit_date TEXT DEFAULT (date('now')),
            status TEXT DEFAULT 'pending',
            remark TEXT
        )
    `);
    
    // 创建购物车提交明细表
    db.run(`
        CREATE TABLE IF NOT EXISTS cart_submit_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submit_id INTEGER NOT NULL,
            dish_id INTEGER NOT NULL,
            image_url TEXT,
            description TEXT,
            dish_name TEXT
        )
    `);
};

initDatabase();

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
    
    // 查询是否已存在
    try {
      const exist = db.get(`
        SELECT id FROM cart
        WHERE user_id = ? AND dish_id = ? AND create_date = ?
      `, [user_id, dish_id, today]);
      
      if (exist) {
        return res.status(400).json({
          code: 400,
          message: '该餐饮当天已添加过购物车，无法重复添加'
        });
      }
      
      // 2. 不存在则插入新记录
      const result = db.run(`
        INSERT INTO cart (user_id, dish_id, create_date, update_time)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, [user_id, dish_id, today]);
      
      res.json({
        code: 200,
        message: '添加购物车成功',
        data: { cart_id: result.lastID }
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
    console.log('查询购物车接口 user_id:', user_id);
    if (!user_id) {
      return res.status(400).json({ code: 400, message: 'user_id 不能为空' });
    }

    // 联表查询：购物车表 cart JOIN 菜品表 dishes
    try {
      const data = db.all(`
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
      `, [user_id]);
      
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
      return res.status(500).json({ 
        code: 500, 
        message: '查询购物车失败', 
        error: err.message 
      });
    }
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询失败', error: err.message });
  }
});

/* 删除购物车商品接口 */
router.delete('/cartRemove', auth, function (req, res) {
  try {
    // 调试信息：打印完整的请求对象
    console.log('删除购物车接口 请求信息:', {
      query: req.query,
      body: req.body,
      params: req.params,
      headers: req.headers
    });
    
    // 支持多种参数获取方式：查询参数、请求体、路由参数
    const cart_id = req.query.cart_id || req.body.cart_id || req.params.cart_id;
    // console.log('删除购物车接口 cart_id:', cart_id);
    const user_id = req.user.id;
    // 校验必填参数
    if (!cart_id) {
      return res.status(400).json({
        code: 400,
        message: 'cart_id 不能为空',
        debug: {
          received_query: req.query,
          received_body: req.body,
          received_params: req.params
        }
      });
    }

    // 执行删除（只删除当前用户的购物车项，保证安全）
    try {
      const result = db.run(`
        DELETE FROM cart 
        WHERE user_id = ? AND id = ?
      `, [user_id, cart_id]);

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
      return res.status(500).json({
        code: 500,
        message: '删除购物车商品失败',
        error: err.message
      });
    }
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

    try {
      const result = db.run(`
        DELETE FROM cart WHERE user_id = ?
      `, [user_id]);

      res.json({
        code: 200,
        message: '清空购物车成功',
        data: { deleted_count: result.changes }
      });
    } catch (err) {
      return res.status(500).json({
        code: 500,
        message: '清空购物车失败',
        error: err.message
      });
    }
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: '清空购物车失败',
      error: err.message
    });
  }
});

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
      SELECT c.*, d.name as dish_name, d.image_url, d.description
      FROM cart c
      JOIN dishes d ON c.dish_id = d.id
      WHERE c.user_id = ?
    `;
    let queryParams = [user_id];

    // 如果传了 cart_ids，只提交指定的购物车项
    if (cart_ids.length > 0) {
      cartQuery += ` AND c.id IN (${cart_ids.map(() => '?').join(',')})`;
      queryParams = queryParams.concat(cart_ids);
    }

    // 查询当前用户购物车（关联 dishes 表获取图片和描述）
    try {
      const cartList = db.all(cartQuery, queryParams);

      if (cartList.length === 0) {
        return res.status(400).json({
          code: 400,
          message: '暂无可提交的购物车商品'
        });
      }

      // 3.1 插入提交主记录
      const submitResult = db.run(`
        INSERT INTO cart_submit (user_id, remark)
        VALUES (?, ?)
      `, [user_id, remark]);
      const submitId = submitResult.lastID;

      // 3.2 插入提交明细
      cartList.forEach(item => {
        db.run(`
          INSERT INTO cart_submit_item (submit_id, dish_id, dish_name, image_url, description)
          VALUES (?, ?, ?, ?, ?)
        `, [submitId, item.dish_id, item.dish_name, item.image_url, item.description]);
      });

      // 3.3 清空购物车
      let clearCartSQL = `DELETE FROM cart WHERE user_id = ?`;
      let clearCartParams = [user_id];
      
      if (cart_ids.length > 0) {
        clearCartSQL += ` AND id IN (${cart_ids.map(() => '?').join(',')})`;
        clearCartParams = clearCartParams.concat(cart_ids);
      }
      db.run(clearCartSQL, clearCartParams);

      // 返回提交结果
      res.json({
        code: 200,
        message: '提交购物车到管家端成功',
        data: {
          submit_id: submitId, // 提交记录ID
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
      return res.status(500).json({
        code: 500,
        message: '数据库操作失败',
        error: err.message
      });
    }
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
    try {
      const submitList = db.all(`
        SELECT cs.*, wu.openid 
        FROM cart_submit cs
        LEFT JOIN wechat_user wu ON cs.user_id = wu.id
        ORDER BY cs.submit_time DESC
      `);

      if (submitList.length === 0) {
        return res.json({
          code: 200,
          message: '查询待处理提交记录成功',
          data: {
            total: 0,
            list: []
          }
        });
      }

      // 2. 补充每条提交记录的菜品明细
      const result = [];

      submitList.forEach(submit => {
        const items = db.all(`
          SELECT * FROM cart_submit_item WHERE submit_id = ?
        `, [submit.id]);

        // 把每个 item 都和 submit 信息合并，返回一维数组
        items.forEach(item => {
          result.push({
            ...submit,       // 提交记录的信息
            ...item,         // 菜品明细的信息
            submit_id: submit.id // 明确保留 submit_id 方便区分
          });
        });
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
      return res.status(500).json({
        code: 500,
        message: '查询提交记录失败',
        error: err.message
      });
    }
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

    try {
      const result = db.run(`DELETE FROM cart WHERE create_date = ?`, [date]);

      res.json({
        code: 200,
        message: `重置成功，删除了 ${result.changes} 条购物车记录`,
        data: { deletedCount: result.changes }
      });
    } catch (err) {
      return res.status(500).json({
        code: 500,
        message: '重置购物车失败',
        error: err.message
      });
    }
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
    try {
      const submitList = db.all(`
        SELECT 
          id AS submit_id,
          remark,
          submit_time
        FROM cart_submit
        WHERE user_id = ?
        ORDER BY submit_time DESC
      `, [user_id]);

      if (submitList.length === 0) {
        return res.json({
          code: 200,
          message: '查询成功',
          data: []
        });
      }

      // 2. 给每一次提交，查询对应的【菜品明细】
      submitList.forEach(submit => {
        const items = db.all(`
          SELECT 
            dish_id,
            dish_name,
            image_url,
            description
          FROM cart_submit_item
          WHERE submit_id = ?
        `, [submit.submit_id]);

        // 把明细塞进当前提交记录
        submit.items = items;
        // 本次提交的菜品数量
        submit.totalCount = items.length;
      });

      // 返回结果
      res.json({
        code: 200,
        message: '查询成功',
        data: submitList
      });
    } catch (err) {
      return res.status(500).json({
        code: 500,
        message: '查询提交记录失败',
        error: err.message
      });
    }

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
