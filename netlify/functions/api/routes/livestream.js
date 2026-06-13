// livestream.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Pusher = require('pusher');
const LiveStream = require('../models/LiveStream');
const User = require('../models/User');
const Post = require('../models/Post');
const Subscription = require('../models/Subscription');

// Middleware
const authenticateToken = require('../middleware/auth').authenticateToken;

// Pusher configuration
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

// Helper functions
const extractHashtags = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/#(\w+)/gi)?.map(tag => tag.toLowerCase().replace(/^#/, '')) || []
  )];
};

const extractUserMentions = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/@(\w+)/gi)?.map(mention => mention.toLowerCase().replace(/^@/, '')) || []
  )];
};

const createPost = async ({ text, username, images, videos, timestamp, isPremium = false, hashtags = [], userMentions = [], isAdminPost = false, hasGoldenBadge = false }) => {
  const postCount = await Post.countDocuments();
  const newPost = new Post({
    id: postCount + 1,
    text: text || '',
    username,
    timestamp: timestamp || new Date().toISOString(),
    images: Array.isArray(images) ? images : [],
    videos: Array.isArray(videos) ? videos : [],
    likes: [],
    comments: [],
    views: 0,
    isPremium,
    hashtags: Array.isArray(hashtags) ? hashtags : extractHashtags(text),
    userMentions: Array.isArray(userMentions) ? userMentions : extractUserMentions(text),
    isAdminPost: isAdminPost || false,
    hasGoldenBadge: hasGoldenBadge || false,
  });

  await newPost.save();

  const user = await User.findOne({ username });
  if (user) {
    user.posts.unshift({ ...newPost.toObject(), isPremium, isAdminPost, hasGoldenBadge });
    await user.save();
  }

  return newPost;
};

const checkSubscriptionStatus = async (subscriberUsername, targetUsername) => {
  try {
    const subscription = await Subscription.findOne({
      subscriberId: subscriberUsername,
      targetUserId: targetUsername,
      status: 'active',
    }).lean();
    return !!subscription;
  } catch (error) {
    return false;
  }
};

// =============================================
// LIVESTREAM ROUTES
// =============================================

router.post('/livestream/start', authenticateToken, async (req, res) => {
  console.log('[Livestream] Start request received');
  try {
    const { title, visibility = 'public' } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const roomId = crypto.randomBytes(16).toString('hex');
    const liveStreamId = crypto.randomBytes(16).toString('hex');

    const newStream = new LiveStream({
      id: liveStreamId,
      username: req.user.username,
      title,
      roomId,
      visibility,
      status: 'live',
    });

    await newStream.save();
   
    res.status(201).json({ roomId, liveStreamId });
  } catch (error) {
    console.error('[Livestream] Start error:', error);
    res.status(500).json({ message: 'Failed to start livestream: ' + error.message });
  }
});

router.post('/livestream/end', authenticateToken, async (req, res) => {
  console.log('[Livestream] End request received');
  try {
    const activeStream = await LiveStream.findOne({
      username: req.user.username,
      status: 'live'
    });

    if (!activeStream) {
      return res.status(404).json({ message: 'No active livestream found' });
    }

    activeStream.status = 'ended';
    await activeStream.save();

    pusher.trigger(`presence-room-${activeStream.roomId}`, 'host-left', {});
    res.json({ message: 'Livestream ended successfully' });
  } catch (error) {
    console.error('[Livestream] End error:', error);
    res.status(500).json({ message: 'Failed to end livestream: ' + error.message });
  }
});

router.post('/livestream/complete', authenticateToken, async (req, res) => {
  console.log('[Livestream] Complete request received:', req.body);
  try {
    const { liveStreamId, videoUrl } = req.body;
    if (!liveStreamId || !videoUrl) {
      return res.status(400).json({ message: 'liveStreamId and videoUrl are required' });
    }

    const stream = await LiveStream.findOne({
      id: liveStreamId,
      username: req.user.username
    });

    if (!stream) {
      console.log('[Livestream] Stream not found:', { liveStreamId, username: req.user.username });
      return res.status(404).json({ message: 'Stream not found' });
    }

    // Update stream status and add video URL
    stream.status = 'ended';
    stream.videoUrl = videoUrl;
    await stream.save();

    console.log('[Livestream] Stream updated:', stream);

    // Determine if this should be a premium post or regular post based on visibility
    const isPremium = stream.visibility === 'premium_only';

    if (isPremium) {
      // Create premium post for premium_only streams
      const newPremiumPost = {
        id: Date.now().toString(),
        text: `${stream.title} - Live Stream Recording`,
        username: req.user.username,
        timestamp: new Date().toISOString(),
        images: [],
        videos: [videoUrl],
        likes: [],
        comments: [],
        hashtags: extractHashtags(`${stream.title} - Live Stream Recording`),
        userMentions: extractUserMentions(`${stream.title} - Live Stream Recording`),
        isPremium: true
      };

      const user = await User.findOne({ username: req.user.username });
      if (user) {
        if (!user.premiumContent) {
          user.premiumContent = [];
        }
        user.premiumContent.unshift(newPremiumPost);
        await user.save();
        console.log('[Livestream] Premium post created for user:', user.username);
      }

      console.log('[Livestream] Premium post created successfully');
      res.json({
        message: 'Livestream completed and saved as premium content',
        post: newPremiumPost
      });
    } else {
      // Create regular post for public streams
      const newPost = await createPost({
        text: `${stream.title} - Live Stream Recording`,
        username: req.user.username,
        videos: [videoUrl],
        isPremium: false,
        hashtags: extractHashtags(`${stream.title} - Live Stream Recording`),
        userMentions: extractUserMentions(`${stream.title} - Live Stream Recording`)
      });

      console.log('[Livestream] Regular post created successfully');
      res.json({
        message: 'Livestream completed and saved as regular post',
        post: newPost
      });
    }
  } catch (error) {
    console.error('[Livestream] Complete error:', error);
    res.status(500).json({ message: 'Failed to complete livestream: ' + error.message });
  }
});

