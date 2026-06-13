const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const fetch = require('node-fetch');

require('dotenv').config();

// Gmail configuration - HARDCODED VALUES
const GMAIL_CONFIG = {
  user: '6tynineinfo@gmail.com',
  pass: 'txkw lmga uoqz leci'
};

// FIXED: SINGLE MONGODB CONNECTION WITH CONNECTION POOLING
let isConnected = false;
let connectionPromise = null;
let connectionRetryCount = 0;
const MAX_RETRIES = 3;

const connectMongoDB = async () => {
  // If already connected, return the existing connection
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('[MongoDB] Using existing connection');
    return mongoose.connection;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    console.log('[MongoDB] Connection in progress, waiting...');
    return connectionPromise;
  }

  connectionPromise = new Promise(async (resolve, reject) => {
    try {
      console.log('[MongoDB] Creating new connection...');

      // Close any existing connections first to prevent multiple connections
      if (mongoose.connection.readyState !== 0) {
        console.log('[MongoDB] Closing existing connection...');
        await mongoose.disconnect();
      }

      const connectionOptions = {
        maxPoolSize: 10, // Maximum number of sockets in the connection pool
        minPoolSize: 5,  // Minimum number of sockets in the connection pool
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        bufferCommands: false,
        bufferMaxEntries: 0,
        useNewUrlParser: true,
        useUnifiedTopology: true,
      };

      console.log('[MongoDB] Connecting with options:', {
        maxPoolSize: connectionOptions.maxPoolSize,
        minPoolSize: connectionOptions.minPoolSize
      });

      await mongoose.connect(process.env.MONGO_URI, connectionOptions);
      
      isConnected = true;
      connectionRetryCount = 0;
      console.log('[MongoDB] ✅ Connected successfully to MongoDB Atlas');

      // Set up connection event handlers
      mongoose.connection.on('disconnected', () => {
        console.log('[MongoDB] ❌ Disconnected from database');
        isConnected = false;
        connectionPromise = null;
      });

      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB] Connection error:', err);
        isConnected = false;
        connectionPromise = null;
      });

      mongoose.connection.on('connected', () => {
        console.log('[MongoDB] ✅ Reconnected to database');
        isConnected = true;
      });

      // Ensure collections and indexes exist
      await ensureCollectionsAndIndexes();
      
      resolve(mongoose.connection);
    } catch (error) {
      console.error('[MongoDB] Connection failed:', error);
      isConnected = false;
      connectionPromise = null;
      connectionRetryCount++;
      
      if (connectionRetryCount < MAX_RETRIES) {
        console.log(`[MongoDB] Retrying connection in 5 seconds... (${connectionRetryCount}/${MAX_RETRIES})`);
        setTimeout(() => {
          connectMongoDB().then(resolve).catch(reject);
        }, 5000);
      } else {
        reject(error);
      }
    }
  });

  return connectionPromise;
};

// Helper function to ensure collections and indexes
const ensureCollectionsAndIndexes = async () => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const requiredCollections = [
      'posts', 'payoutrequests', 'transactions', 
      'subscriptions', 'livestreams', 'messages'
    ];

    for (const collectionName of requiredCollections) {
      if (!collectionNames.includes(collectionName)) {
        console.log(`[MongoDB] Creating collection: ${collectionName}`);
        await mongoose.connection.db.createCollection(collectionName);
      }
    }

    // Create indexes
    await User.createIndexes();
    await Post.createIndexes();
    await PayoutRequest.createIndexes();
    await Transaction.createIndexes();
    await Subscription.createIndexes();
    await LiveStream.createIndexes();
    await Message.createIndexes();

    console.log('[MongoDB] Collections and indexes verified');
  } catch (error) {
    console.error('[MongoDB] Error ensuring collections:', error);
  }
};

// Initialize connection at module load
connectMongoDB().catch(err => {
  console.error('[Startup] Failed to connect to MongoDB:', err);
  // Don't exit process, just log error - connection will be retried
});

// FIXED: Enhanced Nodemailer transporter with proper async initialization
let emailTransporter = null;
let isEmailInitialized = false;

