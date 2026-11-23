const DEFAULT_PORT = 3000;
const DEFAULT_DB_PORT = 3306;

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  throw new Error('COOKIE_SECRET is not set. Copy .env.example to .env first.');
}

module.exports = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  cookieSecret,
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? DEFAULT_DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'contract',
    connectTimeout: 60000,
    decimalNumbers: true,
  },
};
