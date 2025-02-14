const express = require("express");
const router = express.Router();
const Link = require("../models/Link");
const User = require("../models/User");
const logger = require("../utils/logger");
const redisClient = require("../redisClient");
const recentLinksMap = new Map();

// Preload 50 entries on startup
async function loadRecentLinks() {
  try {
    const links = await Link.find().sort({ createdAt: -1 }).limit(20);
    recentLinksMap.clear();
    links.forEach(link => recentLinksMap.set(link.uuid, link));
    logger.info("Preloaded recent links into memory.");
  } catch (error) {
    logger.error(`Error loading recent links: ${error.message}`);
  }
}

// Refresh the map every 1 day
setInterval(loadRecentLinks, 60 * 60 * 1000); // 1 hour in milliseconds
loadRecentLinks(); // Initial load on startup

router.post("/resolve", async (req, res) => {
  try {
    // Destructure and rename fields as needed.
    const {
      uuid,
      id: telegramUserId,
      first_name: firstName,
      last_name: lastName,
      username,
    } = req.body;

    if (!uuid) {
      return res.status(400).json({ error: "UUID parameter required" });
    }

    // Find the user by telegramUserId or create a new one.
    let user = await User.findOne({ telegramUserId });
    if (!user) {
      user = new User({
        telegramUserId,
        firstName,
        lastName,
        username,
      });
      await user.save();
      logger.info(`Created new user: ${user._id} ${user.firstName}`);
    }
    // logger.info(`Link updated: ${link.uuid}  times`);
    logger.info(
      `Link clicked By : ${firstName} ${lastName} Having Id ${telegramUserId} `
    );
     // Check the in-memory map first
     if (recentLinksMap.has(uuid)) {
      logger.info(`Memory cache hit for uuid: ${uuid}`);
      return res.json({ originalLink: recentLinksMap.get(uuid).originalLink });
    }
    const cachedResponse = await redisClient.get(`link:${uuid}`);
    if (cachedResponse) {
      logger.info(`Cache hit for uuid: ${uuid}`);
      return res.json(JSON.parse(cachedResponse));
    }

    // Find the link by uuid .
    const link = await Link.findOne({ uuid });
    
    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }else{
      recentLinksMap.set(uuid, link.originalLink);
      logger.info("setted link in map");
    }
    const responseData = {
      originalLink: link.originalLink,
    };
    res.json(responseData);
    
    // Cache the response. Set an expiration time (e.g., 1 hour = 3600 seconds)
    try {
      await redisClient.setEx(
        `link:${uuid}`,
        3600,
        JSON.stringify(responseData)
      );
    } catch (cacheError) {
      logger.error(`Redis cache error: ${cacheError.message}`);
    }
    res.json(responseData);
  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
