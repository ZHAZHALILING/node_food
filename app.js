var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
// var cartRouter = require('./routes/cart/cart');
// var dishesRouter = require('./routes/dishes/dishes');
var usersRouter = require('./routes/users/users');
// var mealPlansRouter = require('./routes/meal_plans/index');
// var uploadRouter = require('./routes/upload');
var app = express();


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
// app.use('/api/cart', cartRouter);
// app.use('/api/dishes', dishesRouter);
// app.use('/api/plans', mealPlansRouter);
// app.use('/api/upload', uploadRouter);
module.exports = app;
