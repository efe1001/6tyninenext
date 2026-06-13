// routes/admin.js
const express = require('express');
const router = express.Router();
const { User, Post, LiveStream, PayoutRequest, Transaction, Subscription } = require('../models');
const { authenticateToken, authenticateAdmin } = require('../middleware');
const { createPost } = require('../utils/posts');
const { sendNotificationToUser, sendNotificationToAllUsers } = require('../utils/notifications');
const crypto = require('crypto');

// Admin get all users with enhanced data
router.get('/admin/users', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        $or: [
          { username: searchRegex },
          { email: searchRegex },
          { name: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex }
        ]
      };
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments(query);

    // Enhance user data with additional stats
    const enhancedUsers = await Promise.all(
      users.map(async (user) => {
        const postCount = await Post.countDocuments({ username: user.username });
        const subscriberCount = user.subscribers || 0;
        const followerCount = user.followers?.length || 0;
        const totalEarnings = await Transaction.aggregate([
          { 
            $match: { 
              userId: user.username, 
              type: 'earning', 
              status: 'completed' 
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$amount' } 
            } 
          }
        ]);

        return {
          ...user,
          postCount,
          subscriberCount,
          followerCount,
          totalEarnings: totalEarnings.length > 0 ? totalEarnings[0].total : 0,
          userType: user.userType || 'content_creator'
        };
      })
    );

    res.json({
      users: enhancedUsers,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalUsers / limitNum),
        totalUsers,
        hasNext: pageNum < Math.ceil(totalUsers / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('[Admin Users] Error:', error);
    res.status(500).json({ message: 'Server error fetching users: ' + error.message });
  }
});

// Admin delete user
router.delete('/admin/users/:username', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
  
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Find the user to delete
    const userToDelete = await User.findOne({ username });
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (userToDelete.email === req.user.email) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete user's posts
    await Post.deleteMany({ username });
  
    // Delete user's subscriptions
    await Subscription.deleteMany({
      $or: [
        { subscriberId: username },
        { targetUserId: username }
      ]
    });
  
    // Delete user's payout requests
    await PayoutRequest.deleteMany({ username });
  
    // Delete user's transactions
    await Transaction.deleteMany({ userId: username });
  
    // Delete user's live streams
    await LiveStream.deleteMany({ username });
  
    // Delete user's messages
    const { Message } = require('../models');
    await Message.deleteMany({
      $or: [
        { sender: username },
        { recipient: username }
      ]
    });

    // Finally delete the user
    await User.deleteOne({ username });

    res.json({
      message: `User ${username} deleted successfully`,
      deletedUser: {
        username: userToDelete.username,
        email: userToDelete.email
      }
    });
  } catch (error) {
    console.error('[Delete User] Error:', error);
    res.status(500).json({ message: 'Server error deleting user: ' + error.message });
  }
});

// Admin update user role
router.put('/admin/users/:username/role', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { isAdmin } = req.body;

    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({ message: 'isAdmin must be a boolean' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent admin from removing their own admin status
    if (user.email === req.user.email && !isAdmin) {
      return res.status(400).json({ message: 'Cannot remove your own admin status' });
    }

    user.isAdmin = isAdmin;
    await user.save();

    res.json({
      message: `User ${username} ${isAdmin ? 'promoted to admin' : 'demoted from admin'} successfully`,
      user: {
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('[Admin Update Role] Error:', error);
    res.status(500).json({ message: 'Server error updating user role: ' + error.message });
  }
});

// Admin create post route
router.post('/admin/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { text, images, videos, isPremium = false } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Post text is required' });
    }

    // Enforce text AND at least one image/video for admin posts
    if (images.length === 0 && videos.length === 0) {
      return res.status(400).json({ message: 'Posts must include at least one image or video.' });
    }

    const adminUser = await User.findOne({ email: req.user.email });
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const newPost = await createPost({
      text: text.trim(),
      username: adminUser.username,
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      isPremium: isPremium || false,
      isAdminPost: true,
      hasGoldenBadge: true,
    });

    // Clear cache
    const { cache } = require('../utils/cache');
    cache.del('public_posts');
    
    // Send notification to all users about new admin post
    try {
      await sendNotificationToAllUsers(
        'New Announcement from Admin!',
        text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        {
          type: 'admin_post',
          username: adminUser.username,
          postId: newPost.id.toString(),
          hasGoldenBadge: 'true'
        }
      );
    } catch (notificationError) {
      console.error('[FCM] Admin post notification failed (non-critical):', notificationError);
    }

    res.status(201).json({
      message: 'Admin post created successfully',
      post: newPost
    });
  } catch (error) {
    console.error('[Admin Post] Error:', error);
    res.status(500).json({ message: 'Server error creating admin post: ' + error.message });
  }
});

