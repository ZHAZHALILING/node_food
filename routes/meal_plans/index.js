// 每日餐饮计划存档
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.json({ message: 'Express111' });
});

module.exports = router;
