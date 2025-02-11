const { createClient } = require('redis');
const logger = require('./utils/logger'); // adjust the path to your logger

const redisClient = createClient({
  url: process.env.REDIS_URI,
});

redisClient.connect()
  .then(() => logger.info('Connected to Redis'))
  .catch(error => logger.error(`Redis connection error: ${error.message}`));

module.exports = redisClient;
