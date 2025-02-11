require('dotenv/config');
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const { setupBot } = require('./bot/commands.js');
const apiRouter = require('./routes/api.js');
const logger = require('./utils/logger.js');
const cors=require("cors");
const app = express();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(error => logger.error(`MongoDB connection error: ${error.message}`));

// Middleware
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["POST"],
  maxAge: 86400 // Cache preflight for 24 hours
}));
app.use(express.static('public'));

// Routes
app.use('/api', apiRouter);

// Bot Setup
setupBot(bot);

// Error Handling
app.use((err, req, res, next) => {
  logger.error(`Global error: ${err.stack}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Bot @${process.env.BOT_USERNAME} is active`);
});