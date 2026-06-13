// notifications.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const NodeCache = require('node-cache');

// Import middleware
const { authenticateToken } = require('./middleware');

// User status tracking for email notifications
const userStatusCache = new NodeCache({ stdTTL: 60 }); // 1 minute TTL

// Track user online status
const updateUserOnlineStatus = (username) => {
  userStatusCache.set(username, {
    online: true,
    lastSeen: new Date()
  });
};

// Track user offline status
const updateUserOfflineStatus = (username) => {
  userStatusCache.set(username, {
    online: false,
    lastSeen: new Date()
  });
};

// Check if user should receive email notification
const shouldSendEmailNotification = (username) => {
  const userStatus = userStatusCache.get(username);
  if (!userStatus) {
    return true; // If no status, send email
  }
  
  if (userStatus.online) {
    return false; // User is online, no email needed
  }
  
  // User offline for more than 30 minutes
  const offlineDuration = Date.now() - userStatus.lastSeen.getTime();
  return offlineDuration > 30 * 60 * 1000; // 30 minutes in milliseconds
};

// Email notification helper
const sendEmailNotification = async (toEmail, toName, fromUsername, messageText, messageId) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `New message from ${fromUsername}`,
      html: `
        <h3>Hello ${toName},</h3>
        <p>You have a new message from ${fromUsername}:</p>
        <p><strong>${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}</strong></p>
        <p>Login to your account to view the full message.</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return info.messageId;
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return null;
  }
};

// Enhanced FCM notification helper
const sendFCMNotification = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) {
    console.log('[FCM] No tokens provided');
    return;
  }

  const validTokens = tokens.filter(token => token && token.length > 0);

  if (validTokens.length === 0) {
    console.log('[FCM] No valid tokens after filtering');
    return;
  }

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sound: 'default'
      },
      tokens: validTokens,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channel_id: 'default',
        }
      },
    };

    console.log(`[FCM] Sending to ${message.tokens.length} devices`);
    const response = await admin.messaging().sendMulticast(message);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push({
            token: validTokens[idx],
            error: resp.error
          });
        }
      });

      if (failedTokens.length > 0) {
        const failedTokenValues = failedTokens.map(ft => ft.token);
        await User.updateMany(
          { fcmTokens: { $in: failedTokenValues } },
          { $pull: { fcmTokens: { $in: failedTokenValues } } }
        );
        console.log(`[FCM] Cleaned up ${failedTokens.length} invalid tokens`);
      }
    }

    return response;
  } catch (error) {
    console.error('[FCM] Send error:', error);
    throw error;
  }
};

// Send notification to specific user
const sendNotificationToUser = async (username, title, body, data = {}) => {
  try {
    const user = await User.findOne({ username }).select('fcmTokens').lean();
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      console.log(`[FCM] No tokens found for user ${username}`);
      return;
    }

    console.log(`[FCM] Sending notification to ${username} with ${user.fcmTokens.length} tokens`);
    return await sendFCMNotification(user.fcmTokens, title, body, data);
  } catch (error) {
    console.error(`[FCM] Error sending to user ${username}:`, error);
    throw error;
  }
};

// Send notification to multiple users
const sendNotificationToUsers = async (usernames, title, body, data = {}) => {
  try {
    const users = await User.find({ username: { $in: usernames } }).select('fcmTokens').lean();
    const allTokens = users.flatMap(user => user.fcmTokens || []).filter(Boolean);
   
    if (allTokens.length === 0) {
      console.log('[FCM] No tokens found for specified users');
      return;
    }
   
    console.log(`[FCM] Sending notification to ${usernames.length} users with ${allTokens.length} tokens`);
    return await sendFCMNotification(allTokens, title, body, data);
  } catch (error) {
    console.error('[FCM] Error sending to multiple users:', error);
    throw error;
  }
};

// Send notification to all users (for announcements)
const sendNotificationToAllUsers = async (title, body, data = {}) => {
  try {
    const allUsers = await User.find({ fcmTokens: { $exists: true, $ne: [] } }).select('fcmTokens').lean();
    const allTokens = allUsers.flatMap(user => user.fcmTokens).filter(Boolean);
   
    if (allTokens.length === 0) {
      console.log('[FCM] No tokens found across all users');
      return;
    }
   
    console.log(`[FCM] Sending notification to all users with ${allTokens.length} tokens`);
   
    // Send in batches of 500 (FCM limit)
    const batchSize = 500;
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batchTokens = allTokens.slice(i, i + batchSize);
      await sendFCMNotification(batchTokens, title, body, data);
      if (i + batchSize < allTokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
   
    console.log('[FCM] Completed sending to all users');
  } catch (error) {
    console.error('[FCM] Error sending to all users:', error);
    throw error;
  }
};

// Enhanced notification sender with user status logic
const sendMessageNotification = async (targetUsername, fromUsername, messageText, messageId) => {
  try {
    const targetUser = await User.findOne({ username: targetUsername }).select('email name fcmTokens emailNotifications');
    if (!targetUser) {
      console.log(`[Notification] Target user ${targetUsername} not found`);
      return;
    }

    const shouldSendEmail = targetUser.emailNotifications !== false;
    const userStatus = userStatusCache.get(targetUsername);
    const isUserOnline = userStatus ? userStatus.online : false;
    const isUserOfflineLong = shouldSendEmailNotification(targetUsername);

    console.log(`[Notification] User status for ${targetUsername}:`, {
      online: isUserOnline,
      offlineLong: isUserOfflineLong,
      hasEmail: !!targetUser.email,
      emailEnabled: shouldSendEmail,
      hasFCM: targetUser.fcmTokens && targetUser.fcmTokens.length > 0
    });

    // Always send FCM notification if user has tokens
    if (targetUser.fcmTokens && targetUser.fcmTokens.length > 0) {
      try {
        await sendFCMNotification(
          targetUser.fcmTokens,
          `New message from ${fromUsername}`,
          messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
          {
            type: 'message',
            sender: fromUsername,
            recipient: targetUsername,
            messageId: messageId.toString(),
            chatChannel: getChatChannel(fromUsername, targetUsername)
          }
        );
        console.log(`[FCM] Sent message notification to ${targetUsername}`);
      } catch (fcmError) {
        console.error('[FCM] Message notification failed:', fcmError);
      }
    }

    // Send email based on user status
    if (shouldSendEmail && targetUser.email && isUserOfflineLong) {
      console.log(`[Email] User ${targetUsername} offline >30min, sending email notification`);
      sendEmailNotification(
        targetUser.email,
        targetUser.name || targetUser.username,
        fromUsername,
        messageText,
        messageId
      ).then((result) => {
        if (result) {
          console.log(`[Email] Successfully sent email notification for message ${messageId} to ${targetUsername}`);
        } else {
          console.log(`[Email] Failed to send email notification for message ${messageId}`);
        }
      }).catch(emailError => {
        console.error(`[Email] Email notification failed for ${targetUsername}:`, emailError);
      });
    } else if (isUserOnline) {
      console.log(`[Email] User ${targetUsername} is online, skipping email`);
    } else if (!isUserOfflineLong) {
      console.log(`[Email] User ${targetUsername} offline <30min, skipping email`);
    }
  } catch (error) {
    console.error(`[Notification] Error sending notifications to ${targetUsername}:`, error);
  }
};

// Helper to get private chat channel name
const getChatChannel = (user1, user2) => {
  const sorted = [user1, user2].sort();
  return `private-${sorted[0]}-${sorted[1]}`;
};

// Attach helper functions to router if needed elsewhere
router.sendMessageNotification = sendMessageNotification;
router.sendNotificationToUser = sendNotificationToUser;
router.sendNotificationToUsers = sendNotificationToUsers;
router.sendNotificationToAllUsers = sendNotificationToAllUsers;
router.updateUserOnlineStatus = updateUserOnlineStatus;
router.updateUserOfflineStatus = updateUserOfflineStatus;
router.sendEmailNotification = sendEmailNotification;
router.sendFCMNotification = sendFCMNotification;
router.shouldSendEmailNotification = shouldSendEmailNotification;
router.getChatChannel = getChatChannel;

// =============================================
// FCM TOKEN MANAGEMENT ROUTES
// =============================================

router.post('/save-fcm-token', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: 'FCM token is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.fcmTokens) {
      user.fcmTokens = [];
    }

    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
      await user.save();
      console.log(`[FCM] Token saved for ${user.username}: ${fcmToken.substring(0, 20)}...`);
    }

    res.json({
      message: 'FCM token saved successfully',
      tokensCount: user.fcmTokens.length
    });
  } catch (error) {
    console.error('[FCM Save Token] Error:', error);
    res.status(500).json({ message: 'Server error saving FCM token: ' + error.message });
  }
});

router.post('/remove-fcm-token', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: 'FCM token is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.fcmTokens && user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens = user.fcmTokens.filter(token => token !== fcmToken);
      await user.save();
      console.log(`[FCM] Token removed for ${user.username}`);
    }

    res.json({
      message: 'FCM token removed successfully',
      tokensCount: user.fcmTokens ? user.fcmTokens.length : 0
    });
  } catch (error) {
    console.error('[FCM Remove Token] Error:', error);
    res.status(500).json({ message: 'Server error removing FCM token: ' + error.message });
  }
});

module.exports = router;