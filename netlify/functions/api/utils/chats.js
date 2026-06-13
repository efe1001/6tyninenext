// Returns a deterministic Pusher channel name for a conversation between two users
const getChatChannel = (userA, userB) => {
  const sorted = [userA, userB].sort();
  return `private-chat-${sorted[0]}-${sorted[1]}`;
};

module.exports = { getChatChannel };
