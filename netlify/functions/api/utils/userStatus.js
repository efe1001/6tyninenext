const { User } = require('../models');

const updateUserOnlineStatus = async (username) => {
  try {
    await User.updateOne({ username }, { $set: { lastOnline: new Date(), isOnline: true } });
  } catch {
    // non-critical
  }
};

const updateUserOfflineStatus = async (username) => {
  try {
    await User.updateOne({ username }, { $set: { lastOnline: new Date(), isOnline: false } });
  } catch {
    // non-critical
  }
};

module.exports = { updateUserOnlineStatus, updateUserOfflineStatus };
