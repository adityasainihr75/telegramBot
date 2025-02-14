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

    let responseData;

    // Try in-memory cache first.
    if (recentLinksMap.has(uuid)) {
      logger.info(`Memory cache hit for uuid: ${uuid}`);
      responseData = { originalLink: recentLinksMap.get(uuid).originalLink };
    } else {
      // Check Redis cache.
      const cachedResponse = await redisClient.get(`link:${uuid}`);
      if (cachedResponse) {
        logger.info(`Redis cache hit for uuid: ${uuid}`);
        responseData = JSON.parse(cachedResponse);
      } else {
        // Retrieve link from database.
        const link = await Link.findOne({ uuid });
        if (!link) {
          return res.status(404).json({ error: "Link not found" });
        }
        // Save link to in-memory cache.
        recentLinksMap.set(uuid, link);
        responseData = { originalLink: link.originalLink };

        // Cache the response in Redis in the background.
        process.nextTick(async () => {
          try {
            await redisClient.setEx(
              `link:${uuid}`,
              3600,
              JSON.stringify(responseData)
            );
          } catch (cacheError) {
            logger.error(`Redis cache error: ${cacheError.message}`);
          }
        });
      }
    }

    // Send the response immediately.
    res.json(responseData);

    // Now, in the background, check if the user exists and store if not.
    process.nextTick(async () => {
      try {
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
        } else {
          logger.info(`User already exists: ${user._id} ${user.firstName}`);
        }
      } catch (userError) {
        logger.error(`Error checking/creating user: ${userError.message}`);
      }
    });
  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
