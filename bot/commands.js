// Import required packages
const shortid = require("shortid");
const Link = require("../models/Link.js");
const logger = require("../utils/logger.js");
const { User } = require("../models/User.js");
const ms = require("ms");
const setupBot = (bot) => {
  const adminChatId = process.env.BOT_OWNER_ID;

  /*** Command Setup ***/
  const setAdminCommands = async () => {
    try {
      // First set default commands for all users (only /start)
      await bot.setMyCommands(
        [{ command: "start", description: "Start bot" }],
        { scope: { type: "default" } }
      );
      logger.info("Default commands set successfully");

      // Then set admin commands for the specific admin user
      await bot.setMyCommands(
        [
          { command: "start", description: "Start bot" },
          { command: "sendmessage", description: "Broadcast (admin)" },
          {
            command: "partial_broadcast",
            description: "Partial Announcement (admin)",
          },
          { command: "database_management", description: "DB tools (admin)" },
        ],
        { scope: { type: "chat", chat_id: Number(adminChatId) } }
      );
      logger.info("Admin commands set successfully for user:", adminChatId);
    } catch (error) {
      logger.error("Failed to set commands:", error.message);
      if (error.response) {
        logger.error("Response status:", error.response.statusCode);
        logger.error("Response data:", error.response.body);
      }
    }
  };

  // Initialize commands with a small delay to ensure bot is ready
  setTimeout(() => {
    setAdminCommands();
  }, 1000);

  /*** Admin State ***/
  // This object tracks the current admin action by chatId.
  const adminStates = {};

  /*** Utility Functions ***/
  const isAdmin = (chatId) => chatId.toString() === adminChatId;

  // Delay helper to prevent hitting rate limits
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // User registration function
  const registerUser = async (msg) => {
    try {
      const telegramUserId = msg.from.id;
      const firstName = msg.from.first_name;
      const lastName = msg.from.last_name;
      const username = msg.from.username;

      // Check if user already exists
      let user = await User.findOne({ telegramUserId });

      if (!user) {
        // Create new user
        user = new User({
          telegramUserId,
          firstName,
          lastName,
          username,
        });
        await user.save();
        logger.info(
          `New user registered: ${user._id} ${user.firstName} (@${
            user.username || "no_username"
          })`
        );
      } else {
        // Update existing user info in case it changed
        let updated = false;
        if (user.firstName !== firstName) {
          user.firstName = firstName;
          updated = true;
        }
        if (user.lastName !== lastName) {
          user.lastName = lastName;
          updated = true;
        }
        if (user.username !== username) {
          user.username = username;
          updated = true;
        }

        if (updated) {
          await user.save();
          logger.info(
            `Updated user info: ${user._id} ${user.firstName} (@${
              user.username || "no_username"
            })`
          );
        }
      }

      return user;
    } catch (error) {
      logger.error(`Error registering user: ${error.message}`);
      return null;
    }
  };

  /*** UI Helper Functions ***/
  const showAdminMenu = async (chatId) => {
    const menuButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📢 Send Message to All Users",
              callback_data: "send_message",
            },
          ],
          [
            {
              text: "📢 Partial Announcement",
              callback_data: "partial_broadcast",
            },
          ],
          [{ text: "🔒 Create Secure Link", callback_data: "secure_link" }],
          [{ text: "📊 Database Management", callback_data: "db_management" }],
        ],
      },
    };

    try {
      await bot.sendMessage(
        chatId,
        "👋 Welcome to Admin Dashboard!\n\nWhat would you like to do?\n- Send a message to all users\n- Create a secure link",
        menuButtons
      );
    } catch (error) {
      logger.error("Failed to show admin menu:", error);
      await bot.sendMessage(
        chatId,
        "❌ Sorry, there was an error showing the admin menu. Please try again."
      );
    }
  };

  const showDatabaseMenu = async (chatId) => {
    const dbMenuButtons = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 View All Users", callback_data: "view_users" }],
          [{ text: "🚫 View Blocked Users", callback_data: "view_blocked" }],
          [
            {
              text: "💤 View Not Interacted Users",
              callback_data: "view_chat_not_found",
            },
          ],
          [{ text: "🗑️ Clean Database", callback_data: "clean_db" }],
          [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    };

    try {
      await bot.sendMessage(
        chatId,
        "📊 Database Management\n\nSelect an action:",
        dbMenuButtons
      );
    } catch (error) {
      logger.error("Failed to show database menu:", error);
    }
  };
  const showPartialBroadcastMenu = async (chatId) => {
    const partialMenuButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Odd Ids", callback_data: "odd_ids" },
            { text: "Even Ids", callback_data: "even_ids" },
          ],
          [
            { text: "Newest Users", callback_data: "newest_users" },
            { text: "Oldest Users", callback_data: "oldest_users" },
          ],
          [{ text: "Custom Range", callback_data: "custom_range" }],
          [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    };

    try {
      await bot.sendMessage(
        chatId,
        "Partial Broadcast\n\nSelect an action:",
        partialMenuButtons
      );
    } catch (error) {
      logger.error("Failed to show database menu:", error);
    }
  };
  /*** Core Functions ***/
  // Check a user's bot status
  const checkBotStatus = async (userId) => {
    try {
      await bot.sendChatAction(userId, "typing");
      return "active";
    } catch (error) {
      if (error.response) {
        if (error.response.statusCode === 403) return "blocked";
        if (error.response.statusCode === 404) return "deleted";
      }
      return "error";
    }
  };

  // Create a secure link from an original link
  const createSecureLink = async (
    originalLink,
    chatId,
    firstName,
    lastName,
    username
  ) => {
    try {
      const uniqueId = shortid.generate();
      const secureLink = `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uniqueId}`;
      await Link.create({
        uuid: uniqueId,
        originalLink,
        secureLink,
        createdBy: chatId, // maps chatId to createdBy
        createrFirstName: firstName, // maps firstName to createrFirstName
        createrLastName: lastName, // maps lastName to createrLastName
        createrUserName: username, // maps username to createrUserName
      });

      return secureLink;
    } catch (error) {
      logger.error("Error creating secure link:", error);
      throw error;
    }
  };
  // Message deletion delay in milliseconds (e.g., 60000 ms = 60 seconds)
  // Function to schedule message deletion
  function messageDeletion(userId, messageId) {
    const deletionDelay = 24 * 60 * 60 * 1000; // 1 hour in milliseconds
    // const deletionDelay =  30000;
    setTimeout(async () => {
      try {
        await bot.deleteMessage(userId, messageId);
        console.log(`Deleted message ${messageId} for user ${userId}`);
      } catch (delError) {
        logger.error(
          `Failed to delete message ${messageId} for user ${userId}:`,
          delError.message
        );
      }
    }, deletionDelay);
  }

  /*** Broadcast Functionality ***/
  const handleBroadcast = async (chatId) => {
    if (
      !adminStates[chatId] ||
      (!adminStates[chatId].messageText && !adminStates[chatId].photo)
    ) {
      await bot.sendMessage(chatId, "❌ Sorry, no message found to broadcast.");
      return;
    }

    const targetUsers =
      adminStates[chatId].targetUsers ||
      (await User.find({ telegramUserId: { $exists: true } })).map(
        (user) => user.telegramUserId
      );
    const broadcastDelay = adminStates[chatId].broadcastDelay || 0; // Get custom delay or default to 0

    const stats = {
      total: targetUsers.length,
      sent: 0,
      failed: 0,
      blocked: 0,
      deleted: 0,
      notFound: 0,
    };

    if (broadcastDelay > 0) {
      const delayMinutes = broadcastDelay / 60000;
      await bot.sendMessage(
        chatId,
        `📣 Broadcast scheduled! Will start in ${delayMinutes} minute(s)...`
      );

      // Wait for the specified delay before starting the broadcast
      await delay(broadcastDelay);

      await bot.sendMessage(chatId, `📣 Starting broadcast now!`);
    } else {
      await bot.sendMessage(chatId, `📣 Starting broadcast immediately...`);
    }

    try {
      for (let i = 0; i < targetUsers.length; i++) {
        try {
          let sentMessage;

          // Check if it's a photo broadcast or text broadcast
          if (adminStates[chatId].photo) {
            // Send photo with caption
            sentMessage = await bot.sendPhoto(
              targetUsers[i],
              adminStates[chatId].photo,
              {
                caption: adminStates[chatId].messageText || "",
                disable_web_page_preview: true,
              }
            );
          } else {
            // Send text message
            sentMessage = await bot.sendMessage(
              targetUsers[i],
              adminStates[chatId].messageText,
              { disable_web_page_preview: true }
            );
          }

          stats.sent++;

          // Schedule deletion of the sent message after the specified delay
          messageDeletion(targetUsers[i], sentMessage.message_id);

          // Rate limiting delay (separate from broadcast delay)
          if ((i + 1) % 30 === 0) {
            await delay(2000);
          } else {
            await delay(100);
          }

          // Show progress every 50 messages
          if ((i + 1) % 50 === 0) {
            await bot.sendMessage(
              chatId,
              `📊 Progress: ${i + 1}/${stats.total}\n✅ Sent: ${
                stats.sent
              }\n❌ Failed: ${stats.failed}`
            );
          }
        } catch (error) {
          if (error.response) {
            if (error.response.statusCode === 403) stats.blocked++;
            else if (error.response.statusCode === 404) stats.deleted++;
            else if (error.response.statusCode === 400) stats.notFound++;
          }
          stats.failed++;
          logger.error(
            `Failed to send to user ${targetUsers[i]}:`,
            error.message
          );
        }
      }

      // Final broadcast result
      await bot.sendMessage(
        chatId,
        `📊 Broadcast Results:\n\n` +
          `📧 Total Users: ${stats.total}\n` +
          `✅ Successfully Sent: ${stats.sent}\n` +
          `❌ Failed: ${stats.failed}\n` +
          `🚫 Bot Blocked: ${stats.blocked}\n` +
          `🗑️ Deleted Accounts: ${stats.deleted}\n` +
          `❓Chat Not Found: ${stats.notFound}`
      );
    } catch (error) {
      logger.error("Broadcast error:", error);
      await bot.sendMessage(
        chatId,
        "❌ Error occurred while broadcasting. Please check logs."
      );
    }
    delete adminStates[chatId];
    await showAdminMenu(chatId);
  };

  const partialMessage = (chatId) => {
    showPartialBroadcastMenu(chatId);
  };
  /*** Database Cleanup Handlers ***/
  const handleViewBlocked = async (chatId) => {
    try {
      await bot.sendMessage(chatId, "🔍 Checking blocked users...");
      const users = await User.find({});
      let blockedCount = 0;

      for (const user of users) {
        const status = await checkBotStatus(user.telegramUserId);
        if (status === "blocked") {
          blockedCount++;
        }
      }

      await bot.sendMessage(
        chatId,
        `📊 Block Status:\n\n` +
          `Total Users: ${users.length}\n` +
          `Blocked Bot: ${blockedCount}\n` +
          `Active Users: ${users.length - blockedCount}`
      );
    } catch (error) {
      logger.error("Error checking blocked users:", error);
      await bot.sendMessage(chatId, "❌ Error checking blocked users");
    }
  };

  const clearDeletedUsers = async (chatId) => {
    try {
      await bot.sendMessage(chatId, "🔍 Checking for deleted accounts...");
      const users = await User.find({});
      let deletedCount = 0;

      for (const user of users) {
        const status = await checkBotStatus(user.telegramUserId);
        if (status === "deleted") {
          await User.deleteOne({ telegramUserId: user.telegramUserId });
          deletedCount++;
        }
      }

      await bot.sendMessage(
        chatId,
        `🗑️ Deleted Accounts Cleanup:\n\n` +
          `Total Users Checked: ${users.length}\n` +
          `Deleted Accounts Removed: ${deletedCount}`
      );
    } catch (error) {
      logger.error("Error clearing deleted users:", error);
      await bot.sendMessage(
        chatId,
        "❌ Error occurred while clearing deleted users."
      );
    }
  };
  const viewChatnotFoundUsers = async (chatId) => {
    try {
      await bot.sendMessage(
        chatId,
        "🔍 Checking for users not found in chat..."
      );
      const users = await User.find({});
      let notFoundCount = 0;
      for (const user of users) {
        const status = await checkBotStatus(user.telegramUserId);
        if (status === "error") {
          notFoundCount++;
        }
      }
      await bot.sendMessage(
        chatId,
        `📊 Block Status:\n\n` +
          `Total Users: ${users.length}\n` +
          `User Not Interacted Bot: ${notFoundCount}\n`
      );
    } catch (error) {
      logger.error("Error checking blocked users:", error);
      await bot.sendMessage(chatId, "❌ Error checking blocked users");
    }
  };

  const clearChatNotFoundUsers = async (chatId) => {
    try {
      await bot.sendMessage(
        chatId,
        "🔍 Checking for users with chat not found..."
      );
      const users = await User.find({});
      let notFoundCount = 0;

      for (const user of users) {
        const status = await checkBotStatus(user.telegramUserId);
        if (status === "error") {
          await User.deleteOne({ telegramUserId: user.telegramUserId });
          notFoundCount++;
        }
      }

      await bot.sendMessage(
        chatId,
        `❓ Chat Not Found Cleanup:\n\n` +
          `Total Users Checked: ${users.length}\n` +
          `Users Removed: ${notFoundCount}`
      );
    } catch (error) {
      logger.error("Error clearing users with chat not found:", error);
      await bot.sendMessage(
        chatId,
        "❌ Error occurred while clearing users with chat not found."
      );
    }
  };

  const showCleanupOptions = async (chatId) => {
    const cleanupOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗑️ Remove Deleted Accounts",
              callback_data: "remove_deleted",
            },
            {
              text: "❓ Remove Chat Not Found",
              callback_data: "remove_chat_not_found",
            },
          ],
          [{ text: "⬅️ Back", callback_data: "db_management" }],
        ],
      },
    };

    await bot.sendMessage(
      chatId,
      "⚠️ Database Cleanup Options\n\nChoose what to clean:",
      cleanupOptions
    );
  };
  const oddIdsBroadcast = async (chatId) => {
    adminStates[chatId] = { action: "typing_broadcast", targetType: "odd_ids" };
    try {
      const users = await User.find({});
      const oddUsers = users.filter((user) => user.telegramUserId % 2 !== 0);

      if (oddUsers.length === 0) {
        await bot.sendMessage(chatId, "❌ No users with odd IDs found");
        return;
      }

      await bot.sendMessage(
        chatId,
        `📝 Found ${oddUsers.length} users with odd IDs. Please send the message (text or image with caption) you want to broadcast to them:`
      );

      // Store odd user IDs in state for later use
      adminStates[chatId].targetUsers = oddUsers.map(
        (user) => user.telegramUserId
      );
    } catch (error) {
      logger.error("Error getting odd ID users:", error);
      await bot.sendMessage(chatId, "❌ Error getting users with odd IDs");
      delete adminStates[chatId];
    }
  };

  const evenIdsBroadcast = async (chatId) => {
    adminStates[chatId] = {
      action: "typing_broadcast",
      targetType: "even_ids",
    };
    try {
      const users = await User.find({});
      const evenUsers = users.filter((user) => user.telegramUserId % 2 === 0);

      if (evenUsers.length === 0) {
        await bot.sendMessage(chatId, "❌ No users with even IDs found");
        return;
      }

      await bot.sendMessage(
        chatId,
        `📝 Found ${evenUsers.length} users with even IDs. Please send the message (text or image with caption) you want to broadcast to them:`
      );

      // Store even user IDs in state for later use
      adminStates[chatId].targetUsers = evenUsers.map(
        (user) => user.telegramUserId
      );
    } catch (error) {
      logger.error("Error getting even ID users:", error);
      await bot.sendMessage(chatId, "❌ Error getting users with even IDs");
      delete adminStates[chatId];
    }
  };
  const handleNewestUsers = async (chatId, thresholdDate) => {
    try {
      console.log("Threshold Date (before query):", thresholdDate);

      // Query users
      const users = await User.find({
        $or: [
          { createdAt: { $gte: thresholdDate } },
          { createdAt: { $exists: false }, updatedAt: { $gte: thresholdDate } },
        ],
      }).sort({ createdAt: -1 });

      console.log("Fetched Users:", users.length); // Log how many users found

      if (users.length === 0) {
        return bot.sendMessage(chatId, "No users found for this time period.");
      }
      bot.sendMessage(chatId, "users found " + users.length);
      adminStates[chatId] = {
        ...adminStates[chatId],
        action: "typing_broadcast",
        targetUsers: users.map((user) => user.telegramUserId),
        targetType: "newest_users",
      };

      // Prompt the admin to type the message to send to these users.
      await bot.sendMessage(
        chatId,
        `📝 Found ${users.length} newest users who joined on or after this period. Please send the message (text or image with caption) you want to broadcast to these users:`
      );
    } catch (err) {
      console.error("Error fetching users:", err);
      bot.sendMessage(chatId, "Error fetching user data. Please try again.");
    }
  };
  const handleOldestUsers = async (chatId, thresholdDate) => {
    try {
      console.log("Threshold Date (before query):", thresholdDate);

      // Query users
      const users = await User.find({
        $or: [
          { createdAt: { $lte: thresholdDate } },
          { createdAt: { $exists: false }, updatedAt: { $lte: thresholdDate } },
        ],
      }).sort({ createdAt: -1 });

      console.log("Fetched Users:", users.length); // Log how many users found

      if (users.length === 0) {
        return bot.sendMessage(chatId, "No users found for this time period.");
      }
      bot.sendMessage(chatId, "users found " + users.length);
      // Update admin state with the target users for broadcast.
      // This preserves any previous state data (if any).
      adminStates[chatId] = {
        ...adminStates[chatId],
        action: "typing_broadcast",
        targetUsers: users.map((user) => user.telegramUserId),
        targetType: "oldest_users",
      };

      // Prompt the admin to type the message to send to these users.
      await bot.sendMessage(
        chatId,
        `📝 Found ${users.length} oldest users who joined on or before this period. Please send the message (text or image with caption) you want to broadcast to these users:`
      );
    } catch (err) {
      console.error("Error fetching users:", err);
      bot.sendMessage(chatId, "Error fetching user data. Please try again.");
    }
  };
  const customRangeBroadcast = async (chatId, limit) => {
    try {
      // Fetch a limited number of users from your database.
      const users = await User.find({
        telegramUserId: { $exists: true },
      }).limit(limit);

      if (users.length === 0) {
        return bot.sendMessage(
          chatId,
          "No users found for the selected range."
        );
      }

      // Update the admin state with the target users.
      adminStates[chatId] = {
        ...adminStates[chatId],
        action: "typing_broadcast",
        targetUsers: users.map((user) => user.telegramUserId),
        targetType: "custom_range",
      };

      // Prompt the admin to type the broadcast message.
      await bot.sendMessage(
        chatId,
        `📝 Found ${users.length} users. Please send the message (text or image with caption) you want to broadcast to these users:`
      );
    } catch (err) {
      console.error("Error fetching users for custom range broadcast:", err);
      bot.sendMessage(
        chatId,
        "Error fetching users for custom range broadcast. Please try again."
      );
    }
  };

  /*** Bot Event Handlers ***/
  // Handle incoming messages
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name;
    const username = msg.from.username;
    const photo = msg.photo;

    // Register user in database (for all interactions)
    await registerUser(msg);

    // Handle photo messages for broadcast
    if (
      photo &&
      adminStates[chatId] &&
      adminStates[chatId].action === "typing_broadcast"
    ) {
      const largestPhoto = photo[photo.length - 1]; // Get the largest photo size
      const caption = msg.caption || "";

      adminStates[chatId] = {
        ...adminStates[chatId],
        action: "previewing_broadcast",
        photo: largestPhoto.file_id,
        messageText: caption,
      };

      // Show preview with photo
      await bot.sendPhoto(chatId, largestPhoto.file_id, {
        caption: `📝 Here's how your broadcast will look:\n\n${caption}\n\nSelect broadcast delay:`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⚡ Send Now", callback_data: "delay_0" },
              { text: "⏱️ 1 Min Delay", callback_data: "delay_1" },
            ],
            [
              { text: "⏰ 5 Min Delay", callback_data: "delay_5" },
              { text: "🕐 10 Min Delay", callback_data: "delay_10" },
            ],
            [
              { text: "🕕 30 Min Delay", callback_data: "delay_30" },
              { text: "🕐 1 Hour Delay", callback_data: "delay_60" },
            ],
            [
              { text: "🔧 Custom Delay", callback_data: "delay_custom" },
              { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
            ],
          ],
        },
      });
      return;
    }

    // Ignore commands and empty messages (but allow photos)
    if (
      (!messageText && !photo) ||
      (messageText && messageText.startsWith("/"))
    )
      return;
    // If the admin is in a custom number input state:
    if (
      adminStates[chatId] &&
      adminStates[chatId].action === "custom_range_input"
    ) {
      const customNumber = parseInt(messageText.trim(), 10);
      if (isNaN(customNumber) || customNumber <= 0) {
        await bot.sendMessage(
          chatId,
          "Invalid number. Please enter a valid positive number:"
        );
        return;
      }
      // Call the customRangeBroadcast function with the provided number.
      await customRangeBroadcast(chatId, customNumber);
      return; // Prevent further processing of this message.
    }
    // If the admin is in the middle of an action
    if (adminStates[chatId]) {
      const currentState = adminStates[chatId];

      switch (currentState.action) {
        case "typing_broadcast":
          // Save message and show preview for broadcast
          console.log(adminStates);
          adminStates[chatId] = {
            ...adminStates[chatId], // preserve existing properties like targetUsers
            action: "previewing_broadcast",
            messageText,
          };

          await bot.sendMessage(
            chatId,
            `📝 Here's how your message will look:\n\n${messageText}\n\nSelect broadcast delay:`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "⚡ Send Now", callback_data: "delay_0" },
                    { text: "⏱️ 1 Min Delay", callback_data: "delay_1" },
                  ],
                  [
                    { text: "⏰ 5 Min Delay", callback_data: "delay_5" },
                    { text: "🕐 10 Min Delay", callback_data: "delay_10" },
                  ],
                  [
                    { text: "🕕 30 Min Delay", callback_data: "delay_30" },
                    { text: "🕐 1 Hour Delay", callback_data: "delay_60" },
                  ],
                  [
                    { text: "🔧 Custom Delay", callback_data: "delay_custom" },
                    {
                      text: "✏️ Edit Message",
                      callback_data: "edit_broadcast",
                    },
                  ],
                ],
              },
            }
          );
          break;
        case "creating_secure_link":
          if (
            messageText.startsWith("http://t.me") ||
            messageText.startsWith("https://t.me")
          ) {
            try {
              const secureLink = await createSecureLink(
                messageText,
                chatId,
                firstName,
                lastName,
                username
              );
              await bot.sendMessage(
                chatId,
                "✅ Here's your secure link:\n" + secureLink
              );
              delete adminStates[chatId];
              await showAdminMenu(chatId);
            } catch (error) {
              await bot.sendMessage(
                chatId,
                "❌ Sorry, couldn't create secure link. Please try again."
              );
            }
          } else {
            await bot.sendMessage(
              chatId,
              "⚠️ Please send a valid link starting with http:// or https://"
            );
          }
          break;
        case "awaiting_duration": {
          const inputMsg = messageText.trim();
          const durationRegex = /^(\d+)([dwmy])$/i;
          const durationMatch = inputMsg.match(durationRegex);

          if (!durationMatch) {
            return bot.sendMessage(
              chatId,
              "Invalid format. Please type your time duration in the format e.g., '2d', '3w', '6m'.\n" +
                "d -> days, w -> weeks, m -> months, y -> years."
            );
          }

          const durationMs = ms(inputMsg);
          const thresholdDate = new Date(Date.now() - durationMs);
          handleNewestUsers(chatId, thresholdDate);
          break;
        }

        case "old_awaiting_duration": {
          const inputMsgOld = messageText.trim();
          const durationRegexOld = /^(\d+)([dwmy])$/i;
          const durationMatchOld = inputMsgOld.match(durationRegexOld);

          if (!durationMatchOld) {
            return bot.sendMessage(
              chatId,
              "Invalid format. Please type your time duration in the format e.g., '2d', '3w', '6m'.\n" +
                "d -> days, w -> weeks, m -> months, y -> years."
            );
          }

          const durationMsOld = ms(inputMsgOld);
          const thresholdDateOld = new Date(Date.now() - durationMsOld);
          handleOldestUsers(chatId, thresholdDateOld);
          break;
        }
        case "custom_delay_input":
          const delayInput = messageText.trim();
          const delayMinutes = parseInt(delayInput, 10);

          if (isNaN(delayMinutes) || delayMinutes < 0) {
            await bot.sendMessage(
              chatId,
              "❌ Invalid delay time. Please enter a valid number of minutes (0 or greater):"
            );
            return;
          }

          // Set the custom delay and proceed with broadcast
          adminStates[chatId].broadcastDelay = delayMinutes * 60 * 1000; // Convert to milliseconds
          adminStates[chatId].action = "ready_to_broadcast";

          const delayText =
            delayMinutes > 0
              ? ` with ${delayMinutes} minute(s) delay between messages`
              : " immediately";
          await bot.sendMessage(
            chatId,
            `✅ Broadcast will be sent${delayText}.\n\nReady to proceed?`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Start Broadcast",
                      callback_data: "send_broadcast",
                    },
                    {
                      text: "✏️ Edit Message",
                      callback_data: "edit_broadcast",
                    },
                  ],
                ],
              },
            }
          );
          break;
        default:
          break;
      }
    }
    // Regular user sending a link
    else if (
      messageText.startsWith("http://") ||
      messageText.startsWith("https://")
    ) {
      try {
        const secureLink = await createSecureLink(
          messageText,
          chatId,
          firstName,
          lastName,
          username
        );
        await bot.sendMessage(
          chatId,
          "✅ Here's your secure link:\n" + secureLink
        );
        // If the sender is admin, display the admin menu again
        if (isAdmin(chatId)) await showAdminMenu(chatId);
      } catch (error) {
        await bot.sendMessage(
          chatId,
          "❌ Sorry, couldn't create secure link. Please try again."
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        "⚠️ Please send a valid link starting with http:// or https://"
      );
    }
  });

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name;

    if (isAdmin(chatId)) {
      await showAdminMenu(chatId);
    } else {
      await bot.sendMessage(
        chatId,
        `Welcome ${userName}! 👋\n\nI can help you create secure links.\nJust send me any link and I'll secure it for you!`
      );
    }
  });

  // Handle /sendmessage command (admin only)
  bot.onText(/\/sendmessage/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(
        chatId,
        "⚠️ Sorry, this command is only for admins."
      );
      return;
    }
    adminStates[chatId] = { action: "typing_broadcast" };
    await bot.sendMessage(
      chatId,
      "📝 Please send the message (text or image with caption) you want to broadcast to all users:"
    );
  });
  bot.onText(/\/partial_broadcast/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(
        chatId,
        "⚠️ Sorry, this command is only for admins."
      );
      return;
    }
    adminStates[chatId] = { action: "partial_broadcast" };
    await partialMessage(chatId);
  });
  // Handle /database_management command (admin only)
  bot.onText(/\/database_management/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(
        chatId,
        "⚠️ Sorry, this command is only for admins."
      );
      return;
    }
    adminStates[chatId] = { action: "db_management" };
    await showDatabaseMenu(chatId);
  });

  // Handle callback queries from inline buttons
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    // Always answer callback queries immediately
    await bot.answerCallbackQuery(query.id);

    if (!isAdmin(chatId)) {
      await bot.sendMessage(
        chatId,
        "⚠️ Sorry, this feature is only for admins."
      );
      return;
    }

    switch (action) {
      case "send_message":
        adminStates[chatId] = { action: "typing_broadcast" };
        await bot.sendMessage(
          chatId,
          "📝 Please send the message (text or image with caption) you want to broadcast to all users:"
        );
        break;
      case "delay_0":
        adminStates[chatId].broadcastDelay = 0;
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent immediately.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_1":
        adminStates[chatId].broadcastDelay = 1 * 60 * 1000; // 1 minute
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 1 minute delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_5":
        adminStates[chatId].broadcastDelay = 5 * 60 * 1000; // 5 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 5 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_10":
        adminStates[chatId].broadcastDelay = 10 * 60 * 1000; // 10 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 10 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_30":
        adminStates[chatId].broadcastDelay = 30 * 60 * 1000; // 30 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 30 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_60":
        adminStates[chatId].broadcastDelay = 60 * 60 * 1000; // 1 hour
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 1 hour delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_custom":
        adminStates[chatId].action = "custom_delay_input";
        await bot.sendMessage(
          chatId,
          "🔧 Please enter the delay time in minutes (e.g., 15 for 15 minutes):"
        );
        break;
      case "delay_0":
        adminStates[chatId].broadcastDelay = 0;
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent immediately.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_1":
        adminStates[chatId].broadcastDelay = 1 * 60 * 1000; // 1 minute
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 1 minute delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_5":
        adminStates[chatId].broadcastDelay = 5 * 60 * 1000; // 5 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 5 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_10":
        adminStates[chatId].broadcastDelay = 10 * 60 * 1000; // 10 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 10 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_30":
        adminStates[chatId].broadcastDelay = 30 * 60 * 1000; // 30 minutes
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 30 minutes delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_60":
        adminStates[chatId].broadcastDelay = 60 * 60 * 1000; // 1 hour
        adminStates[chatId].action = "ready_to_broadcast";
        await bot.sendMessage(
          chatId,
          "✅ Broadcast will be sent with 1 hour delay between messages.\n\nReady to proceed?",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Start Broadcast",
                    callback_data: "send_broadcast",
                  },
                  { text: "✏️ Edit Message", callback_data: "edit_broadcast" },
                ],
              ],
            },
          }
        );
        break;
      case "delay_custom":
        adminStates[chatId].action = "custom_delay_input";
        await bot.sendMessage(
          chatId,
          "🔧 Please enter the delay time in minutes (e.g., 15 for 15 minutes):"
        );
        break;
      case "secure_link":
        adminStates[chatId] = { action: "creating_secure_link" };
        await bot.sendMessage(
          chatId,
          "🔒 Please send the link you want to secure:"
        );
        break;
      case "send_broadcast":
        if (adminStates[chatId] && adminStates[chatId].messageText) {
          await handleBroadcast(chatId);
        } else {
          await bot.sendMessage(
            chatId,
            "❌ No message found to broadcast. Please type your message again."
          );
        }
        break;
      case "edit_broadcast":
        adminStates[chatId] = { action: "typing_broadcast" };
        await bot.sendMessage(chatId, "📝 Please type your new message:");
        break;
      case "partial_broadcast":
        await partialMessage(chatId);
        break;
      case "db_management":
        await showDatabaseMenu(chatId);
        break;
      case "main_menu":
        await showAdminMenu(chatId);
        break;
      case "view_blocked":
        await handleViewBlocked(chatId);
        break;
      case "clean_db":
        await showCleanupOptions(chatId);
        break;
      case "remove_deleted":
        await clearDeletedUsers(chatId);
        break;
      case "view_chat_not_found":
        viewChatnotFoundUsers(chatId);
        break;
      case "remove_chat_not_found":
        await clearChatNotFoundUsers(chatId);
        break;
      case "odd_ids":
        oddIdsBroadcast(chatId);
        break;
      case "even_ids":
        evenIdsBroadcast(chatId);
        break;
      case "newest_users":
        await bot.sendMessage(
          chatId,
          "📝 Please type your time duration in (e.g., 2d, 3w, 6m):\n d->days ,w->week,m->month,y->year"
        );
        adminStates[chatId] = { action: "awaiting_duration" };
        break;
      case "oldest_users":
        await bot.sendMessage(
          chatId,
          "📝 Please type your time duration in (e.g., 2d, 3w, 6m):\n d->days ,w->week,m->month,y->year"
        );
        adminStates[chatId] = { action: "old_awaiting_duration" };
        break;
      case "view_users":
        const users = await User.find();
        await bot.sendMessage(chatId, "Total Users : " + users.length);
        break;
      case "custom_range":
        const customRangeOptions = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "50 Users", callback_data: "range_50" },
                { text: "100 Users", callback_data: "range_100" },
              ],
              [
                { text: "500 Users", callback_data: "range_500" },
                { text: "1000 Users", callback_data: "range_1000" },
              ],
              [{ text: "Custom Number", callback_data: "custom_range_manual" }],
              [{ text: "⬅️ Back", callback_data: "partial_broadcast" }],
            ],
          },
        };
        await bot.sendMessage(
          chatId,
          "Select the number of users to broadcast to:",
          customRangeOptions
        );
        break;
      case "range_50":
        await customRangeBroadcast(chatId, 50);
        break;
      case "range_100":
        await customRangeBroadcast(chatId, 100);
        break;
      case "range_500":
        await customRangeBroadcast(chatId, 500);
        break;
      case "range_1000":
        await customRangeBroadcast(chatId, 1000);
        break;
      case "custom_range_manual":
        // Set the state to wait for the admin to type a custom number.
        adminStates[chatId] = { action: "custom_range_input" };
        await bot.sendMessage(
          chatId,
          "Please enter the custom number of users you want to broadcast to (e.g., 250):"
        );
        break;
      default:
        break;
    }
  });

  // Handle polling errors
  bot.on("polling_error", (error) => {
    logger.error("Bot polling error:", error);
  });
};

module.exports = { setupBot };
