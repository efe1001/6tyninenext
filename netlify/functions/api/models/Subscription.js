const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  id: String,
  subscriberId: String,
  targetUserId: String,
  planCode: String,
  status: String,
  createdAt: Date,
  reference: String,
  amount: Number,
  currency: String,
  recurring: String,
  schedule: String,
  nextPaymentDate: Date,
  paystackSubscriptionCode: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);