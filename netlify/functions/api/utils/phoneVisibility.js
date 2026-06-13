const { User } = require('../models');

// Returns true if the phone number should be hidden from viewerUsername
const shouldHidePhoneForUser = async (ownerUsername, viewerUsername, visibility = 'all_users') => {
  if (ownerUsername === viewerUsername) return false;
  if (visibility === 'all_users') return false;
  if (visibility === 'non') return true;

  try {
    if (visibility === 'subscribers_only') {
      const owner = await User.findOne({ username: ownerUsername }).select('subscribersList').lean();
      return !owner?.subscribersList?.includes(viewerUsername);
    }
    if (visibility === 'followers_only') {
      const owner = await User.findOne({ username: ownerUsername }).select('followers').lean();
      return !owner?.followers?.includes(viewerUsername);
    }
  } catch {
    // fail open — don't hide if lookup fails
  }

  return false;
};

module.exports = { shouldHidePhoneForUser };