const initializeEmailTransporter = async () => {
  console.log('[Email] 🔧 Initializing email transporter...');
  
  // Always use Gmail with hardcoded credentials
  console.log('[Email] Using Gmail service with hardcoded credentials');
  
  try {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_CONFIG.user,
        pass: GMAIL_CONFIG.pass,
      },
      secure: true,
      tls: {
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
    });

    console.log('[Email] Testing Gmail connection...');
    
    await new Promise((resolve, reject) => {
      emailTransporter.verify((error, success) => {
        if (error) {
          console.error('[Email] ❌ Gmail connection FAILED:', error);
          console.error('[Email] Error details:', error.code, error.command);
          console.error('[Email] Make sure you are using an App Password, not your regular Gmail password');
          emailTransporter = null;
          isEmailInitialized = false;
          reject(error);
        } else {
          console.log('[Email] ✅ Gmail transporter verified successfully!');
          console.log('[Email] From address:', GMAIL_CONFIG.user);
          isEmailInitialized = true;
          resolve(success);
        }
      });
    });
  } catch (error) {
    console.error('[Email] ❌ Email transporter initialization failed:', error);
    emailTransporter = null;
    isEmailInitialized = false;
    throw error;
  }
};

// Initialize email transporter immediately and wait for it
(async () => {
  try {
    await initializeEmailTransporter();
    if (isEmailInitialized) {
      console.log('[Email] ✅ Email system ready!');
    } else {
      console.log('[Email] ⚠️ Email system not available');
    }
  } catch (error) {
    console.log('[Email] ⚠️ Email system initialization failed on startup, will retry when needed');
  }
})();

// Helper function to extract hashtags from text
const extractHashtags = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/#(\w+)/gi)?.map(tag => tag.toLowerCase().replace(/^#/, '')) || []
  )];
};

// Helper function to extract user mentions from text
const extractUserMentions = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/@(\w+)/gi)?.map(mention => mention.toLowerCase().replace(/^@/, '')) || []
  )];
};

// Helper to get private chat channel name
const getChatChannel = (user1, user2) => {
  const sorted = [user1, user2].sort();
  return `private-${sorted[0]}-${sorted[1]}`;
};

// Helper function to search users by location
const searchUsersByLocation = async (locationQuery, limit = 50) => {
  try {
    console.log('[Location Helper] Searching users by location:', locationQuery);
    
    const searchRegex = new RegExp(locationQuery.toLowerCase(), 'i');
    
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(limit)
    .lean();

    return users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));
  } catch (error) {
    console.error('[Location Helper] Error:', error);
    return [];
  }
};

// FIXED: CORRECTED Helper function to ensure admin posts appear every 6 posts
const insertAdminPosts = (posts, adminPosts) => {
  if (!adminPosts || adminPosts.length === 0) {
    console.log('[AdminPosts] No admin posts to insert');
    return posts;
  }

  const result = [];
  let adminPostIndex = 0;
  let regularPostCount = 0;

  console.log('[AdminPosts] Starting insertion:', {
    regularPosts: posts.length,
    adminPosts: adminPosts.length,
    adminPostsSample: adminPosts.slice(0, 2)
  });

  // Insert admin post every 6th position (after every 5 regular posts)
  for (let i = 0; i < posts.length; i++) {
    // Skip if current post is already an admin post
    if (posts[i].isAdminPost) {
      continue;
    }
    
    // Add the current regular post
    result.push(posts[i]);
    regularPostCount++;

    // After every 5 regular posts, insert an admin post
    if (regularPostCount % 5 === 0 && adminPostIndex < adminPosts.length) {
      const adminPost = {
        ...adminPosts[adminPostIndex],
        isAdminPost: true,
        hasGoldenBadge: true,
        // Ensure all required fields are present
        id: adminPosts[adminPostIndex].id || `admin-${adminPostIndex}-${Date.now()}`,
        username: adminPosts[adminPostIndex].username || 'admin',
        timestamp: adminPosts[adminPostIndex].timestamp || new Date().toISOString(),
        likes: adminPosts[adminPostIndex].likes || [],
        comments: adminPosts[adminPostIndex].comments || [],
        views: adminPosts[adminPostIndex].views || 0
      };
      
      console.log(`[AdminPosts] Inserting admin post at position ${result.length + 1}:`, {
        username: adminPost.username,
        text: adminPost.text?.substring(0, 50)
      });
      
      result.push(adminPost);
      adminPostIndex++;
      
      // Cycle through admin posts if needed
      if (adminPostIndex >= adminPosts.length) {
        adminPostIndex = 0;
      }
    }
  }

  console.log('[AdminPosts] Insertion completed:', {
    originalPosts: posts.length,
    finalPosts: result.length,
    adminPostsInserted: adminPostIndex
  });
  
  return result;
};

