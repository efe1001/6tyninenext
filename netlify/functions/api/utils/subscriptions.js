const { User } = require('../models');

const checkSubscriptionStatus = async (subscriberUsername, creatorUsername) => {
  try {
    const creator = await User.findOne({ username: creatorUsername }).select('subscribersList').lean();
    if (!creator) return false;
    return Array.isArray(creator.subscribersList) && creator.subscribersList.includes(subscriberUsername);
  } catch {
    return false;
  }
};

module.exports = { checkSubscriptionStatus };
