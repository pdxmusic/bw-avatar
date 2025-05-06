var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var indexRouter = require('./routes/index');

var app = express();

const axios = require('axios');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

var corsOptions = {
  origin: '*'
};
app.use(cors(corsOptions));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

var cron = require('node-cron');
const findRemoveSync = require('find-remove')


cron.schedule('0 * * * *', () => {
  var result = findRemoveSync(path.join(__dirname,'/public'), {
    age: { seconds: 3600 },
    extensions: '.mp3'
  })
  console.log("result :" + result)
});

/*
// Commenta o rimuovi questa funzione
async function callYourselfToMaintainServerRunning() {
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: 'https://talking-avatar.onrender.com/', // Questo URL causa il 404
    headers: { }
  };

  axios.request(config)
  .then((response) => {
    console.log(JSON.stringify(response.data));
    console.log('Hello Motherfucker... the time is '+ new Date())
  })
  .catch((error) => {
    // Non loggare l'errore 404 qui per evitare confusione
    // console.log(error);
    if (error.response && error.response.status !== 404) {
       console.error('Keep-alive ping failed:', error.message);
    } else if (!error.response) {
       console.error('Keep-alive ping failed:', error.message);
    }
  });
}
*/

/*
// Commenta o rimuovi anche la schedulazione
cron.schedule("* * * * *", function() {
  callYourselfToMaintainServerRunning()
});
*/

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
