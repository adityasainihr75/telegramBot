// First, let's fix the schema to handle both new and existing documents
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
  lastName: {
    type: String
  },
  username: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
},{
  timestamps: true
});

const User = mongoose.model('User', userSchema);

// Create a function to migrate existing data
// async function updateExistingDocuments() {
//     // Update missing createdAt fields
//     const result = await User.updateMany(
//       { createdAt: { $exists: false } }, // Target documents missing createdAt
//       [
//         {
//           $set: {
//             createdAt: { $ifNull: ["$updatedAt", new Date()] } // Copy updatedAt if exists, else use current date
//           }
//         }
//       ]
//     );

//     console.log(`Updated ${result.modifiedCount} documents`);
//     mongoose.connection.close();
//   } 


// Export both the model and the migration function
module.exports = {
  User,
  // updateExistingDocuments
};