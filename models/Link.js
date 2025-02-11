const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  uuid: {
    type: String,
    required: true,
    unique: true
  },
  originalLink: {
    type: String,
    required: true
  }
}, { timestamps: true });

linkSchema.index({ uuid: -1 });
linkSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 2592000 seconds for 30 days

const Link = mongoose.model('Link', linkSchema);

module.exports = Link;
