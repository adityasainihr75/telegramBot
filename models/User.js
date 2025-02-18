// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramUserId: {
    type: Number,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: String,
  username: String
}, {
  timestamps: true  // Automatically handles createdAt and updatedAt
});

const User = mongoose.model('User', userSchema);

// Migration function to update existing documents
// async function updateExistingDocuments() {
//   try {
//     // Update documents missing createdAt field (if any)
//     const result = await User.updateMany(
//       { createdAt: { $exists: false } },
//       [
//         {
//           $set: {
//             createdAt: { $ifNull: ["$updatedAt", new Date()] }
//           }
//         }
//       ]
//     );

//     console.log(`Updated ${result.modifiedCount} documents`);
//   } catch (err) {
//     console.error('Error during migration:', err);
//   }
//   // Remove connection close if the app needs MongoDB later
//   // mongoose.connection.close();
// }

module.exports = { User,  };
