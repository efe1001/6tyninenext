const { User } = require('../models');

let adminInstance = null;
try {
  adminInstance = require('firebase-admin');
} catch {
  // firebase-admin not available
}

const sendToTokens = async (tokens, title, body, data = {}) => {
  if (!adminInstance || !adminInstance.apps.length) return;
  const validTokens = tokens.filter(Boolean);
  if (validTokens.length === 0) return;
  const message = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    tokens: validTokens,
  };
  await adminInstance.messaging().sendEachForMulticast(message);
};

const sendNotificationToUser = async (username, title, body, data = {}) => {
  try {
    const user = await User.findOne({ username }).select('fcmTokens').lean();
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;
    await sendToTokens(user.fcmTokens, title, body, data);
  } catch (err) {
    console.error('[Notification] sendNotificationToUser failed:', err.message);
  }
};

const sendNotificationToAllUsers = async (title, body, data = {}) => {
  try {
    const users = await User.find({ fcmTokens: { $exists: true, $not: { $size: 0 } } })
      .select('fcmTokens').lean();
    const allTokens = users.flatMap(u => u.fcmTokens || []).filter(Boolean);
    if (allTokens.length === 0) return;
    // FCM multicast max 500 tokens per request
    for (let i = 0; i < allTokens.length; i += 500) {
      await sendToTokens(allTokens.slice(i, i + 500), title, body, data);
    }
  } catch (err) {
    console.error('[Notification] sendNotificationToAllUsers failed:', err.message);
  }
};

const sendMessageNotification = async (recipientUsername, senderUsername, messageText, messageId) => {
  try {
    await sendNotificationToUser(
      recipientUsername,
      `New message from ${senderUsername}`,
      messageText ? messageText.substring(0, 100) : 'You have a new message',
      { type: 'new_message', sender: senderUsername, messageId: String(messageId || '') }
    );
  } catch (err) {
    console.error('[Notification] sendMessageNotification failed:', err.message);
  }
};

module.exports = { sendNotificationToUser, sendNotificationToAllUsers, sendMessageNotification };
