// netlify/functions/api.js
const express = require('express');
const serverless = require('serverless-http');
const app = express();

// 导入你的 app.js 里的所有配置和路由
// 假设你的 app.js 已经导出了 app
const yourApp = require('../../app.js');

// 把你的 app 挂载到 Netlify Functions 的路径下
app.use('/.netlify/functions/api', yourApp);

module.exports.handler = serverless(app);