// Admin get all posts (normal and premium)
router.get('/admin/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, username, isPremium, type = 'all' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    
    if (username && username.trim() !== '') {
      query.username = username.trim();
    }
    
    if (isPremium !== undefined) {
      query.isPremium = isPremium === 'true';
    }
    
    if (type === 'admin') {
      // Query for admin posts
      const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
      const adminUsernames = adminUsers.map(admin => admin.username);
      query.username = { $in: adminUsernames };
    } else if (type === 'user') {
      const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
      const adminUsernames = adminUsers.map(admin => admin.username);
      query.username = { $nin: adminUsernames };
    }

    const posts = await Post.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalPosts = await Post.countDocuments(query);

    // Enhance posts with user data
    const enhancedPosts = await Promise.all(
      posts.map(async (post) => {
        const user = await User.findOne({ username: post.username })
          .select('username profilePicture isAdmin userType')
          .lean();
        
        return {
          ...post,
          userProfile: user ? {
            username: user.username,
            profilePicture: user.profilePicture,
            isAdmin: user.isAdmin,
            userType: user.userType || 'content_creator'
          } : null
        };
      })
    );

    res.json({
      posts: enhancedPosts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalPosts / limitNum),
        totalPosts,
        hasNext: pageNum < Math.ceil(totalPosts / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('[Admin Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts: ' + error.message });
  }
});

// Admin delete any post
router.delete('/admin/posts/:postId', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Remove post from user's posts array
    await User.updateOne(
      { username: post.username },
      { $pull: { posts: { id: Number(postId) } } }
    );

    // Remove the post from posts collection
    await Post.deleteOne({ id: Number(postId) });

    // Clear cache
    const { cache } = require('../utils/cache');
    cache.del('public_posts');

    res.json({ 
      message: 'Post deleted successfully',
      deletedPost: {
        id: post.id,
        username: post.username,
        text: post.text
      }
    });
  } catch (error) {
    console.error('[Admin Delete Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting post: ' + error.message });
  }
});

// Admin get all live streams
router.get('/admin/livestreams', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, username } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (username && username.trim() !== '') {
      query.username = username.trim();
    }

    const liveStreams = await LiveStream.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalStreams = await LiveStream.countDocuments(query);

    // Enhance live streams with user data
    const enhancedStreams = await Promise.all(
      liveStreams.map(async (stream) => {
        const user = await User.findOne({ username: stream.username })
          .select('username profilePicture userType')
          .lean();
        
        return {
          ...stream,
          userProfile: user ? {
            username: user.username,
            profilePicture: user.profilePicture,
            userType: user.userType || 'content_creator'
          } : null
        };
      })
    );

    res.json({
      liveStreams: enhancedStreams,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalStreams / limitNum),
        totalStreams,
        hasNext: pageNum < Math.ceil(totalStreams / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('[Admin LiveStreams] Error:', error);
    res.status(500).json({ message: 'Server error fetching live streams: ' + error.message });
  }
});

// Admin get all payout requests
router.get('/admin/payout-requests', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { fields } = req.query;
    let projection = {};

    if (fields) {
      fields.split(',').forEach(field => {
        if (['id', 'userId', 'username', 'amount', 'bankName', 'accountNumber', 'status', 'createdAt', 'adminNote'].includes(field.trim())) {
          projection[field.trim()] = 1;
        }
      });
    } else {
      projection = { id: 1, userId: 1, username: 1, amount: 1, bankName: 1, accountNumber: 1, status: 1, createdAt: 1, adminNote: 1 };
    }

    const payoutRequests = await PayoutRequest.find().select(projection).lean();
    res.json(payoutRequests);
  } catch (error) {
    console.error('[Admin Payout Requests] Error:', error);
    res.status(500).json({ message: 'Server error fetching payout requests: ' + error.message });
  }
});

