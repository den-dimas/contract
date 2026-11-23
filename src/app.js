const path = require('node:path');
const express = require('express');
const { engine } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { loadUser, requireLogin } = require('./middleware/auth');
const { pageHelpers } = require('./middleware/page');
const helpers = require('./views/helpers');

const app = express();

app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers,
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

const BODY_LIMIT = '2mb';

app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser(config.cookieSecret));
app.use(express.static(path.join(__dirname, '../public')));
app.use(pageHelpers);
app.use(loadUser);

app.use('/', require('./routes/auth'));
app.use(requireLogin);
app.use('/dashboard', require('./routes/dashboard'));
app.use('/suppliers/import', require('./routes/import'));
app.use('/suppliers', require('./routes/suppliers'));
app.use('/projects', require('./routes/projects'));

app.use((req, res) => {
  res.status(404).page('error', { title: 'Not found', message: 'This page does not exist.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).page('error', { title: 'Server error', message: 'Something went wrong. Try again later.' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Contract listening on port ${config.port}`);
  });
}

module.exports = app;