// Helper function to get bank code
const getBankCode = async (bankName) => {
  const bankCodes = {
    'Access Bank': '044',
    'Zenith Bank': '057',
    'GTBank': '058',
  };
  return bankCodes[bankName] || '044';
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

  // Send FCM notifications to mentioned users
  try {
    if (userMentions && userMentions.length > 0) {
      const mentionedUsers = await User.find({
        username: { $in: userMentions },
        fcmTokens: { $exists: true, $ne: [] }
      }).select('fcmTokens username').lean();
     
      const mentionedTokens = mentionedUsers.flatMap(user => user.fcmTokens).filter(Boolean);
     
      if (mentionedTokens.length > 0) {
        await sendFCMNotification(
          mentionedTokens,
          `You were mentioned by ${username}!`,
          text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          {
            type: 'post_mention',
            username,
            postId: newPost.id.toString(),
            isPremium: isPremium.toString()
          }
        );
      }
    }

    // Send notifications to followers/subscribers
    if (isPremium) {
      const subscribers = await User.find({
        subscriptions: username,
        fcmTokens: { $exists: true, $ne: [] }
      }).select('fcmTokens username').lean();
     
      const subscriberTokens = subscribers.flatMap(sub => sub.fcmTokens).filter(Boolean);
     
      if (subscriberTokens.length > 0) {
        await sendFCMNotification(
          subscriberTokens,
          `New Premium Post from ${username}!`,
          text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          {
            type: 'premium_post',
            username,
            postId: newPost.id.toString(),
            isPremium: 'true'
          }
        );
      }
    } else {
      const allUsers = await User.find({
        username: { $ne: username },
        fcmTokens: { $exists: true, $ne: [] }
      }).select('fcmTokens').lean();
     
      const allTokens = allUsers.flatMap(u => u.fcmTokens).filter(Boolean);
     
      if (allTokens.length > 0) {
        await sendFCMNotification(
          allTokens,
          `New Post from ${username}!`,
          text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          {
            type: 'post',
            username,
            postId: newPost.id.toString(),
            isPremium: 'false'
          }
        );
      }
    }
  } catch (notificationError) {
    console.error('[FCM] Post notification failed (non-critical):', notificationError);
  }

  return newPost;
};

const calculateNextPaymentDate = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.getDate() <= 7 ? nextMonth : new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 7);
};

// Check subscription status
const checkSubscriptionStatus = async (subscriberUsername, targetUsername) => {
  const cacheKey = `sub_${subscriberUsername}_${targetUsername}`;
  let isSubscribed = subscriptionCache.get(cacheKey);
  if (isSubscribed !== undefined) {
    return isSubscribed;
  }

  try {
    const subscription = await Subscription.findOne({
      subscriberId: subscriberUsername,
      targetUserId: targetUsername,
      status: 'active',
    }).lean();
    isSubscribed = !!subscription;
    subscriptionCache.set(cacheKey, isSubscribed);
    return isSubscribed;
  } catch (error) {
    subscriptionCache.del(cacheKey);
    return false;
  }
};