router.get('/livestreams', authenticateToken, async (req, res) => {
  console.log('[Livestream] Fetch request received');
  try {
    const { username, active } = req.query;
    const filter = { username: username || req.user.username };
    if (active === 'true') {
      filter.status = 'live';
    }

    const liveStreams = await LiveStream.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ liveStreams });
  } catch (error) {
    console.error('[Livestream] Fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch livestreams: ' + error.message });
  }
});

// =============================================
// WEBRTC SIGNALING ROUTES
// =============================================

router.post('/webrtc/join-room', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Join room request received');
  try {
    const { roomId, isHost, title } = req.body;
    const stream = await LiveStream.findOne({ roomId, status: 'live' });
    if (!stream) {
      return res.status(404).json({ message: 'Live stream not found' });
    }

    // Check visibility for non-hosts
    if (!isHost && stream.visibility === 'premium_only') {
      const isSubscribed = await checkSubscriptionStatus(req.user.username, stream.username);
      if (!isSubscribed) {
        return res.status(403).json({ message: 'Premium subscription required to join this live stream' });
      }
    }

    if (isHost) {
      if (stream.username !== req.user.username) {
        return res.status(403).json({ message: 'Unauthorized to host this room' });
      }
    }

    const data = {
      username: req.user.username,
      isHost: isHost || false,
      title: title || '',
    };

    await pusher.trigger(`presence-room-${roomId}`, 'user-joined', data);
    res.json({ message: 'Joined room successfully' });
  } catch (error) {
    console.error('[WebRTC] Join room error:', error);
    res.status(500).json({ message: 'Failed to join room: ' + error.message });
  }
});

router.post('/webrtc/leave-room', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Leave room request received');
  try {
    const { roomId } = req.body;
    const activeStream = await LiveStream.findOne({
      roomId,
      username: req.user.username,
      status: 'live'
    });

    const data = { username: req.user.username };
    if (activeStream) {
      await pusher.trigger(`presence-room-${roomId}`, 'host-left', {});
    } else {
      await pusher.trigger(`presence-room-${roomId}`, 'user-left', data);
    }

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('[WebRTC] Leave room error:', error);
    res.status(500).json({ message: 'Failed to leave room: ' + error.message });
  }
});

router.post('/webrtc/offer', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Offer request received from', req.user.username);
  try {
    const { roomId, offer, target } = req.body;
    const data = {
      sender: req.user.username,
      offer,
      target,
    };

    await pusher.trigger(`presence-room-${roomId}`, 'offer', data);
    console.log('[WebRTC] Offer triggered to room', roomId, 'for target', target);
    res.json({ message: 'Offer sent successfully' });
  } catch (error) {
    console.error('[WebRTC] Offer error:', error);
    res.status(500).json({ message: 'Failed to send offer: ' + error.message });
  }
});

router.post('/webrtc/answer', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Answer request received from', req.user.username);
  try {
    const { roomId, answer, target } = req.body;
    const data = {
      sender: req.user.username,
      answer,
      target,
    };

    await pusher.trigger(`presence-room-${roomId}`, 'answer', data);
    console.log('[WebRTC] Answer triggered to room', roomId);
    res.json({ message: 'Answer sent successfully' });
  } catch (error) {
    console.error('[WebRTC] Answer error:', error);
    res.status(500).json({ message: 'Failed to send answer: ' + error.message });
  }
});

router.post('/webrtc/ice-candidate', authenticateToken, async (req, res) => {
  console.log('[WebRTC] ICE candidate request received from', req.user.username);
  try {
    const { roomId, candidate, target } = req.body;
    const data = {
      sender: req.user.username,
      candidate,
      target,
    };

    await pusher.trigger(`presence-room-${roomId}`, 'ice-candidate', data);
    console.log('[WebRTC] ICE candidate triggered to room', roomId);
    res.json({ message: 'ICE candidate sent successfully' });
  } catch (error) {
    console.error('[WebRTC] ICE candidate error:', error);
    res.status(500).json({ message: 'Failed to send ICE candidate: ' + error.message });
  }
});

router.post('/webrtc/send-message', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Send message request received');
  try {
    const { roomId, message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const data = {
      username: req.user.username,
      message: message.trim(),
      timestamp: new Date().toISOString(),
    };

    await pusher.trigger(`presence-room-${roomId}`, 'new-message', data);
    res.json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('[WebRTC] Send message error:', error);
    res.status(500).json({ message: 'Failed to send message: ' + error.message });
  }
});

router.post('/webrtc/toggle-media', authenticateToken, async (req, res) => {
  console.log('[WebRTC] Toggle media request received');
  try {
    const { roomId, type, enabled } = req.body;
    if (!type || typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Type and enabled are required' });
    }

    const data = {
      username: req.user.username,
      type,
      enabled,
    };

    await pusher.trigger(`presence-room-${roomId}`, 'user-media-updated', data);
    res.json({ message: 'Media toggle sent successfully' });
  } catch (error) {
    console.error('[WebRTC] Toggle media error:', error);
    res.status(500).json({ message: 'Failed to toggle media: ' + error.message });
  }
});

module.exports = router;