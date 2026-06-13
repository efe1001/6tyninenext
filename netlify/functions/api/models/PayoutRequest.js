const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema({
  id: String,
  userId: mongoose.Schema.Types.ObjectId,
  username: String,
  amount: Number,
  bankName: String,
  accountNumber: String,
  status: {
    type: String,
    default: 'pending'
  },
  adminNote: String,
  createdAt: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);