moment = require('moment')
chalk = require('chalk')
onFinished = require('on-finished')
/*
//This adds a req.log function to every request
// which ensures the following properties:
//  - all lines are prefixed with a unique request ID
//  - all lines are prefix with a timestamp
//  - all lines are output at the end of the request (or on an error)
//
// This should allow easier debugging, by making things stick together.
*/
var id = 0;
var settings = module.exports.settings = {
  levels: {
    debug: chalk.styles.cyan,
    log: chalk.styles.black,
    info: chalk.styles.grey,
    error: chalk.styles.red
  },
  statusColors: {
    2: chalk.styles.green,
    3: chalk.styles.white,
    4: chalk.styles.yellow
  }
}
var middleware = module.exports.middleware = function (req, res, next) {
  // log redirects
  var redirect = res.redirect;
  res.redirect = function () {
    req.log.log.apply(req, ['Redirecting to'].concat(arguments));
    redirect.apply(res, arguments);
  }

  req.startTime = Date.now();


  req.log = function () {
    var level = 'log';
    var args = Array.prototype.slice.call(arguments)
    if (args[0] in settings.levels) {
      level = args.shift();
    }

    if (req.log.immediate || settings.immediate) {
      req.log.print(level, Date.now(), args);
    } else {
      args.unshift(Date.now())
      args.unshift(level)
      req.log.lines.push(args)
    }
  }

  // req.log.info etc... aliases
  for (var level in settings.levels) {
    req.log[level] = req.log.bind(null, level);
  }

  req.log.id = ++id;
  req.log.lines = [];
  req.log.flushed = false;
  // flush the log lines out with an appropriate header
  req.log.flush = function () {
    req.log.flushed = true;

    var title = Array.prototype.slice.call(arguments);
    title.unshift(
      chalk.bold(chalk.grey('[Request #' + req.log.id + ']')),
      chalk.grey(moment(req.startTime).format('HH:mm:ss'))
    );
    console.info.apply(console, title);

    var line = null;
    while (line = req.log.lines.shift()) {
      req.log.print(line[0], line[1], line.slice(2));
    }
  }

  req.log.print = function (level, date, line) {
    // all lines are prefix with the log id and a time-since-start
    line.unshift(
      chalk.white(' [#' + req.log.id + ']'),
      chalk.white('+' + (date - req.startTime) + 'ms'),
      settings.levels[level].open
    );
    line.push(settings.levels[level].close);

    // console.log('print', line)
    // actually print it out
    (console[level] || console.log).apply(console, line);
  }

  // "finalise" the request, which is really printing it out with request-related annotation
  // such as the method, url, status, total time etc.
  req.log.finish = function (title) {
    var color = settings.statusColors[(res.statusCode || '500').toString().charAt(0)] || chalk.styles.red;
    var args = [
      color.open,
      title,
      req.method,
      (req.originalUrl || req.url),
      res.statusCode,
      (Date.now() - req.startTime) + 'ms',
      color.close
    ].filter(Boolean);

    req.log.flush.apply(req, args);
  }

  onFinished(res, function () {
    // branching is to make it nicer when it has already been finished by a domain error
    if (req.log.lines.length === 0 && req.log.flushed) {
      req.log.flush('Request Finished');
    } else {
      req.log('info', 'Request Finished');
      req.log.finish();
    }
  });

  // ensures the log is flushed even when something goes wrong
  try {
    next()
  } catch (err) {
    if (err.stack) {
      req.log('error', err.stack)
    } else {
      req.log('error', 'Domain Error:', err)
    }
    req.log.finish(chalk.underline.red('ERROR FLUSH'))
    next(err)
  }
}

module.exports.init = function (app) {
  app.use(module.exports.middleware);
}
