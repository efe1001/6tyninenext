// routes/chats.js
const express = require('express');
const router = express.Router();
const { User, Message } = require('../models');
const { authenticateToken } = require('../middleware');
const { getChatChannel } = require('../utils/chats');
const { checkSubscriptionStatus } = require('../utils/subscriptions');
const { sendMessageNotification } = require('../utils/notifications');
const Pusher = require('pusher');

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// Get all conversations
router.get('/chats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userUsername = user.username;
    const chats = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userUsername, recipient: { $ne: userUsername } },
            { recipient: userUsername, sender: { $ne: userUsername } }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            other: {
              $cond: [
                { $eq: ['$sender', userUsername] },
                '$recipient',
                '$sender'
              ]
            }
          },
          lastMessageObj: { $first: { text: '$text', timestamp: '$timestamp' } }
        }
      },
      {
        $sort: { 'lastMessageObj.timestamp': -1 }
      },
      {
        $project: {
          targetUsername: '$_id.other',
          lastMessage: '$lastMessageObj.text',
          timestamp: '$lastMessageObj.timestamp',
          _id: 0
        }
      }
    ]);

    const conversations = await Promise.all(
      chats.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          sender: conv.targetUsername,
          recipient: userUsername,
          read: false
        });
        return {
          ...conv,
          unreadCount,
          lastMessage: conv.lastMessage || 'No messages yet'
        };
      })
    );

    res.json({ conversations });
  } catch (error) {
    console.error('[Chats] Error:', error);
    res.status(500).json({ message: 'Server error fetching conversations: ' + error.message });
  }
});

// Get messages with a specific user
router.get('/chats/:target/messages', authenticateToken, async (req, res) => {
  try {
    const { target } = req.params;
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Fetching messages between:', user.username, 'and', target);

    const messages = await Message.find({
      $or: [
        { sender: user.username, recipient: target },
        { sender: target, recipient: user.username }
      ]
    })
    .sort({ timestamp: 1 })
    .lean();

    // Mark incoming messages as read
    await Message.updateMany(
      { sender: target, recipient: user.username, read: false },
      { read: true }
    );

    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      sender: msg.sender,
      recipient: msg.recipient,
      text: msg.text,
      images: msg.images || [],
      videos: msg.videos || [],
      timestamp: msg.timestamp
    }));

    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error('[Chat Messages] Error:', error);
    res.status(500).json({ message: 'Server error fetching messages: ' + error.message });
  }
});

// Send message
router.post('/chats/:target/messages', authenticateToken, async (req, res) => {
  try {
    const { target } = req.params;
    const { text, images, videos } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetUser = await User.findOne({ username: target }).select('email name messagesFromPremiumOnly emailNotifications');
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    // Enforce messagesFromPremiumOnly restriction
    if (targetUser.messagesFromPremiumOnly) {
      const isSubscribed = await checkSubscriptionStatus(user.username, target);
      if (!isSubscribed) {
        return res.status(403).json({ message: 'This creator only accepts messages from premium subscribers. Please subscribe to message them.' });
      }
    }

    const messageCount = await Message.countDocuments();
    const newMessage = new Message({
      id: messageCount + 1,
      sender: user.username,
      recipient: target,
      text: text.trim(),
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      timestamp: new Date()
    });

    await newMessage.save();
    console.log('Message saved to database:', {
      id: newMessage.id,
      sender: newMessage.sender,
      recipient: newMessage.recipient,
      text: newMessage.text
    });

    const channelName = getChatChannel(user.username, target);
    await pusher.trigger(channelName, 'new-message', {
      id: newMessage.id,
      sender: newMessage.sender,
      recipient: newMessage.recipient,
      text: newMessage.text,
      images: newMessage.images,
      videos: newMessage.videos,
      timestamp: newMessage.timestamp.toISOString(),
      read: false
    });

    // Send notifications based on user status
    await sendMessageNotification(
      target,
      user.username,
      newMessage.text,
      newMessage.id
    );

    const responseMessage = {
      id: newMessage.id,
      sender: newMessage.sender,
      recipient: newMessage.recipient,
      text: newMessage.text,
      images: newMessage.images,
      videos: newMessage.videos,
      timestamp: newMessage.timestamp
    };

    res.status(201).json(responseMessage);
  } catch (error) {
    console.error('[Send Message] Error:', error);
    res.status(500).json({ message: 'Server error sending message: ' + error.message });
  }
});

// Get unread messages count
router.get('/chats/unread-count', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const unreadCount = await Message.countDocuments({
      recipient: user.username,
      read: false
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('[Unread Count] Error:', error);
    res.status(500).json({ message: 'Server error fetching unread count: ' + error.message });
  }
});

// Mark all messages as read
router.post('/chats/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await Message.updateMany(
      { recipient: user.username, read: false },
      { read: true }
    );

    res.json({ message: 'All messages marked as read' });
  } catch (error) {
    console.error('[Mark All Read] Error:', error);
    res.status(500).json({ message: 'Server error marking messages as read: ' + error.message });
  }
});

// Pusher authentication for private channels
router.post('/pusher/auth', authenticateToken, (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  const userId = req.user.username;

  // Update user online status when they connect to Pusher
  const { updateUserOnlineStatus } = require('../utils/userStatus');
  updateUserOnlineStatus(userId);

  // Validate private chat channels
  if (channel.startsWith('private-')) {
    const parts = channel.replace('private-', '').split('-');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return res.status(403).json({ message: 'Invalid channel format' });
    }
    if (![parts[0], parts[1]].includes(userId)) {
      return res.status(403).json({ message: 'Unauthorized for this private channel' });
    }
  }

  const userInfo = {
    username: req.user.username,
  };

  const authResponse = pusher.authenticate(socketId, channel, {
    user_id: userId,
    user_info: userInfo
  });

  res.send(authResponse);
});



module.exports = router;