// FIXED: Get accessible posts with admin posts inserted every 6 posts FOR ALL USERS
const getAccessiblePosts = async (username, requesterUsername) => {
  try {
    const user = await User.findOne({ username }).lean();
    if (!user) {
      throw new Error('User not found');
    }

    const publicPosts = await Post.find({ username, isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    const isProfileOwner = username === requesterUsername;
    const isSubscribed = !isProfileOwner && await checkSubscriptionStatus(requesterUsername, username);
    const hasPremiumContent = user.premiumContent && user.premiumContent.length > 0;

    let posts = [...publicPosts];

    if (isProfileOwner || isSubscribed) {
      if (hasPremiumContent) {
        const premiumPosts = user.premiumContent.map(post => ({
          ...post,
          isPremium: true,
          likes: post.likes || [],
          comments: post.comments || [],
          views: post.views || 0,
        }));
        posts = [...posts, ...premiumPosts];
      }
    }

    posts = posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (!isProfileOwner && !isSubscribed) {
      posts = posts.filter(post => !post.isPremium);
    }

    // FIXED: Get admin posts and insert them every 6 posts FOR ALL USERS
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    if (adminUsernames.length > 0) {
      const adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
      
      if (adminPosts.length > 0) {
        posts = insertAdminPosts(posts, adminPosts);
      }
    }

    return {
      posts,
      hasPremiumContent,
      isSubscribed,
      isProfileOwner,
      premiumPricing: user.premiumPricing,
      premiumPlans: user.premiumPlans,
    };
  } catch (error) {
    throw error;
  }
};

// Cancel subscription
const cancelSubscription = async (subscriberUsername, targetUsername, planCode) => {
  try {
    const subscription = await Subscription.findOne({
      subscriberId: subscriberUsername,
      targetUserId: targetUsername,
      planCode,
    });

    if (!subscription) {
      return { success: false, message: 'Subscription not found' };
    }

    if (subscription.paystackSubscriptionCode) {
      const response = await fetch(`https://api.paystack.co/subscription/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: subscription.paystackSubscriptionCode,
          token: subscription.reference,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, message: 'Failed to cancel Paystack subscription' };
      }
    }

    subscription.status = 'cancelled';
    await subscription.save();

    const subscriber = await User.findOne({ username: subscriberUsername });
    const targetUser = await User.findOne({ username: targetUsername });

    if (subscriber && targetUser) {
      subscriber.subscriptions = subscriber.subscriptions.filter(sub => sub !== targetUsername);
      targetUser.subscribers -= 1;
      targetUser.subscribersList = targetUser.subscribersList.filter(sub => sub !== subscriberUsername);
      await Promise.all([subscriber.save(), targetUser.save()]);
    }

    const cacheKey = `sub_${subscriberUsername}_${targetUsername}`;
    subscriptionCache.del(cacheKey);

    return { success: true, message: 'Subscription cancelled successfully' };
  } catch (error) {
    throw error;
  }
};

// FIXED: Graceful shutdown
const gracefulShutdown = async (signal) => {
  try {
    console.log(`[Graceful Shutdown] Received ${signal}. Closing MongoDB connection...`);
    
    // Set a timeout for graceful shutdown
    const shutdownTimeout = setTimeout(() => {
      console.log('[Graceful Shutdown] Force closing MongoDB connection...');
      process.exit(1);
    }, 10000);

    await mongoose.disconnect();
    clearTimeout(shutdownTimeout);
    
    console.log('[Graceful Shutdown] MongoDB disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('[Graceful Shutdown] Error during disconnect:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Notification helpers
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

    console.log(`[FCM] Sent to ${response.successCount} devices, failed: ${response.failureCount}`);

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

module.exports = {
  connectMongoDB,
  initializeEmailTransporter,
  extractHashtags,
  extractUserMentions,
  getChatChannel,
  searchUsersByLocation,
  insertAdminPosts,
  getBankCode,
  createPost,
  calculateNextPaymentDate,
  checkSubscriptionStatus,
  getAccessiblePosts,
  cancelSubscription,
  gracefulShutdown,
  sendFCMNotification,
  sendMessageNotification,
  emailTransporter,
  isEmailInitialized,
  GMAIL_CONFIG
};