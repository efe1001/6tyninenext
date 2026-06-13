// models/index.js
const mongoose = require('mongoose');

// Import schemas from actual model files
const User = require('./User');  // This will load models/user.js
const Post = require('./Post');  // You'll need to create this

// For other models, create as needed
const MessageSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// Export all models
module.exports = {
  User,
  Post,
  Message
};