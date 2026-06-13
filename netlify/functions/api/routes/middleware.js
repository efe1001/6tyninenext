const jwt = require('jsonwebtoken');
const { TokenExpiredError } = require('jsonwebtoken');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');

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

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.email && (!decoded._id || !decoded.username)) {
      return res.status(403).json({ message: 'Invalid token: Missing required fields' });
    }
    req.user = {
      _id: decoded._id || null,
      username: decoded.username || null,
      email: decoded.email || null,
      isAdmin: decoded.isAdmin || false
    };
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({
        message: 'Token expired',
        expired: true
      });
    }
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Middleware to update user online status
const updateOnlineStatus = (req, res, next) => {
  if (req.user && req.user.username) {
    updateUserOnlineStatus(req.user.username);
  }
  next();
};

// FIXED: Database connection check middleware
let lastPingTime = 0;
let lastPingResult = null;

const checkDbConnection = async (req, res, next) => {
  const now = Date.now();
  
  // Cache ping results for 30 seconds
  if (lastPingResult && now - lastPingTime < 30000) {
    return lastPingResult ? next() : res.status(503).json({ message: 'Database not connected' });
  }

  try {
    // Use existing connection if available
    if (mongoose.connection.readyState !== 1) {
      console.log('[DB Check] Connection not ready, reconnecting...');
      await connectMongoDB();
    }

    await mongoose.connection.db.command({ ping: 1 });
    lastPingResult = true;
    lastPingTime = now;
    next();
  } catch (error) {
    console.error('[DB Check] Database ping failed:', error);
    lastPingResult = false;
    lastPingTime = now;
    
    // Try to reconnect
    try {
      await connectMongoDB();
      next();
    } catch (reconnectError) {
      return res.status(503).json({ 
        message: 'Database connection error: ' + reconnectError.message,
        dbState: mongoose.connection.readyState,
      });
    }
  }
};

// Content Security Policy Middleware
const cspMiddleware = (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://checkout.paystack.com https://www.googletagmanager.com https://s3-eu-west-1.amazonaws.com 'unsafe-inline' 'sha256-VA8O2hAdooB288EpSTrGl7z3QikbWU9wwoebO/QaYk=' 'sha256-+5XkZFazzJo8n0iOP4ti/cLCMUudTf//Mzkb7xNPXIc=' https://www.gstatic.com/firebasejs; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.paystack.co https://www.googletagmanager.com https://*.supabase.co https://firestore.googleapis.com https://fcm.googleapis.com; " +
    "img-src 'self' data: https://*.supabase.co; " +
    "frame-src 'self' https://checkout.paystack.com; " +
    "media-src 'self' https://*.supabase.co;"
  );
  next();
};

// Helper to check phone number visibility
const shouldHidePhoneForUser = async (targetUsername, requesterUsername, visibilitySetting) => {
  try {
    if (!visibilitySetting) {
      visibilitySetting = 'all_users';
    }

    console.log(`[Phone Visibility Check] ${targetUsername} -> ${requesterUsername || 'unlogged'}: ${visibilitySetting}`);
    
    // CRITICAL FIX: If visibility is 'all_users', show to EVERYONE including unlogged users
    if (visibilitySetting === 'all_users') {
      console.log(`[Phone Visibility Check] 'all_users' - showing to everyone including unlogged users`);
      return false; // DON'T hide - show to everyone
    }
    
    // For other visibility settings, check if user is logged in
    if (!requesterUsername) {
      console.log(`[Phone Visibility Check] '${visibilitySetting}' - unlogged user, hiding`);
      return true; // Hide for unlogged users for other visibility settings
    }
    
    // Check for profile owner
    if (targetUsername === requesterUsername) {
      console.log(`[Phone Visibility Check] '${visibilitySetting}' - same user, showing`);
      return false;
    }
    
    // Check for admin
    const requesterUser = await User.findOne({ username: requesterUsername }).select('isAdmin').lean();
    if (requesterUser && requesterUser.isAdmin) {
      console.log(`[Phone Visibility Check] '${visibilitySetting}' - admin user, showing`);
      return false;
    }
    
    // Check specific visibility rules
    switch (visibilitySetting) {
      case 'subscribers_only':
        const isSubscribed = await checkSubscriptionStatus(requesterUsername, targetUsername);
        console.log(`[Phone Visibility Check] 'subscribers_only' - isSubscribed: ${isSubscribed}`);
        return !isSubscribed;
        
      case 'followers_only':
        const targetUser = await User.findOne({ username: targetUsername }).select('followers').lean();
        const isFollower = targetUser?.followers?.includes(requesterUsername) || false;
        console.log(`[Phone Visibility Check] 'followers_only' - isFollower: ${isFollower}`);
        return !isFollower;
        
      case 'non':
        console.log(`[Phone Visibility Check] 'non' - regular user, hiding`);
        return true;
        
      default:
        console.log(`[Phone Visibility Check] default case - hiding`);
        return true;
    }
  } catch (error) {
    console.error('[Phone Visibility Check] Error:', error);
    return true; // Default to hiding on error
  }
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: 'Validation error', errors: err.errors });
  }
  
  if (err.name === 'MongoServerError') {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ 
        message: `${field} already exists`, 
        field 
      });
    }
  }
  
  res.status(500).json({ message: 'Internal server error' });
};

module.exports = {
  authenticateToken,
  authenticateAdmin,
  updateOnlineStatus,
  updateUserOnlineStatus,
  updateUserOfflineStatus,
  shouldSendEmailNotification,
  checkDbConnection,
  cspMiddleware,
  shouldHidePhoneForUser,
  errorHandler
};