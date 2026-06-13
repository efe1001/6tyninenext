const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  id: String,
  userId: String,
  type: String,
  amount: Number,
  description: String,
  status: String,
  createdAt: Date,
  relatedId: String,
  reference: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);