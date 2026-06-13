const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  text: { type: String, required: true },
  username: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  images: [String],
  videos: [String],
  likes: [String],
  comments: [{
    id: String,
    username: String,
    text: String,
    timestamp: String,
  }],
  views: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  hashtags: [String],
  userMentions: [String],
  isAdminPost: { type: Boolean, default: false },
  hasGoldenBadge: { type: Boolean, default: false },
}, { timestamps: true });

postSchema.index({ username: 1, timestamp: -1 });
postSchema.index({ hashtags: 1 });

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