// Admin: Process payout request
router.put('/admin/payout-requests/:requestId', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, adminNote } = req.body;

    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const payoutRequest = await PayoutRequest.findOne({ id: requestId });
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }

    const user = await User.findOne({ username: payoutRequest.username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (payoutRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Payout request already processed' });
    }

    payoutRequest.status = status;
    payoutRequest.updatedAt = new Date();
    payoutRequest.adminNote = adminNote || '';

    const userPayoutRequest = user.payoutRequests.find((pr) => pr.id === requestId);
    if (userPayoutRequest) {
      userPayoutRequest.status = status;
      userPayoutRequest.updatedAt = new Date();
      userPayoutRequest.adminNote = adminNote || '';
    }

    if (status === 'rejected') {
      user.balance += payoutRequest.amount;
    } else if (status === 'approved') {
      const { getBankCode } = require('../utils/payments');
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      const bankCode = await getBankCode(payoutRequest.bankName);
      
      const transferResponse = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: payoutRequest.amount * 100,
          recipient: {
            type: 'nuban',
            name: payoutRequest.username,
            account_number: payoutRequest.accountNumber,
            bank_code: bankCode,
            currency: 'NGN',
          },
          reason: `Payout for ${payoutRequest.username}`,
        }),
      });

      const transferData = await transferResponse.json();
      if (!transferResponse.ok || transferData.status !== true) {
        payoutRequest.status = 'pending';
        if (userPayoutRequest) userPayoutRequest.status = 'pending';
        user.balance += payoutRequest.amount;
        await Promise.all([payoutRequest.save(), user.save()]);
        return res.status(500).json({ message: 'Paystack transfer failed: ' + transferData.message });
      }

      const transaction = new Transaction({
        id: crypto.randomBytes(16).toString('hex'),
        userId: user.username,
        type: 'payout',
        amount: payoutRequest.amount,
        description: `Payout to ${payoutRequest.bankName} (${payoutRequest.accountNumber})`,
        status: 'completed',
        createdAt: new Date(),
        relatedId: requestId,
      });

      await transaction.save();
    }

    await Promise.all([payoutRequest.save(), user.save()]);
   
    // Send notification to user about payout status
    try {
      await sendNotificationToUser(
        user.username,
        `Payout Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        status === 'approved'
          ? `Your payout request for $${payoutRequest.amount} has been approved and processed.`
          : `Your payout request for $${payoutRequest.amount} has been rejected. ${adminNote ? 'Reason: ' + adminNote : ''}`,
        { type: 'payout_status', status, amount: payoutRequest.amount.toString(), requestId }
      );
    } catch (notifError) {
      console.log('[FCM] Payout status notification failed (non-critical):', notifError);
    }
   
    res.json({ message: `Payout request ${status}`, payoutRequest });
  } catch (error) {
    console.error('[Admin Process Payout] Error:', error);
    res.status(500).json({ message: 'Server error processing payout: ' + error.message });
  }
});

// Admin dashboard statistics
router.get('/admin/dashboard', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalPosts,
      totalLiveStreams,
      totalSubscriptions,
      totalEarnings,
      recentUsers,
      recentPosts
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      LiveStream.countDocuments(),
      Subscription.countDocuments({ status: 'active' }),
      Transaction.aggregate([
        { $match: { type: 'earning', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.find().sort({ createdAt: -1 }).limit(5).select('username email createdAt').lean(),
      Post.find().sort({ timestamp: -1 }).limit(5).select('id username text timestamp').lean()
    ]);

    const earnings = totalEarnings.length > 0 ? totalEarnings[0].total : 0;

    // Get user type distribution
    const userTypeDistribution = await User.aggregate([
      {
        $group: {
          _id: '$userType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily signups for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailySignups = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      overview: {
        totalUsers,
        totalPosts,
        totalLiveStreams,
        totalSubscriptions,
        totalEarnings: earnings
      },
      recentActivity: {
        recentUsers,
        recentPosts
      },
      analytics: {
        userTypeDistribution,
        dailySignups
      }
    });
  } catch (error) {
    console.error('[Admin Dashboard] Error:', error);
    res.status(500).json({ message: 'Server error fetching dashboard data: ' + error.message });
  }
});

// Admin get FCM tokens for a user
router.get('/admin/fcm-tokens/:username', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('fcmTokens username').lean();
   
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      username: user.username,
      fcmTokens: user.fcmTokens || [],
      tokensCount: user.fcmTokens ? user.fcmTokens.length : 0
    });
  } catch (error) {
    console.error('[FCM Admin Tokens] Error:', error);
    res.status(500).json({ message: 'Server error fetching FCM tokens: ' + error.message });
  }
});

// Admin send test notification
router.post('/admin/send-test-notification', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username, title, body } = req.body;
   
    if (!username || !title || !body) {
      return res.status(400).json({
        message: 'Username, title, and body are required'
      });
    }

    const result = await sendNotificationToUser(
      username,
      title || 'Test Notification',
      body || 'This is a test notification from the admin panel',
      { type: 'test', adminTest: true }
    );

    if (!result) {
      return res.status(404).json({
        message: 'User not found or no FCM tokens available'
      });
    }

    res.json({
      message: 'Test notification sent successfully',
      sentCount: result.successCount,
      failedCount: result.failureCount
    });
  } catch (error) {
    console.error('[FCM Test Notification] Error:', error);
    res.status(500).json({ message: 'Server error sending test notification: ' + error.message });
  }
});

// Admin broadcast notification to all users
router.post('/admin/broadcast-notification', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { title, body } = req.body;
   
    if (!title || !body) {
      return res.status(400).json({
        message: 'Title and body are required'
      });
    }

    await sendNotificationToAllUsers(
      title,
      body,
      { type: 'broadcast', fromAdmin: true, timestamp: new Date().toISOString() }
    );

    res.json({
      message: 'Broadcast notification sent to all users'
    });
  } catch (error) {
    console.error('[FCM Broadcast] Error:', error);
    res.status(500).json({ message: 'Server error sending broadcast: ' + error.message });
  }
});


module.exports = router;