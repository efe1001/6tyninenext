// auth.js - COMPLETE VERSION WITH USER BIO AND COUNTRY/STATE DISPLAY

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { TokenExpiredError } = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const NodeCache = require('node-cache');
const fetch = require('node-fetch');
const crypto = require('crypto');
const Pusher = require('pusher');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

// DEBUG: Test route at the very top
router.get('/test', (req, res) => {
  res.json({ message: 'Auth router is working!', timestamp: new Date().toISOString() });
});

router.get('/api/auth/test', (req, res) => {
  res.json({ message: 'Full path test working!', timestamp: new Date().toISOString() });
});
// Add these imports at the top of auth.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Add Google OAuth configuration (after your other environment variables)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8082/api/auth/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('[Google OAuth] Profile received:', {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        provider: profile.provider
      });
      
      // Check if user exists by Google ID or email
      let user = await User.findOne({ 
        $or: [
          { 'google.id': profile.id },
          { email: profile.emails[0].value.toLowerCase() }
        ]
      });
      
      if (user) {
        // Update existing user's Google ID if not already set
        if (!user.google) {
          user.google = {
            id: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName
          };
          await user.save();
        }
        return done(null, user);
      }
      
      // Create new user with Google data
      const email = profile.emails[0].value.toLowerCase();
      const username = await generateUniqueUsername(profile.displayName || email.split('@')[0]);
      
      // Get max user ID
      const maxIdUser = await User.findOne().sort({ id: -1 }).select('id').lean();
      const newId = maxIdUser ? maxIdUser.id + 1 : 1;
      
      const newUser = new User({
        id: newId,
        username: username,
        email: email,
        name: profile.displayName,
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10), // Random password
        profilePicture: profile.photos?.[0]?.value || '',
        google: {
          id: profile.id,
          email: email,
          name: profile.displayName
        },
        isVerified: true,
        emailNotifications: true,
        userType: 'content_creator',
        numbersVisibility: 'all_users'
      });
      
      await newUser.save();
      return done(null, newUser);
      
    } catch (error) {
      console.error('[Google OAuth] Error:', error);
      return done(error, null);
    }
  }
));

// Helper function to generate unique username
async function generateUniqueUsername(baseName, attempt = 0) {
  let username = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
  
  if (attempt > 0) {
    username = `${username}${attempt}`;
  }
  
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return generateUniqueUsername(baseName, attempt + 1);
  }
  
  return username;
}

// Serialize/Deserialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Initialize Passport middleware
router.use(passport.initialize());

// Google OAuth Routes

// Initiate Google OAuth
router.get('/auth/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);




// Google OAuth Callback
router.get('/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${FRONTEND_URL}/login?error=google_auth_failed`,
    session: false 
  }),
  async (req, res) => {
    try {
      // Generate JWT token for the user
      const user = req.user;
      const expiresIn = 24 * 60 * 60;
      const token = jwt.sign(
        { 
          email: user.email, 
          _id: user._id, 
          username: user.username, 
          isAdmin: user.isAdmin 
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      // Redirect to frontend with token
      const redirectUrl = `${FRONTEND_URL}/auth/google/callback?token=${token}&username=${encodeURIComponent(user.username)}&expiresAt=${new Date(Date.now() + expiresIn * 1000).toISOString()}`;
      
      console.log('[Google OAuth] Success! Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('[Google OAuth Callback] Error:', error);
      res.redirect(`${FRONTEND_URL}/login?error=token_generation_failed`);
    }
  }
);

// Verify Google token (for mobile apps)
// =============================================
// GOOGLE OAUTH VERIFICATION ENDPOINT - SINGLE VERSION
// Place this AFTER CORS middleware but BEFORE other routes
// =============================================

// In auth.js - This is the correct Google verify endpoint (around line 220)
// Keep THIS ONE and delete the duplicate at the end
// =============================================
// GOOGLE OAUTH VERIFICATION ENDPOINT - KEEP THIS ONE
// =============================================

router.post('/google/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    console.log('[Google Verify] Received verification request');
    
    if (!idToken) {
      return res.status(400).json({ message: 'Google token required' });
    }
    
    // Verify the ID token with Google's API
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Verify] Token verification failed:', errorText);
      return res.status(400).json({ message: 'Invalid Google token' });
    }
    
    const payload = await response.json();
    console.log('[Google Verify] Token verified:', { 
      email: payload.email, 
      name: payload.name,
      sub: payload.sub
    });
    
    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google token: No email provided' });
    }
    
    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { 'google.id': payload.sub },
        { email: payload.email.toLowerCase() }
      ]
    });
    
    if (!user) {
      console.log('[Google Verify] Creating new user for:', payload.email);
      
      // Generate unique username from name or email
      let baseUsername = (payload.name || payload.email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
      
      let username = baseUsername;
      let counter = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }
      
      // Generate unique ID
      const maxIdUser = await User.findOne().sort({ id: -1 }).select('id').lean();
      const newId = maxIdUser ? maxIdUser.id + 1 : 1;
      
      // Generate random password for Google users
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      user = new User({
        id: newId,
        username: username,
        email: payload.email.toLowerCase(),
        name: payload.name || '',
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        password: hashedPassword,
        profilePicture: payload.picture || '',
        google: {
          id: payload.sub,
          email: payload.email,
          name: payload.name
        },
        isVerified: true,
        emailNotifications: true,
        userType: 'content_creator',
        numbersVisibility: 'all_users'
      });
      
      await user.save();
      console.log('[Google Verify] New user created:', username);
    } else {
      console.log('[Google Verify] Existing user found:', user.username);
      if (!user.google || !user.google.id) {
        user.google = {
          id: payload.sub,
          email: payload.email,
          name: payload.name
        };
        await user.save();
      }
    }
    
    // Generate JWT token
    const expiresIn = 24 * 60 * 60;
    const token = jwt.sign(
      { 
        email: user.email, 
        _id: user._id, 
        username: user.username, 
        isAdmin: user.isAdmin || false 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    console.log('[Google Verify] Login successful for:', user.username);
    
    res.json({
      token,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      username: user.username,
      message: 'Google login successful'
    });
    
  } catch (error) {
    console.error('[Google Verify] Error:', error);
    res.status(500).json({ message: 'Google authentication failed: ' + error.message });
  }
});


// Add this at the very top of auth.js after the imports
const cors = require('cors');

// Configure CORS for all environments
// Configure CORS for all environments - FIXED
// =============================================
// FIXED CORS CONFIGURATION - MUST BE AT THE VERY TOP
// =============================================

// Configure CORS for all environments
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests from these origins
    const allowedOrigins = [
      'https://6tynine.net',
      'https://www.6tynine.net',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'https://6tyninefansbackend2.netlify.app',
      undefined // Allow same-origin requests
    ];
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked origin:', origin);
      // For debugging - still allow but log
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200
};

// Apply CORS middleware BEFORE any routes
router.use(cors(corsOptions));

// Handle preflight requests for all routes
router.options('*', cors(corsOptions));

// Then add your routes after CORS

// DEBUG: Check environment variables
console.log('=== ENVIRONMENT VARIABLES DEBUG ===');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');
console.log('Email pass length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 'N/A');
console.log('====================================');

// Validate environment variables
if (!process.env.JWT_SECRET) {
  console.error('[Startup] JWT_SECRET is not set');
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error('[Startup] MONGO_URI is not set');
  process.exit(1);
}



// Gmail configuration - HARDCODED VALUES
const GMAIL_CONFIG = {
  user: '6tynineinfo@gmail.com',
  pass: 'txkw lmga uoqz leci'
};

console.log('[Email] Using hardcoded Gmail configuration:', {
  user: GMAIL_CONFIG.user,
  passLength: GMAIL_CONFIG.pass.length
});

// Pusher env validation
if (!process.env.PUSHER_APP_ID || !(process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY) || !process.env.PUSHER_SECRET || !(process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER)) {
  console.error('[Startup] Pusher environment variables are not set');
}

// Firebase Admin initialization for FCM
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY_PATH) {
  console.error('[Startup] Firebase env vars not set - FCM will be disabled');
} else {
  try {
    const keyPath = path.isAbsolute(process.env.FIREBASE_PRIVATE_KEY_PATH)
      ? process.env.FIREBASE_PRIVATE_KEY_PATH
      : path.join(__dirname, '..', process.env.FIREBASE_PRIVATE_KEY_PATH);
    const serviceAccount = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    console.log('[Startup] Firebase Admin initialized for FCM');
  } catch (error) {
    console.error('[Startup] Firebase Admin initialization failed:', error);
  }
}

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

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

// Helper to get private chat channel name
const getChatChannel = (user1, user2) => {
  const sorted = [user1, user2].sort();
  return `private-${sorted[0]}-${sorted[1]}`;
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
      // Small delay between batches
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

// FIXED: Enhanced email notification helper with user status checking
const sendEmailNotification = async (toEmail, toName, fromUsername, messageText, messageId) => {
  console.log(`[Email] 📧 sendEmailNotification called for: ${toEmail}`);
  
  // Wait for email initialization if not ready
  if (!isEmailInitialized) {
    console.log('[Email] ⏳ Email transporter not initialized yet, waiting...');
    try {
      await initializeEmailTransporter();
    } catch (error) {
      console.error('[Email] ❌ Failed to initialize email transporter:', error);
      return null;
    }
  }

  if (!emailTransporter || !isEmailInitialized) {
    console.error('[Email] ❌ TRANSPORTER NOT INITIALIZED - Cannot send email');
    return null;
  }

  // Validate required parameters
  if (!toEmail || !fromUsername || !messageText) {
    console.error('[Email] ❌ Missing required parameters:', {
      toEmail: !!toEmail,
      fromUsername: !!fromUsername,
      messageText: !!messageText
    });
    return null;
  }

  // Check if email is valid
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(toEmail)) {
    console.error(`[Email] ❌ Invalid email address: ${toEmail}`);
    return null;
  }

  console.log(`[Email] 📤 Preparing email to: ${toEmail}`);
  console.log(`[Email] From user: ${fromUsername}, Message preview: "${messageText.substring(0, 50)}..."`);

  try {
    const mailOptions = {
      from: {
        name: '6tyNine App',
        address: GMAIL_CONFIG.user
      },
      to: toEmail,
      subject: `💌 New Message from ${fromUsername} on 6tyNine`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Message on 6tyNine</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #FF6B00, #FF8C00); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .message-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #FF6B00; margin: 20px 0; border-radius: 5px; }
                .button { background: #FF6B00; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; }
                .footer { text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💌 New Message on 6tyNine!</h1>
                </div>
                <p>Hi <strong>${toName || 'there'}</strong>,</p>
                <p>You have received a new message from <strong>${fromUsername}</strong>:</p>
                <div class="message-box">"${messageText}"</div>
                <div style="text-align: center;">
                    <a href="#" class="button">💬 Reply to ${fromUsername}</a>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} 6tyNine App</p>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `New Message from ${fromUsername} on 6tyNine\n\nHi ${toName || 'there'},\n\nYou have received a new message from ${fromUsername}:\n\n"${messageText}"\n\nReply now in the app!\n\nThis is an automated message from 6tyNine.`
    };

    console.log(`[Email] 🚀 Sending email to ${toEmail}...`);
    
    const info = await emailTransporter.sendMail(mailOptions);
    
    console.log(`[Email] ✅ Email sent successfully to ${toEmail}`);
    console.log(`[Email] Message ID: ${info.messageId}`);
    console.log(`[Email] Response: ${info.response}`);
    
    return info;
  } catch (error) {
    console.error(`[Email] ❌ FAILED to send email to ${toEmail}:`, error);
    console.error(`[Email] Error code: ${error.code}`);
    console.error(`[Email] Error message: ${error.message}`);
    

    if (error.response) {
      console.error(`[Email] SMTP response: ${error.response}`);
    }
    
    return null;
  }
};



// =============================================
// DATABASE INDEXES FOR FAST QUERIES
// =============================================

// Create indexes for faster post queries
const createIndexes = async () => {
  try {
    console.log('[Indexes] Creating database indexes for performance...');
    
    // Post indexes
    await Post.collection.createIndex({ timestamp: -1 });
    await Post.collection.createIndex({ isPremium: 1 });
    await Post.collection.createIndex({ username: 1, timestamp: -1 });
    await Post.collection.createIndex({ isAdminPost: 1 });
    await Post.collection.createIndex({ hashtags: 1 });
    
    // User indexes
    await User.collection.createIndex({ username: 1 });
    await User.collection.createIndex({ email: 1 });
    await User.collection.createIndex({ createdAt: -1 });
    await User.collection.createIndex({ isAdmin: 1 });
    
    console.log('[Indexes] All indexes created successfully');
  } catch (error) {
    console.error('[Indexes] Error creating indexes:', error);
  }
};

// Call this after database connection
createIndexes();

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

// Apply online status middleware to relevant routes
router.use('/chats', updateOnlineStatus);
router.use('/pusher/auth', updateOnlineStatus);

// Content Security Policy Middleware
router.use((req, res, next) => {
// DELETE Paystack domains from these lines:
// "script-src 'self' https://checkout.paystack.com ..."
// "connect-src 'self' https://api.paystack.co ..."
// "frame-src 'self' https://checkout.paystack.com;"

// REPLACE with this (remove all Paystack URLs):
res.setHeader(
  'Content-Security-Policy',
  "default-src 'self'; " +
  "script-src 'self' https://www.googletagmanager.com https://s3-eu-west-1.amazonaws.com 'unsafe-inline' 'sha256-VA8O2hAdooB288EpSTrGl7z3QikbWU9wwoebO/QaYk=' 'sha256-+5XkZFazzJo8n0iOP4ti/cLCMUudTf//Mzkb7xNPXIc=' https://www.gstatic.com/firebasejs; " +
  "style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' https://www.googletagmanager.com https://*.supabase.co https://firestore.googleapis.com https://fcm.googleapis.com; " +
  "img-src 'self' data: https://*.supabase.co; " +
  "frame-src 'self'; " +
  "media-src 'self' https://*.supabase.co;"
);
  next();
});

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

router.use(checkDbConnection);

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only JPEG and PNG images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Helper function to extract hashtags from text
const extractHashtags = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/#(\w+)/gi)?.map(tag => tag.toLowerCase().replace(/^#/, '')) || []
  )];
};

// NEW: Helper function to extract user mentions from text
const extractUserMentions = (text) => {
  if (!text) return [];
  return [...new Set(
    text.match(/@(\w+)/gi)?.map(mention => mention.toLowerCase().replace(/^@/, '')) || []
  )];
};

// FIXED: CORRECTED Helper function to ensure admin posts appear every 6 posts
// FIXED: More aggressive admin post insertion
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



// Schemas
const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'],
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please use a valid email address'],
  },
  password: { type: String, required: true },
  name: String,
  firstName: String,
  lastName: String,
  gender: String,
  age: String,
  location: String,
  city: String,
  country: String,
  state: String,
  postalCode: String,
  phoneNumber: String,
  numbersVisibility: { 
    type: String, 
    enum: ['all_users', 'subscribers_only', 'followers_only', 'non'], 
    default: 'all_users'
  },
  website: {
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },
  profilePicture: String,
  images: [String],
  videos: [String],
  createdAt: { type: Date, default: Date.now },
  subscribers: { type: Number, default: 0 },
  subscribersList: [String],
  posts: [{
    id: Number,
    text: String,
    username: String,
    timestamp: String,
    images: [String],
    videos: [String],
    likes: [String],
    comments: [{ id: String, username: String, text: String, timestamp: String }],
    views: Number,
    isPremium: { type: Boolean, default: false },
    hashtags: [String],
    userMentions: [String],
    isAdminPost: { type: Boolean, default: false },
    hasGoldenBadge: { type: Boolean, default: false },
  }],
  premiumContent: [{
    id: String,
    text: String,
    username: String,
    timestamp: String,
    images: [String],
    videos: [String],
    likes: [String],
    comments: [{
      id: String,
      username: String,
      text: String,
      timestamp: String
    }],
    views: { type: Number, default: 0 },
    hashtags: [String],
    userMentions: [String],
    isAdminPost: { type: Boolean, default: false },
    hasGoldenBadge: { type: Boolean, default: false },
  }],
  followers: [String],
  following: [String],
  premiumPricing: {
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 },
    yearly: { type: Number, default: 0 },
  },
  premiumPlans: [{ interval: String, planCode: String }],
  subscriptions: [String],
  bio: String,
  isAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  bankName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  coinBalance: { type: Number, default: 0 }, // NEW: Coin balance field
  messagesFromPremiumOnly: { type: Boolean, default: false },
  userType: { 
    type: String, 
    enum: ['content_creator', 'escort', 'both'], 
    default: 'content_creator' 
  },
  payoutRequests: [{
    id: String,
    amount: Number,
    bankName: String,
    accountNumber: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    adminNote: { type: String, default: '' },
  }],
  fcmTokens: [{ type: String, default: [] }],
  emailNotifications: { type: Boolean, default: true },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  google: {
    id: String,
    email: String,
    name: String,
  },
}, { collation: { locale: 'en', strength: 2 } });

// Create indexes for faster queries
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ coinBalance: 1 }); // Index for coin balance queries

userSchema.index({ username: 1, email: 1 });
const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  text: String,
  username: String,
  timestamp: { type: String, default: () => new Date().toISOString(), index: true },
  images: [String],
  videos: [String],
  likes: [String],
  comments: [{ id: String, username: String, text: String, timestamp: String }],
  views: { type: Number, default: 0 },
  isPremium: { type: Boolean, default: false },
  hashtags: [{ type: String, lowercase: true }],
  userMentions: [{ type: String, lowercase: true }], // NEW: Add user mentions to post schema
  isAdminPost: { type: Boolean, default: false }, // NEW: Admin post flag
  hasGoldenBadge: { type: Boolean, default: false }, // NEW: Golden badge for admin
  isBoosted: { type: Boolean, default: false },
  boostExpiresAt: { type: Date, default: null },
  boostPriority: { type: Number, default: 0 },
});

postSchema.index({ id: 1, username: 1, timestamp: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ userMentions: 1 }); // NEW: Index for user mentions
const Post = mongoose.model('Post', postSchema);

// REPLACE your existing subscriptionSchema with this:
const subscriptionSchema = new mongoose.Schema({
  id: String,
  subscriberId: String,
  targetUserId: String,
  planCode: String,
  status: { type: String, default: 'active' }, // active, cancelled, expired
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  cancelledAt: Date,
  expiresAt: Date, // ADD THIS FIELD
  reference: String,
  amount: Number,
  currency: String,
  recurring: { type: String, default: '' },
  schedule: { type: String, default: '' },
  nextPaymentDate: { type: Date, default: null },
});

subscriptionSchema.index({ subscriberId: 1, targetUserId: 1 });
const Subscription = mongoose.model('Subscription', subscriptionSchema);

const payoutRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  bankName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  adminNote: { type: String, default: '' },
});

payoutRequestSchema.index({ userId: 1, status: 1 });
const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);

const transactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['earning', 'payout', 'topup', 'wallet_deduction', 'coin_purchase', 'coin_sale', 'coin_conversion', 'coin_deduction'], 
    default: 'completed' 
  },
  amount: { type: Number, required: true },
  description: { type: String },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'rejected'], default: 'completed' },
  createdAt: { type: Date, default: Date.now },
  relatedId: { type: String },
});



transactionSchema.index({ userId: 1, createdAt: -1 });
const Transaction = mongoose.model('Transaction', transactionSchema);

const liveStreamSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  title: { type: String, required: true },
  roomId: { type: String, required: true },
  visibility: { type: String, enum: ['public', 'premium_only'], default: 'public' },
  status: { type: String, enum: ['pending', 'live', 'ended'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  videoUrl: String,
});

liveStreamSchema.index({ username: 1, status: 1 });
liveStreamSchema.index({ roomId: 1 });
const LiveStream = mongoose.model('LiveStream', liveStreamSchema);

// Add this schema definition after other schemas (around line 440-480)
const blogPostSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  excerpt: { type: String, default: '' },
  author: { type: String, required: true },
  authorUsername: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['getting-started', 'account-management', 'premium-content', 'live-streaming', 'payments-earnings', 'privacy-safety', 'technical-support', 'announcements', 'tips-tricks'],
    default: 'announcements'
  },
  tags: [{ type: String }],
  featuredImage: { type: String, default: '' },
  isPublished: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  readTime: { type: Number, default: 5 }, // in minutes
  views: { type: Number, default: 0 },
  likes: [{ type: String }], // usernames who liked
  comments: [{
    id: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isAdminReply: { type: Boolean, default: false },
    replies: [{
      id: { type: String, required: true },
      username: { type: String, required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      isAdminReply: { type: Boolean, default: false }
    }]
  }],
  metaTitle: { type: String },
  metaDescription: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date }
});

blogPostSchema.index({ slug: 1, isPublished: 1, category: 1, createdAt: -1 });
blogPostSchema.index({ authorUsername: 1 });
blogPostSchema.index({ tags: 1 });
const BlogPost = mongoose.model('BlogPost', blogPostSchema);

const messageSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  text: { type: String, required: true },
  images: [{ type: String }],
  videos: [{ type: String }],
  timestamp: { type: Date, default: Date.now, index: true },
  read: { type: Boolean, default: false }
});

messageSchema.index({ sender: 1, recipient: 1, timestamp: -1 });
const Message = mongoose.model('Message', messageSchema);

// Gift Schema
const giftSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  postId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  senderUsername: { type: String, required: true, index: true },
  recipientId: { type: String, required: true },
  recipientUsername: { type: String, required: true, index: true },
  giftId: { type: String, required: true },
  giftName: { type: String, required: true },
  giftIcon: { type: String, required: true },
  price: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

giftSchema.index({ postId: 1 });
giftSchema.index({ recipientId: 1 });
giftSchema.index({ senderId: 1 });

const Gift = mongoose.models.Gift || mongoose.model('Gift', giftSchema);

// =============================================
// Add this after your existing adminActivitySchema definition
// Make sure the enum includes ALL activity types
// Admin Activity Schema - for tracking all admin actions
const adminActivitySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    required: true,
    enum: [
      'boost_created', 'boost_removed', 'boost_expired', 'post_deleted', 'post_edited',
      'post_created', 'premium_post_created', 'user_updated', 'user_deleted', 'user_registered',
      'payout_approved', 'payout_rejected', 'payout_requested', 'broadcast_sent', 'funds_added', 
      'subscription_created', 'payment_received', 'gift_sent', 'new_follower'
    ]
  },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  adminUser: { type: String, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now, index: true }
});

adminActivitySchema.index({ type: 1, timestamp: -1 });
adminActivitySchema.index({ adminUser: 1 });
adminActivitySchema.index({ timestamp: -1 });

const AdminActivity = mongoose.model('AdminActivity', adminActivitySchema);



// Boost Schema
const boostSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  postId: { type: mongoose.Schema.Types.Mixed, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  username: { type: String, required: true },
  durationDays: { type: Number, required: true },
  targetAudience: { type: String, required: true },
  price: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  paymentGateway: { type: String, default: '' },
  transactionReference: { type: String, default: '' },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  priority: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  cancelledAt: { type: Date }
});

boostSchema.index({ postId: 1, status: 1, expiresAt: 1 });
boostSchema.index({ userId: 1, status: 1 });
boostSchema.index({ username: 1, createdAt: -1 });

const Boost = mongoose.model('Boost', boostSchema);

const JWT_SECRET = process.env.JWT_SECRET;
const KORA_PUBLIC_KEY = process.env.KORA_PUBLIC_KEY || 'pk_live_d2iNTQyBXJVkaHmS2YkMUcg5WQzWfBs1cWJxg9zu';
const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;
const KORA_ENCRYPTION_KEY = process.env.KORA_ENCRYPTION_KEY || 'wNdAPm2f9iXca9ZvQfNhgfe67xJcSsaB';
const KORA_API_URL = 'https://api.korapay.com';  // ← CORRECT URL
const EXCHANGE_RATE = 1464.64;



// KORA PAYMENT FUNCTIONS
const initializeKoraPayment = async (amount, email, reference, metadata) => {
  try {
    const response = await fetch(`${KORA_API_URL}/payments/initialize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KORA_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_key: KORA_PUBLIC_KEY,
        amount: Math.round(amount), // amount in kobo/cents
        customer: {
          email: email,
          name: metadata?.customerName || 'User'
        },
        reference: reference,
        metadata: metadata,
        currency: 'NGN'
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Payment initialization failed');
    }

    return data;
  } catch (error) {
    console.error('[Kora] Initialize payment error:', error);
    throw error;
  }
};

const verifyKoraPayment = async (reference) => {
  try {
    console.log(`[Kora] Verifying payment for reference: ${reference}`);
    console.log(`[Kora] Using URL: ${KORA_API_URL}/payments/verify/${reference}`);
    
    const response = await fetch(`${KORA_API_URL}/payments/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KORA_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('[Kora] Verification response status:', response.status);
    console.log('[Kora] Verification response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      throw new Error(data.message || 'Payment verification failed');
    }
    
    // Check different response structures that Kora might return
    if (data.status === 'success' || data.data?.status === 'success') {
      return data;
    }
    
    throw new Error(data.message || 'Payment verification failed');
  } catch (error) {
    console.error('[Kora] Verify payment error:', error);
    throw error;
  }
};
// Initialize cache
const cache = new NodeCache({ stdTTL: 300 });
const subscriptionCache = new NodeCache({ stdTTL: 300 });

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
    userMentions: Array.isArray(userMentions) ? userMentions : extractUserMentions(text), // NEW: Add user mentions
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
// FIXED: Get accessible posts with proper profile owner check
// In auth.js, update the getAccessiblePosts function:
// Update the getAccessiblePosts function to fetch boost info for each post
const getAccessiblePosts = async (username, requesterUsername) => {
  try {
    const user = await User.findOne({ username }).lean();
    if (!user) {
      throw new Error('User not found');
    }

    // Check if requester is admin
    let isAdmin = false;
    if (requesterUsername) {
      const requesterUser = await User.findOne({ username: requesterUsername }).select('isAdmin').lean();
      isAdmin = requesterUser?.isAdmin || false;
    }

    // Get regular posts from posts collection
    const publicPosts = await Post.find({ username, isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    // CRITICAL: Get active boost info for ALL posts
    const activeBoosts = await Boost.find({
      username: username,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).lean();

    // Create a map of postId -> boost info
    const boostMap = {};
    activeBoosts.forEach(boost => {
      boostMap[boost.postId.toString()] = {
        isBoosted: true,
        boostInfo: {
          id: boost.id,
          durationDays: boost.durationDays,
          targetAudience: boost.targetAudience,
          expiresAt: boost.expiresAt,
          priority: boost.priority
        }
      };
    });

    // Add boost info to each post
    const postsWithBoostInfo = publicPosts.map(post => {
      const postIdStr = post.id?.toString() || post._id?.toString();
      const boostData = boostMap[postIdStr] || {};
      
      return {
        ...post,
        isBoosted: boostData.isBoosted || false,
        boostInfo: boostData.boostInfo || null,
        boostPriority: boostData.boostInfo?.priority || 0
      };
    });

    let posts = [...postsWithBoostInfo];
    
    const isProfileOwner = requesterUsername === username;
    let isSubscribed = false;
    
    if (!isProfileOwner && !isAdmin && requesterUsername) {
      isSubscribed = await checkSubscriptionStatus(requesterUsername, username);
    }

    if (isProfileOwner || isAdmin || isSubscribed) {
      if (user.premiumContent && user.premiumContent.length > 0) {
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

    // Get admin posts
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
      hasPremiumContent: (user.premiumContent && user.premiumContent.length > 0),
      isSubscribed: isSubscribed || isProfileOwner || isAdmin,
      isProfileOwner,
      premiumPricing: user.premiumPricing,
      premiumPlans: user.premiumPlans,
    };
  } catch (error) {
    console.error('[getAccessiblePosts] Error:', error);
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

// Helper function to get bank code
const getBankCode = async (bankName) => {
  const bankCodes = {
    'Access Bank': '044',
    'Zenith Bank': '057',
    'GTBank': '058',
  };
  return bankCodes[bankName] || '044';
};

// =============================================
// FIXED LIKE ROUTES - PROPERLY WORKING
// =============================================
// =============================================
// SIMPLE VIEW COUNTING ENDPOINTS - MUST BE FIRST
// Place these at the very top of your routes, right after the middleware
// =============================================

// Public view count (for unlogged users)
// =============================================
// VIEW COUNTING ENDPOINTS - SINGLE CLEAN VERSION
// Place these at the VERY TOP of your routes, before any other routes
// =============================================

// Public view count for regular posts (unlogged users)
// =============================================
// SIMPLE VIEW COUNTING ENDPOINTS - CLEAN VERSION
// =============================================




// =============================================
// SIMPLE VIEW COUNTING ENDPOINTS - WORKING VERSION
// =============================================

// Public view count for regular posts (unlogged users)
// =============================================
// PUBLIC VIEW COUNTING ENDPOINTS - MUST BE FIRST
// =============================================

// Public view count for regular posts (unlogged users)
// =============================================
// PUBLIC VIEW COUNTING ENDPOINTS - MUST BE FIRST
// =============================================












// =============================================
// GET POST BY ID - MUST BE BEFORE COMMENT ROUTES
// =============================================

// Get a single post by ID (works for both posts collection and user posts)
router.get('/posts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number(id);
    
    console.log('[Get Post] Looking for post with ID:', id);
    
    // Method 1: Try posts collection first
    let post = await Post.findOne({ 
      $or: [
        { id: numericId },
        { id: id }
      ]
    }).lean();
    
    if (post) {
      console.log('[Get Post] Found in posts collection');
      return res.json(post);
    }
    
    // Method 2: Search in all users' posts arrays
    const allUsers = await User.find({}).select('username posts profilePicture').lean();
    
    for (const user of allUsers) {
      if (user.posts && Array.isArray(user.posts)) {
        const userPost = user.posts.find(p => 
          p.id === numericId || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        
        if (userPost) {
          console.log('[Get Post] Found in user posts:', user.username);
          const fullPost = {
            ...userPost,
            username: user.username,
            userProfilePicture: user.profilePicture,
            likes: userPost.likes || [],
            comments: userPost.comments || [],
            views: userPost.views || 0,
            images: userPost.images || [],
            videos: userPost.videos || [],
            hashtags: userPost.hashtags || [],
            userMentions: userPost.userMentions || [],
            isPremium: userPost.isPremium || false,
            isAdminPost: userPost.isAdminPost || false,
            hasGoldenBadge: userPost.hasGoldenBadge || false
          };
          return res.json(fullPost);
        }
      }
    }
    
    return res.status(404).json({ message: 'Post not found' });
    
  } catch (error) {
    console.error('[Get Post] Error:', error);
    res.status(500).json({ message: 'Server error fetching post: ' + error.message });
  }
});


// Comment on post - COMPLETELY FIXED to return full post with comments
// =============================================
// FIXED COMMENT ROUTES - MUST RETURN COMMENTS ARRAY
// =============================================

// Comment on regular post - FIXED to return FULL post with comments
// =============================================
// COMPLETELY FIXED COMMENT ROUTE - RETURNS FULL POST WITH COMMENTS
// =============================================

// Comment on regular post - FIXED to return FULL post with comments
router.post('/posts/:postId/comment', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required and must be a non-empty string' });
    }

    const comment = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    let updatedPost = null;
    let found = false;

    // METHOD 1: Try to find in posts collection
    let post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      post = await Post.findOne({ id: postId });
    }
    
    if (post && !post.isPremium) {
      post.comments.push(comment);
      await post.save();
      updatedPost = post.toObject();
      updatedPost.comments = post.comments;
      found = true;
      console.log('[Comment] Added to posts collection, comments now:', post.comments.length);
    }

    // METHOD 2: Search in users' posts arrays
    if (!found) {
      const allUsers = await User.find({}).select('username posts profilePicture').lean();
      
      for (const user of allUsers) {
        if (!user.posts || !Array.isArray(user.posts)) continue;
        
        const postIndex = user.posts.findIndex(p => 
          p.id === Number(postId) || 
          p.id?.toString() === postId || 
          p._id?.toString() === postId
        );
        
        if (postIndex !== -1 && !user.posts[postIndex].isPremium) {
          // Add comment to user's post
          await User.updateOne(
            { username: user.username },
            { $push: { [`posts.${postIndex}.comments`]: comment } }
          );
          
          // Fetch the updated user to get the post with new comment
          const updatedUser = await User.findOne({ username: user.username }).lean();
          updatedPost = { ...updatedUser.posts[postIndex] };
          updatedPost.username = user.username;
          updatedPost.userProfilePicture = user.profilePicture;
          updatedPost.comments = updatedPost.comments || [];
          found = true;
          console.log('[Comment] Added to user posts:', user.username, 'comments now:', updatedPost.comments.length);
          break;
        }
      }
    }

    if (!found || !updatedPost) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Send notification to post owner about comment
    if (updatedPost.username !== username) {
      try {
        await sendNotificationToUser(
          updatedPost.username,
          'New Comment!',
          `${username} commented on your post: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          { type: 'post_comment', postId: postId, commenter: username }
        );
      } catch (notifError) {
        console.log('[FCM] Comment notification failed (non-critical):', notifError);
      }
    }
    
    // CRITICAL: Return the FULL post object with the updated comments array
    console.log('[Comment] Returning post with', updatedPost.comments?.length || 0, 'comments');
    res.json(updatedPost);
    
  } catch (error) {
    console.error('[Comment Post] Error:', error);
    res.status(500).json({ message: 'Server error commenting on post: ' + error.message });
  }
});



// Comment on premium post - FIXED to return FULL post with comments
router.post('/premium-posts/:postId/comment', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required and must be a non-empty string' });
    }

    const postOwner = await User.findOne({ 'premiumContent.id': postId });
    if (!postOwner) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const premiumPost = postOwner.premiumContent.find((p) => p.id === postId);
    if (!premiumPost) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const isProfileOwner = postOwner.username === username;
    const isSubscribed = await checkSubscriptionStatus(username, postOwner.username);

    if (!isProfileOwner && !isSubscribed) {
      return res.status(403).json({ message: 'Must be subscribed or profile owner to comment on premium post' });
    }

    const comment = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    premiumPost.comments.push(comment);
    await postOwner.save();
    
    // Send notification to post owner about comment
    if (postOwner.username !== username) {
      try {
        await sendNotificationToUser(
          postOwner.username,
          'New Comment!',
          `${username} commented on your premium post: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          { type: 'premium_post_comment', postId: postId, commenter: username }
        );
      } catch (notifError) {
        console.log('[FCM] Premium post comment notification failed (non-critical):', notifError);
      }
    }
    
    // CRITICAL FIX: Return the FULL premium post with the updated comments array
    const updatedPremiumPost = { 
      ...premiumPost, 
      comments: premiumPost.comments 
    };
    
    console.log('[Comment Premium] Returning premium post with', updatedPremiumPost.comments.length, 'comments');
    res.json(updatedPremiumPost);
    
  } catch (error) {
    console.error('[Comment Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error commenting on premium post: ' + error.message });
  }
});

// Delete comment
router.delete('/posts/:postId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
      const { postId, commentId } = req.params;
      const { username } = req.body;

      if (!postId || !commentId) {
          return res.status(400).json({ message: 'Post ID and Comment ID are required' });
      }

      if (!username) {
          return res.status(400).json({ message: 'Username is required' });
      }

      const post = await Post.findOne({ id: Number(postId) });
      if (!post) {
          return res.status(404).json({ message: 'Post not found' });
      }

      const user = await User.findOne({ username, email: req.user.email });
      if (!user) {
          return res.status(403).json({ message: 'Unauthorized or user not found' });
      }

      const comment = post.comments.find((c) => c.id === commentId);
      if (!comment) {
          return res.status(404).json({ message: 'Comment not found' });
      }

      if (comment.username !== username && post.username !== username) {
          return res.status(403).json({ message: 'Unauthorized to delete this comment' });
      }

      post.comments = post.comments.filter((c) => c.id !== commentId);
      await post.save();
      res.json(post);
  } catch (error) {
      console.error('[Delete Comment] Error:', error);
      res.status(500).json({ message: 'Server error deleting comment: ' + error.message });
  }
});
// Comment on premium post - FIXED to return updated comments
// Comment on premium post - COMPLETELY FIXED to return full premium post with comments
// Comment on premium post - FIXED to return FULL post with comments
router.post('/premium-posts/:postId/comment', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required and must be a non-empty string' });
    }

    const postOwner = await User.findOne({ 'premiumContent.id': postId });
    if (!postOwner) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const premiumPost = postOwner.premiumContent.find((p) => p.id === postId);
    if (!premiumPost) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const isProfileOwner = postOwner.username === username;
    const isSubscribed = await checkSubscriptionStatus(username, postOwner.username);

    if (!isProfileOwner && !isSubscribed) {
      return res.status(403).json({ message: 'Must be subscribed or profile owner to comment on premium post' });
    }

    const comment = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    premiumPost.comments.push(comment);
    await postOwner.save();
    
    // Send notification to post owner about comment
    if (postOwner.username !== username) {
      try {
        await sendNotificationToUser(
          postOwner.username,
          'New Comment!',
          `${username} commented on your premium post: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          { type: 'premium_post_comment', postId: postId, commenter: username }
        );
      } catch (notifError) {
        console.log('[FCM] Premium post comment notification failed (non-critical):', notifError);
      }
    }
    
    // CRITICAL FIX: Return the FULL premium post with the updated comments array
    const updatedPremiumPost = { 
      ...premiumPost, 
      comments: premiumPost.comments 
    };
    
    console.log('[Comment Premium] Returning premium post with', updatedPremiumPost.comments.length, 'comments');
    res.json(updatedPremiumPost);
    
  } catch (error) {
    console.error('[Comment Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error commenting on premium post: ' + error.message });
  }
});



// Get a single post by ID (works for both posts collection and user posts)
router.get('/api/auth/posts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number(id);
    
    console.log('[Get Post] Looking for post with ID:', id);
    
    // Method 1: Try posts collection first
    let post = await Post.findOne({ 
      $or: [
        { id: numericId },
        { id: id }
      ]
    }).lean();
    
    if (post) {
      console.log('[Get Post] Found in posts collection');
      return res.json(post);
    }
    
    // Method 2: Search in all users' posts arrays
    const allUsers = await User.find({}).select('username posts profilePicture').lean();
    
    for (const user of allUsers) {
      if (user.posts && Array.isArray(user.posts)) {
        const userPost = user.posts.find(p => 
          p.id === numericId || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        
        if (userPost) {
          console.log('[Get Post] Found in user posts:', user.username);
          const fullPost = {
            ...userPost,
            username: user.username,
            userProfilePicture: user.profilePicture,
            likes: userPost.likes || [],
            comments: userPost.comments || [],
            views: userPost.views || 0,
            images: userPost.images || [],
            videos: userPost.videos || [],
            hashtags: userPost.hashtags || [],
            userMentions: userPost.userMentions || [],
            isPremium: userPost.isPremium || false,
            isAdminPost: userPost.isAdminPost || false,
            hasGoldenBadge: userPost.hasGoldenBadge || false
          };
          return res.json(fullPost);
        }
      }
    }
    
    return res.status(404).json({ message: 'Post not found' });
    
  } catch (error) {
    console.error('[Get Post] Error:', error);
    res.status(500).json({ message: 'Server error fetching post: ' + error.message });
  }
});

// =============================================
// PUBLIC VIEW COUNTING ENDPOINTS - MUST BE AT THE VERY TOP
// =============================================
// =============================================
// PUBLIC VIEW COUNTING ENDPOINTS - SIMPLIFIED
// Place these AFTER the middleware section, BEFORE any other routes
// =============================================

// Public view count for regular posts
// Public view count for regular posts (unlogged users)
router.post('/public/posts/:postId/views', async (req, res) => {
  try {
    const { postId } = req.params;
    console.log(`[Public View] Counting view for post: ${postId}`);
    
    const numericPostId = Number(postId);
    
    // Try to find in posts collection first using numeric id
    let post = await Post.findOne({ id: numericPostId });
    
    if (post && !post.isPremium) {
      // Increment view count
      const newViews = (post.views || 0) + 1;
      post.views = newViews;
      await post.save();
      
      // Also update user's post array
      const user = await User.findOne({ username: post.username });
      if (user && user.posts) {
        const userPostIndex = user.posts.findIndex(p => p.id === numericPostId);
        if (userPostIndex !== -1) {
          user.posts[userPostIndex].views = newViews;
          await user.save();
        }
      }
      
      console.log(`[Public View] Post ${postId} now has ${newViews} views`);
      return res.status(200).json({ views: newViews });
    }
    
    // If not found, search in users' posts arrays
    const allUsers = await User.find({}).select('username posts').lean();
    for (const user of allUsers) {
      if (user.posts && Array.isArray(user.posts)) {
        const userPost = user.posts.find(p => p.id === numericPostId);
        if (userPost && !userPost.isPremium) {
          const newViews = (userPost.views || 0) + 1;
          await User.updateOne(
            { username: user.username, 'posts.id': numericPostId },
            { $inc: { 'posts.$.views': 1 } }
          );
          console.log(`[Public View] Post ${postId} in user ${user.username} now has ${newViews} views`);
          return res.status(200).json({ views: newViews });
        }
      }
    }
    
    console.log(`[Public View] Post not found: ${postId}`);
    return res.status(404).json({ message: 'Post not found' });
  } catch (error) {
    console.error('[Public View] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Authenticated view count endpoint
router.post('/posts/:postId/views', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    console.log(`[Auth View] Counting view for post: ${postId}, user: ${req.user.username}`);
    
    const numericPostId = Number(postId);
    
    let post = await Post.findOne({ id: numericPostId });
    
    if (post && !post.isPremium) {
      const newViews = (post.views || 0) + 1;
      post.views = newViews;
      await post.save();
      
      const user = await User.findOne({ username: post.username });
      if (user && user.posts) {
        const userPostIndex = user.posts.findIndex(p => p.id === numericPostId);
        if (userPostIndex !== -1) {
          user.posts[userPostIndex].views = newViews;
          await user.save();
        }
      }
      
      return res.status(200).json({ views: newViews });
    }
    
    // Search in users' posts
    const allUsers = await User.find({}).select('username posts').lean();
    for (const user of allUsers) {
      if (user.posts && Array.isArray(user.posts)) {
        const userPost = user.posts.find(p => p.id === numericPostId);
        if (userPost && !userPost.isPremium) {
          const newViews = (userPost.views || 0) + 1;
          await User.updateOne(
            { username: user.username, 'posts.id': numericPostId },
            { $inc: { 'posts.$.views': 1 } }
          );
          return res.status(200).json({ views: newViews });
        }
      }
    }
    
    return res.status(404).json({ message: 'Post not found' });
  } catch (error) {
    console.error('[Auth View] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});



// Public view count for premium posts
router.post('/public/premium-posts/:postId/views', async (req, res) => {
  try {
    const { postId } = req.params;
    console.log(`[Public Premium View] Counting view for premium post: ${postId}`);
    
    const users = await User.find({ 'premiumContent.id': postId });
    for (const user of users) {
      const premiumPost = user.premiumContent.find(p => p.id === postId);
      if (premiumPost) {
        const newViews = (premiumPost.views || 0) + 1;
        premiumPost.views = newViews;
        await user.save();
        console.log(`[Public Premium View] Premium post ${postId} now has ${newViews} views`);
        return res.status(200).json({ views: newViews });
      }
    }
    
    console.log(`[Public Premium View] Premium post not found: ${postId}`);
    return res.status(404).json({ message: 'Premium post not found' });
  } catch (error) {
    console.error('[Public Premium View] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});











//here

// FIXED: Like post route with proper toggle functionality
router.post('/posts/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    console.log(`[Like Post] User ${username} liking post ${postId}`);

    const post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user already liked the post
    const alreadyLiked = post.likes.includes(username);
    
    if (alreadyLiked) {
      // Unlike: remove user from likes array
      post.likes = post.likes.filter(like => like !== username);
      console.log(`[Like Post] User ${username} unliked post ${postId}`);
    } else {
      // Like: add user to likes array
      post.likes.push(username);
      console.log(`[Like Post] User ${username} liked post ${postId}`);
    }

    await post.save();

    // Update user's post as well for consistency
    const user = await User.findOne({ username: post.username });
    if (user) {
      const userPost = user.posts.find(p => p.id === Number(postId));
      if (userPost) {
        if (alreadyLiked) {
          userPost.likes = userPost.likes.filter(like => like !== username);
        } else {
          userPost.likes.push(username);
        }
        await user.save();
      }
    }

    // Send notification to post owner about like (only for new likes)
    if (!alreadyLiked && post.username !== username) {
      try {
        await sendNotificationToUser(
          post.username,
          'New Like!',
          `${username} liked your post`,
          { type: 'post_like', postId: postId, liker: username }
        );
      } catch (notifError) {
        console.log('[FCM] Like notification failed (non-critical):', notifError);
      }
    }

    // Return the updated post with consistent data
    res.json({
      ...post.toObject(),
      likes: post.likes,
      isLiked: !alreadyLiked // Return the new state
    });

  } catch (error) {
    console.error('[Like Post] Error:', error);
    res.status(500).json({ message: 'Server error liking post: ' + error.message });
  }
});













// FIXED: Like premium post route with proper toggle functionality
router.post('/premium-posts/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    console.log(`[Like Premium Post] User ${username} liking premium post ${postId}`);

    const postOwner = await User.findOne({ 'premiumContent.id': postId });
    if (!postOwner) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const premiumPost = postOwner.premiumContent.find((p) => p.id === postId);
    if (!premiumPost) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const isProfileOwner = postOwner.username === username;
    const isSubscribed = await checkSubscriptionStatus(username, postOwner.username);

    if (!isProfileOwner && !isSubscribed) {
      return res.status(403).json({ message: 'Must be subscribed or profile owner to like premium post' });
    }

    // Check if user already liked the post
    const alreadyLiked = premiumPost.likes.includes(username);
    
    if (alreadyLiked) {
      // Unlike: remove user from likes array
      premiumPost.likes = premiumPost.likes.filter(like => like !== username);
      console.log(`[Like Premium Post] User ${username} unliked premium post ${postId}`);
    } else {
      // Like: add user to likes array
      premiumPost.likes.push(username);
      console.log(`[Like Premium Post] User ${username} liked premium post ${postId}`);
    }

    await postOwner.save();

    // Send notification to post owner about like (only for new likes)
    if (!alreadyLiked && postOwner.username !== username) {
      try {
        await sendNotificationToUser(
          postOwner.username,
          'New Like!',
          `${username} liked your premium post`,
          { type: 'premium_post_like', postId: postId, liker: username }
        );
      } catch (notifError) {
        console.log('[FCM] Premium post like notification failed (non-critical):', notifError);
      }
    }

    // Return the updated premium post with consistent data
    res.json({
      ...premiumPost,
      likes: premiumPost.likes,
      isLiked: !alreadyLiked // Return the new state
    });

  } catch (error) {
    console.error('[Like Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error liking premium post: ' + error.message });
  }
});








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
// FIXED: Unlike post route - now properly handles unlike
router.post('/posts/:postId/unlike', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const username = req.user.username;

    if (!username) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    console.log(`[Unlike Post] User ${username} unliking post ${postId}`);

    const post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Remove user from likes array
    post.likes = post.likes.filter(like => like !== username);
    await post.save();

    // Update user's post as well for consistency
    const user = await User.findOne({ username: post.username });
    if (user) {
      const userPost = user.posts.find(p => p.id === Number(postId));
      if (userPost) {
        userPost.likes = userPost.likes.filter(like => like !== username);
        await user.save();
      }
    }

    console.log(`[Unlike Post] User ${username} successfully unliked post ${postId}`);

    // Return the updated post with consistent data
    res.json({
      ...post.toObject(),
      likes: post.likes,
      isLiked: false
    });

  } catch (error) {
    console.error('[Unlike Post] Error:', error);
    res.status(500).json({ message: 'Server error unliking post: ' + error.message });
  }
});

// =============================================
// ADMIN ROUTES - ENHANCED
// =============================================

// Admin create post route
router.post('/admin/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { text, images, videos, isPremium = false } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Post text is required' });
    }

    // UPDATED: Enforce text AND at least one image/video for admin posts
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
      isAdminPost: true, // Mark as admin post
      hasGoldenBadge: true, // Add golden badge
    });

    // Clear cache to ensure new admin posts appear immediately
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

// Admin get all users with enhanced data
// REPLACE your existing /admin/users endpoint with this
// =============================================
// FAST ADMIN USERS ENDPOINT - REPLACE EXISTING
// =============================================

// =============================================
// FIXED ADMIN BOOST CREATE - WORKS FOR ANY USER
// =============================================

// =============================================
// FIXED ADMIN BOOST CREATE - WORKS FOR ANY USER
// =============================================
// =============================================
// FIXED ADMIN BOOST CREATE - CORRECT POST LOOKUP
// =============================================

router.post('/admin/boosts/create', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { 
      postId, 
      username, 
      durationDays, 
      targetAudience, 
      price = 0,
      paymentMethod = 'admin',
      isFree = true
    } = req.body;
    
    console.log('[Admin Boost] Creating boost for:', { postId, username, durationDays, targetAudience, price });
    
    // Validate required fields
    if (!postId || !username || !durationDays || !targetAudience) {
      return res.status(400).json({ 
        success: false, 
        message: 'Post ID, username, duration, and target audience are required' 
      });
    }
    
    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // ========== CRITICAL: Find the post correctly ==========
    let post = null;
    
    // Method 1: Try to find by MongoDB _id (string)
    if (mongoose.Types.ObjectId.isValid(postId.toString())) {
      post = await Post.findById(postId).lean();
    }
    
    // Method 2: Try to find by id field as number
    if (!post) {
      const numericId = parseInt(postId);
      if (!isNaN(numericId)) {
        post = await Post.findOne({ id: numericId }).lean();
      }
    }
    
    // Method 3: Try to find by id field as string
    if (!post) {
      post = await Post.findOne({ id: postId.toString() }).lean();
    }
    
    // Method 4: Search in user's posts array
    if (!post) {
      const userDoc = await User.findOne({ username }).select('posts premiumContent').lean();
      if (userDoc) {
        // Check regular posts
        if (userDoc.posts) {
          post = userDoc.posts.find(p => 
            p.id?.toString() === postId.toString() || 
            p._id?.toString() === postId.toString()
          );
          if (post) {
            post.username = username;
          }
        }
        // Check premium content
        if (!post && userDoc.premiumContent) {
          post = userDoc.premiumContent.find(p => 
            p.id?.toString() === postId.toString() || 
            p._id?.toString() === postId.toString()
          );
          if (post) {
            post.username = username;
            post.isPremium = true;
          }
        }
      }
    }
    
    if (!post) {
      console.error('[Admin Boost] Post not found for ID:', postId);
      return res.status(404).json({ 
        success: false, 
        message: `Post not found with ID: ${postId}` 
      });
    }
    
    console.log('[Admin Boost] Found post:', { 
      postId: post._id || post.id, 
      postIdType: typeof (post._id || post.id),
      text: post.text?.substring(0, 50)
    });
    
    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));
    
    // Check if post is already boosted
    const existingBoost = await Boost.findOne({
      postId: post._id || post.id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    
    if (existingBoost) {
      return res.status(400).json({
        success: false,
        message: 'This post is already boosted',
        existingBoost: {
          id: existingBoost.id,
          expiresAt: existingBoost.expiresAt,
          daysRemaining: Math.ceil((new Date(existingBoost.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
        }
      });
    }
    
    // Calculate boost priority
    const daysNum = parseInt(durationDays);
    const boostPriority = daysNum === 1 ? 100 : daysNum === 7 ? 70 : daysNum === 30 ? 50 : 30;
    
    // Create boost record
    const finalPrice = isFree ? 0 : (price || 
      (daysNum === 1 ? 50 : daysNum === 7 ? 300 : daysNum === 30 ? 1000 : 500));
    
    const boostId = crypto.randomBytes(16).toString('hex');
    const boost = new Boost({
      id: boostId,
      postId: post._id || post.id,
      userId: user._id,
      username: username,
      durationDays: daysNum,
      targetAudience: targetAudience,
      price: finalPrice,
      paymentMethod: paymentMethod,
      paymentGateway: 'admin',
      transactionReference: `ADMIN_BOOST_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      status: 'active',
      createdAt: new Date(),
      expiresAt: expiresAt,
      priority: boostPriority
    });
    
    await boost.save();
    console.log('[Admin Boost] Boost record created:', boost.id);
    
    // Update post with boost flag in posts collection
    const updateResult = await Post.updateOne(
      { _id: post._id },
      { 
        $set: { 
          isBoosted: true, 
          boostExpiresAt: expiresAt,
          boostPriority: boostPriority,
          boostedAt: new Date()
        } 
      }
    );
    console.log('[Admin Boost] Post update result:', updateResult.modifiedCount);
    
    // Also update in user's posts array
    const userDoc = await User.findOne({ username });
    if (userDoc && userDoc.posts) {
      const postIndex = userDoc.posts.findIndex(p => 
        p.id?.toString() === post.id?.toString() || 
        p._id?.toString() === post._id?.toString()
      );
      
      if (postIndex !== -1) {
        userDoc.posts[postIndex].isBoosted = true;
        userDoc.posts[postIndex].boostExpiresAt = expiresAt;
        userDoc.posts[postIndex].boostPriority = boostPriority;
        await userDoc.save();
        console.log('[Admin Boost] Updated user posts array');
      }
    }
    
    // Send notification to user
    try {
      await sendNotificationToUser(
        username,
        '🚀 Your Post Has Been Boosted!',
        `Admin has boosted your post for ${durationDays} days! Your post will get extra visibility.`,
        { 
          type: 'admin_boost', 
          postId: post._id || post.id, 
          durationDays: durationDays.toString(),
          boostId: boost.id
        }
      );
    } catch (notifError) {
      console.log('[Admin Boost] Notification failed (non-critical):', notifError);
    }
    
    res.json({
      success: true,
      message: `Post boosted for ${durationDays} days`,
      boost: {
        id: boost.id,
        postId: boost.postId,
        username: boost.username,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        price: finalPrice,
        createdAt: boost.createdAt,
        expiresAt: boost.expiresAt,
        status: boost.status,
        daysRemaining: Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))
      }
    });
    
  } catch (error) {
    console.error('[Admin Boost Create] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create boost: ' + error.message 
    });
  }
});



// =============================================
// HELPER: Add boost duration to posts
// =============================================

const addBoostDetailsToPost = async (post, username = null) => {
  if (!post) return post;
  
  try {
    const postId = post.id || post._id;
    if (!postId) return post;
    
    const boost = await Boost.findOne({
      postId: postId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).lean();
    
    if (boost) {
      const now = new Date();
      const expiresAt = new Date(boost.expiresAt);
      const totalDuration = expiresAt - new Date(boost.createdAt);
      const remaining = expiresAt - now;
      const daysRemaining = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
      const percentRemaining = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
      
      return {
        ...post,
        isBoosted: true,
        boostInfo: {
          id: boost.id,
          durationDays: boost.durationDays,
          targetAudience: boost.targetAudience,
          createdAt: boost.createdAt,
          expiresAt: boost.expiresAt,
          daysRemaining: daysRemaining,
          percentRemaining: Math.round(percentRemaining),
          priority: boost.priority || 0
        },
        boostPriority: boost.priority || 0,
        boostExpiresAt: boost.expiresAt,
        boostRemainingDays: daysRemaining
      };
    }
    
    return {
      ...post,
      isBoosted: false,
      boostInfo: null,
      boostRemainingDays: 0
    };
  } catch (error) {
    console.error('[AddBoostDetails] Error:', error);
    return {
      ...post,
      isBoosted: false,
      boostInfo: null
    };
  }
};

// Apply to your /posts/unlimited endpoint
// Modify your existing /posts/unlimited endpoint to include boost duration


// =============================================
// GET USER'S ACTIVE BOOSTS WITH DURATION
// =============================================

router.get('/users/:username/boosts/active', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Check if requesting own profile or admin
    const isProfileOwner = req.user.username === username;
    const isAdmin = req.user.isAdmin;
    
    if (!isProfileOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to view this user\'s boosts' });
    }
    
    const boosts = await Boost.find({
      username: username,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ priority: -1, expiresAt: 1 });
    
    const boostsWithDetails = await Promise.all(boosts.map(async (boost) => {
      const now = new Date();
      const expiresAt = new Date(boost.expiresAt);
      const createdAt = new Date(boost.createdAt);
      const totalDuration = expiresAt - createdAt;
      const remaining = expiresAt - now;
      const daysRemaining = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
      const percentRemaining = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
      
      // Get post preview
      let post = await Post.findOne({ 
        $or: [
          { id: Number(boost.postId) },
          { id: boost.postId },
          { _id: boost.postId }
        ]
      }).lean();
      
      if (!post) {
        const userDoc = await User.findOne({ username }).select('posts premiumContent').lean();
        if (userDoc && userDoc.posts) {
          post = userDoc.posts.find(p => 
            p.id === Number(boost.postId) || p.id?.toString() === boost.postId
          );
        }
        if (!post && userDoc && userDoc.premiumContent) {
          post = userDoc.premiumContent.find(p => 
            p.id === boost.postId || p.id?.toString() === boost.postId
          );
        }
      }
      
      return {
        id: boost.id,
        postId: boost.postId,
        postPreview: post ? {
          id: post.id,
          text: post.text?.substring(0, 100) || '',
          images: post.images || [],
          videos: post.videos || []
        } : null,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        price: boost.price,
        paymentMethod: boost.paymentMethod,
        createdAt: boost.createdAt,
        expiresAt: boost.expiresAt,
        daysRemaining: daysRemaining,
        percentRemaining: Math.round(percentRemaining),
        priority: boost.priority,
        status: boost.status
      };
    }));
    
    res.json({
      success: true,
      boosts: boostsWithDetails,
      activeCount: boostsWithDetails.length
    });
    
  } catch (error) {
    console.error('[Get User Boosts] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// =============================================
// ADMIN: GET WALLET ADJUSTMENT HISTORY
// =============================================

router.get('/admin/wallet/adjustments', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, username } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = { 
      description: { $regex: /Admin funding/i }
    };
    
    if (username) {
      query.userId = username;
    }
    
    const adjustments = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalAdjustments = await Transaction.countDocuments(query);
    
    // Get user details for each adjustment
    const usernames = [...new Set(adjustments.map(a => a.userId))];
    const users = await User.find(
      { username: { $in: usernames } },
      { username: 1, name: 1, email: 1 }
    ).lean();
    
    const userMap = {};
    users.forEach(u => { userMap[u.username] = u; });
    
    const enhancedAdjustments = adjustments.map(adj => ({
      ...adj,
      user: userMap[adj.userId] || { username: adj.userId }
    }));
    
    res.json({
      adjustments: enhancedAdjustments,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalAdjustments / limitNum),
        totalAdjustments,
        hasNext: pageNum < Math.ceil(totalAdjustments / limitNum),
        hasPrev: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error('[Admin Wallet History] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Admin get all posts (normal and premium)
// In auth.js - Add this route to properly fetch admin posts

// Fixed admin posts fetch route
// =============================================
// FAST ADMIN POSTS FETCH - REPLACE EXISTING
// =============================================

// In auth.js, update the /admin/posts endpoint:

router.get('/admin/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, username, type = 'all' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    let posts = [];
    let totalPosts = 0;

    if (username && username.trim() !== '') {
      // Get user's regular posts
      const regularPosts = await Post.find({ username: username.trim() })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      // Get user's premium content
      const user = await User.findOne({ username: username.trim() }).select('premiumContent').lean();
      let premiumPosts = [];
      if (user && user.premiumContent) {
        premiumPosts = user.premiumContent
          .slice(skip, skip + limitNum)
          .map(post => ({ ...post, isPremium: true }));
      }
      
      // Combine all posts
      posts = [...regularPosts, ...premiumPosts];
      posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      totalPosts = posts.length;
    } else {
      // Get all posts from both collections
      const regularPosts = await Post.find({})
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      posts = [...regularPosts];
      totalPosts = await Post.countDocuments({});
    }

    res.json({
      posts: posts,
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
    res.status(200).json({
      posts: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalPosts: 0,
        hasNext: false,
        hasPrev: false
      }
    });
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

// =============================================
// WALLET & PAYMENT ROUTES
// =============================================

// Wallet Top-up Route
// Wallet Top-up Route - UPDATED FOR KORA
// Update the wallet topup route - change USD to NGN
// Wallet Top-up Route - UPDATED FOR NAIRA ONLY
// Wallet Top-up Route - FIXED VERSION matching Profile.jsx



// Subscribe Route
// Subscribe Route - UPDATED FOR KORA
// Subscribe Route - UPDATED FOR NAIRA (NGN)
// Subscribe Route - FIXED with duplicate handling
// Subscribe Route - COMPLETELY FIXED VERSION
// Subscribe Route - COMPLETELY FIXED VERSION with activity logging
// Subscribe Route - COMPLETE with failed subscription payment tracking
router.post('/subscribe/:username', authenticateToken, async (req, res) => {
  const { username } = req.params;
  const { planCode, reference, recurring, schedule, useWallet = false } = req.body;
  
  if (!username || !planCode) {
    return res.status(400).json({ message: 'Username and plan code are required' });
  }

  try {
    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const subscriber = await User.findOne({ email: req.user.email });
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }

    if (subscriber.username === targetUser.username) {
      return res.status(400).json({ message: 'Cannot subscribe to yourself' });
    }

    // Find plan amount
    const plan = targetUser.premiumPlans.find(p => p.planCode === planCode);
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan code' });
    }

    const amount = targetUser.premiumPricing[plan.interval.toLowerCase()];
    
    // Calculate expiresAt based on plan interval
    const daysMap = { weekly: 7, monthly: 30, yearly: 365 };
    const interval = plan.interval.toLowerCase();
    const daysToAdd = daysMap[interval] || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToAdd);

    // ============ CRITICAL: Check for existing active subscription ============
    const existingSubscription = await Subscription.findOne({
      subscriberId: subscriber.username,
      targetUserId: targetUser.username,
      planCode: planCode,
      status: 'active'
    });

    if (existingSubscription) {
      console.log('[Subscribe] User already has an active subscription:', {
        subscriber: subscriber.username,
        target: targetUser.username,
        planCode: planCode
      });
      
      // Return success with existing subscription info
      return res.status(200).json({
        message: 'You are already subscribed to this creator',
        alreadySubscribed: true,
        subscription: {
          id: existingSubscription.id,
          planCode: existingSubscription.planCode,
          amount: existingSubscription.amount,
          status: existingSubscription.status,
          expiresAt: existingSubscription.expiresAt || expiresAt,
          daysRemaining: existingSubscription.expiresAt ? 
            Math.ceil((new Date(existingSubscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : daysToAdd
        }
      });
    }

    // Check for pending/cancelled subscriptions that can be reactivated
    const existingInactiveSubscription = await Subscription.findOne({
      subscriberId: subscriber.username,
      targetUserId: targetUser.username,
      planCode: planCode,
      status: { $in: ['pending', 'cancelled'] }
    });

    if (existingInactiveSubscription) {
      console.log('[Subscribe] Reactivating existing subscription:', {
        subscriber: subscriber.username,
        target: targetUser.username,
        planCode: planCode,
        oldStatus: existingInactiveSubscription.status
      });
      
      // Reactivate the existing subscription
      existingInactiveSubscription.status = 'active';
      existingInactiveSubscription.reference = reference || existingInactiveSubscription.reference;
      existingInactiveSubscription.recurring = recurring || 'one-time';
      existingInactiveSubscription.schedule = schedule || 'immediate';
      existingInactiveSubscription.nextPaymentDate = recurring === 'recurring' ? calculateNextPaymentDate() : null;
      existingInactiveSubscription.expiresAt = expiresAt;
      existingInactiveSubscription.updatedAt = new Date();
      
      await existingInactiveSubscription.save();
      
      // Make sure user has subscription in their list
      if (!subscriber.subscriptions.includes(targetUser.username)) {
        subscriber.subscriptions.push(targetUser.username);
      }
      
      // Make sure target user has this subscriber
      if (!targetUser.subscribersList.includes(subscriber.username)) {
        targetUser.subscribers += 1;
        targetUser.subscribersList.push(subscriber.username);
      }
      
      await Promise.all([subscriber.save(), targetUser.save()]);
      
      const cacheKey = `sub_${subscriber.username}_${targetUser.username}`;
      subscriptionCache.set(cacheKey, true);
      
      // ========== ADD ACTIVITY LOGGING FOR SUBSCRIPTION REACTIVATED ==========
      try {
        const subscriptionActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'subscription_created',
          data: {
            subscriber: subscriber.username,
            creator: targetUser.username,
            planCode: planCode,
            amount: amount,
            interval: plan.interval,
            reactivated: true
          },
          adminUser: subscriber.username,
          adminId: subscriber._id,
          timestamp: new Date()
        });
        await subscriptionActivity.save();
        console.log('[Activity] Subscription reactivated logged:', subscriber.username, '->', targetUser.username);
      } catch (activityError) {
        console.error('[Activity] Failed to log subscription reactivation:', activityError);
      }
      
      return res.status(200).json({
        message: 'Subscription reactivated successfully',
        subscriptionId: existingInactiveSubscription.id,
        amount,
        currency: 'NGN',
        expiresAt: expiresAt,
        daysRemaining: daysToAdd,
        alreadySubscribed: false,
        reactivated: true
      });
    }

    // ============ Process new subscription ============
    
    if (useWallet) {
      // Use wallet deduction
      if (subscriber.balance < amount) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      subscriber.balance -= amount;
      await subscriber.save();

      const transaction = new Transaction({
        id: crypto.randomBytes(16).toString('hex'),
        userId: subscriber.username,
        type: 'wallet_deduction',
        amount,
        description: `Subscription to ${targetUser.username} (₦${amount})`,
        status: 'completed',
        createdAt: new Date(),
        relatedId: crypto.randomBytes(16).toString('hex'),
      });

      await transaction.save();

      const subscriptionId = crypto.randomBytes(16).toString('hex');
      const subscription = new Subscription({
        id: subscriptionId,
        subscriberId: subscriber.username,
        targetUserId: targetUser.username,
        planCode,
        status: 'active',
        createdAt: new Date(),
        reference: `wallet_${subscriptionId}`,
        amount,
        currency: 'NGN',
        recurring: recurring || 'one-time',
        schedule: schedule || 'immediate',
        nextPaymentDate: recurring === 'recurring' ? calculateNextPaymentDate() : null,
        expiresAt: expiresAt,
      });

      await subscription.save();

      subscriber.subscriptions.push(targetUser.username);
      targetUser.subscribers += 1;
      targetUser.subscribersList.push(subscriber.username);
      targetUser.balance += amount;

      await Promise.all([subscriber.save(), targetUser.save()]);

      const earningTransaction = new Transaction({
        id: crypto.randomBytes(16).toString('hex'),
        userId: targetUser.username,
        type: 'earning',
        amount,
        description: `Subscription payment from ${subscriber.username} (₦${amount})`,
        status: 'completed',
        createdAt: new Date(),
        relatedId: subscriptionId,
      });

      await earningTransaction.save();

      const cacheKey = `sub_${subscriber.username}_${targetUser.username}`;
      subscriptionCache.set(cacheKey, true);
     
      // ========== ADD ACTIVITY LOGGING FOR SUBSCRIPTION CREATED (WALLET) ==========
      try {
        const subscriptionActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'subscription_created',
          data: {
            subscriber: subscriber.username,
            creator: targetUser.username,
            planCode: planCode,
            amount: amount,
            interval: plan.interval,
            paymentMethod: 'wallet',
            status: 'success'
          },
          adminUser: subscriber.username,
          adminId: subscriber._id,
          timestamp: new Date()
        });
        await subscriptionActivity.save();
        console.log('[Activity] Subscription created logged (wallet):', subscriber.username, '->', targetUser.username);
      } catch (activityError) {
        console.error('[Activity] Failed to log subscription:', activityError);
      }
     
      // Send notifications
      try {
        await sendNotificationToUser(
          subscriber.username,
          'Subscription Successful',
          `You are now subscribed to ${targetUser.username} for ₦${amount}. Expires in ${daysToAdd} days.`,
          { type: 'subscription', targetUser: targetUser.username, amount: amount.toString(), expiresAt: expiresAt.toISOString() }
        );
        await sendNotificationToUser(
          targetUser.username,
          'New Subscriber!',
          `${subscriber.username} subscribed to your content for ₦${amount}`,
          { type: 'new_subscriber', subscriber: subscriber.username, amount: amount.toString() }
        );
      } catch (notifError) {
        console.log('[FCM] Subscription notification failed (non-critical):', notifError);
      }
     
      return res.status(201).json({
        message: 'Subscription successful via wallet',
        subscriptionId,
        amount,
        currency: 'NGN',
        nextPaymentDate: subscription.nextPaymentDate,
        expiresAt: expiresAt,
        daysRemaining: daysToAdd,
        newBalance: subscriber.balance,
      });
    } else {
      // KORA PAYMENT FLOW
      if (!reference) {
        return res.status(400).json({ message: 'Payment reference is required for Kora' });
      }

      // ========== VERIFY KORA PAYMENT ==========
      let paymentData;
      let verificationError = null;
      let verificationFailed = false;
      
      try {
        paymentData = await verifyKoraPayment(reference);
        console.log('[Subscribe] Kora verification successful:', paymentData);
      } catch (error) {
        verificationError = error;
        verificationFailed = true;
        console.error('[Subscribe] Kora verification failed:', error);
      }
      
      // ========== LOG FAILED SUBSCRIPTION PAYMENT (if verification failed) ==========
      if (verificationFailed || !paymentData || paymentData.status !== 'success') {
        const failureReason = verificationError?.message || paymentData?.message || 'Payment verification failed';
        
        // ========== LOG FAILED SUBSCRIPTION PAYMENT ==========
        try {
          const failedSubActivity = new AdminActivity({
            id: crypto.randomBytes(16).toString('hex'),
            type: 'payment_received',
            data: {
              username: subscriber.username,
              creator: targetUser.username,
              amount: amount,
              planCode: planCode,
              interval: plan.interval,
              reference: reference,
              paymentType: 'subscription',
              status: 'failed',
              failureReason: failureReason,
              timestamp: new Date().toISOString()
            },
            adminUser: subscriber.username,
            adminId: subscriber._id,
            timestamp: new Date()
          });
          await failedSubActivity.save();
          console.log('[Activity] Failed subscription payment logged:', subscriber.username, amount, failureReason);
        } catch (activityError) {
          console.error('[Activity] Failed to log failed subscription:', activityError);
        }
        
        // Create failed transaction record
        try {
          const failedTransaction = new Transaction({
            id: crypto.randomBytes(16).toString('hex'),
            userId: subscriber.username,
            type: 'subscription',
            amount: amount,
            description: `FAILED subscription to ${targetUser.username} (₦${amount}). Reason: ${failureReason}`,
            status: 'failed',
            createdAt: new Date(),
            relatedId: reference,
          });
          await failedTransaction.save();
        } catch (transError) {
          console.error('[Subscribe] Failed to create transaction record:', transError);
        }
        
        return res.status(400).json({ 
          message: `Payment verification failed: ${failureReason}`,
          status: 'failed',
          reference: reference
        });
      }

      // Normal flow - verification succeeded
      const verifiedAmountKobo = paymentData.amount || paymentData.data?.amount;
      const verifiedAmountNGN = verifiedAmountKobo / 100;
      
      if (Math.abs(verifiedAmountNGN - amount) > 1) {
        console.error('[Subscribe] Amount mismatch:', { expectedNGN: amount, receivedNGN: verifiedAmountNGN });
        
        // ========== LOG AMOUNT MISMATCH AS FAILED PAYMENT ==========
        try {
          const mismatchActivity = new AdminActivity({
            id: crypto.randomBytes(16).toString('hex'),
            type: 'payment_received',
            data: {
              username: subscriber.username,
              creator: targetUser.username,
              amount: amount,
              verifiedAmount: verifiedAmountNGN,
              planCode: planCode,
              reference: reference,
              paymentType: 'subscription',
              status: 'failed',
              failureReason: `Amount mismatch: Expected ₦${amount}, received ₦${verifiedAmountNGN}`,
              timestamp: new Date().toISOString()
            },
            adminUser: subscriber.username,
            adminId: subscriber._id,
            timestamp: new Date()
          });
          await mismatchActivity.save();
          console.log('[Activity] Amount mismatch logged for subscription');
        } catch (activityError) {
          console.error('[Activity] Failed to log amount mismatch:', activityError);
        }
        
        return res.status(400).json({ message: 'Amount mismatch' });
      }

      const subscriptionId = crypto.randomBytes(16).toString('hex');
      const subscription = new Subscription({
        id: subscriptionId,
        subscriberId: subscriber.username,
        targetUserId: targetUser.username,
        planCode,
        status: 'active',
        createdAt: new Date(),
        reference,
        amount,
        currency: 'NGN',
        recurring: recurring || 'one-time',
        schedule: schedule || 'immediate',
        nextPaymentDate: recurring === 'recurring' ? calculateNextPaymentDate() : null,
        expiresAt: expiresAt,
      });

      await subscription.save();

      subscriber.subscriptions.push(targetUser.username);
      targetUser.subscribers += 1;
      targetUser.subscribersList.push(subscriber.username);

      const transaction = new Transaction({
        id: crypto.randomBytes(16).toString('hex'),
        userId: targetUser.username,
        type: 'earning',
        amount,
        description: `Subscription payment from ${subscriber.username} (₦${amount})`,
        status: 'completed',
        createdAt: new Date(),
        relatedId: subscriptionId,
      });

      targetUser.balance += amount;
      await Promise.all([subscriber.save(), targetUser.save(), transaction.save()]);

      const cacheKey = `sub_${subscriber.username}_${targetUser.username}`;
      subscriptionCache.set(cacheKey, true);
     
      // ========== ADD ACTIVITY LOGGING FOR SUCCESSFUL SUBSCRIPTION CREATED ==========
      try {
        const subscriptionActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'subscription_created',
          data: {
            subscriber: subscriber.username,
            creator: targetUser.username,
            planCode: planCode,
            amount: amount,
            interval: plan.interval,
            paymentMethod: 'kora',
            reference: reference,
            status: 'success',
            expiresAt: expiresAt.toISOString()
          },
          adminUser: subscriber.username,
          adminId: subscriber._id,
          timestamp: new Date()
        });
        await subscriptionActivity.save();
        console.log('[Activity] Subscription created logged (kora):', subscriber.username, '->', targetUser.username);
      } catch (activityError) {
        console.error('[Activity] Failed to log subscription:', activityError);
      }
     
      // ========== ALSO LOG AS PAYMENT RECEIVED ==========
      try {
        const paymentActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'payment_received',
          data: {
            username: subscriber.username,
            creator: targetUser.username,
            amount: amount,
            currency: 'NGN',
            method: 'kora',
            reference: reference,
            paymentType: 'subscription',
            planCode: planCode,
            status: 'success',
            timestamp: new Date().toISOString()
          },
          adminUser: subscriber.username,
          adminId: subscriber._id,
          timestamp: new Date()
        });
        await paymentActivity.save();
        console.log('[Activity] Payment received logged for subscription:', subscriber.username, amount);
      } catch (activityError) {
        console.error('[Activity] Failed to log payment:', activityError);
      }
     
      try {
        await sendNotificationToUser(
          subscriber.username,
          'Subscription Successful',
          `You are now subscribed to ${targetUser.username} for ₦${amount}. Expires in ${daysToAdd} days.`,
          { type: 'subscription', targetUser: targetUser.username, amount: amount.toString(), expiresAt: expiresAt.toISOString() }
        );
        await sendNotificationToUser(
          targetUser.username,
          'New Subscriber!',
          `${subscriber.username} subscribed to your content for ₦${amount}`,
          { type: 'new_subscriber', subscriber: subscriber.username, amount: amount.toString() }
        );
      } catch (notifError) {
        console.log('[FCM] Subscription notification failed (non-critical):', notifError);
      }
     
      return res.status(201).json({
        message: 'Subscription successful',
        subscriptionId,
        amount,
        currency: 'NGN',
        nextPaymentDate: subscription.nextPaymentDate,
        expiresAt: expiresAt,
        daysRemaining: daysToAdd,
      });
    }
  } catch (error) {
    console.error('[Subscribe] Error:', error);
    
    // ========== LOG SERVER ERROR AS FAILED PAYMENT ==========
    try {
      const { username } = req.params;
      const { planCode, reference } = req.body;
      const subscriber = await User.findOne({ email: req.user.email });
      
      if (subscriber && username) {
        const errorActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'payment_received',
          data: {
            username: subscriber.username,
            creator: username,
            planCode: planCode,
            reference: reference,
            paymentType: 'subscription',
            status: 'failed',
            failureReason: `Server error: ${error.message}`,
            timestamp: new Date().toISOString()
          },
          adminUser: subscriber.username,
          adminId: subscriber._id,
          timestamp: new Date()
        });
        await errorActivity.save();
        console.log('[Activity] Server error logged for subscription');
      }
    } catch (logError) {
      console.error('[Activity] Failed to log error:', logError);
    }
    
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      console.log('[Subscribe] Duplicate key error - user may already be subscribed');
      return res.status(200).json({
        message: 'You are already subscribed to this creator',
        alreadySubscribed: true,
        error: 'duplicate_subscription'
      });
    }
    
    res.status(500).json({ message: 'Server error during subscription: ' + error.message });
  }
});

// =============================================
// PUSHER AUTHENTICATION
// =============================================




// Check subscription status for a specific user
router.get('/users/:targetUsername/subscription-status', authenticateToken, async (req, res) => {
  try {
    const { targetUsername } = req.params;
    const subscriberUsername = req.user.username;

    if (!subscriberUsername || !targetUsername) {
      return res.status(400).json({ message: 'Usernames required' });
    }

    if (subscriberUsername === targetUsername) {
      return res.json({ 
        isSubscribed: true, 
        isProfileOwner: true,
        message: 'You are viewing your own profile'
      });
    }

    // Check for active subscription
    const subscription = await Subscription.findOne({
      subscriberId: subscriberUsername,
      targetUserId: targetUsername,
      status: 'active'
    }).lean();

    const isSubscribed = !!subscription;

    res.json({ 
      isSubscribed,
      subscription: subscription ? {
        planCode: subscription.planCode,
        amount: subscription.amount,
        currency: subscription.currency,
        createdAt: subscription.createdAt,
        nextPaymentDate: subscription.nextPaymentDate
      } : null
    });
  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    res.status(500).json({ message: 'Server error checking subscription: ' + error.message });
  }
});







// Add this route to auth.js - Check subscription status with detailed info
// FIXED: Check subscription status endpoint
// FIXED: Check subscription status endpoint with proper expiry
// FIXED: Check subscription status endpoint - Profile owners should always return true
router.get('/subscriptions/check/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const subscriberUsername = req.user.username;

    console.log(`[Subscription Check] Checking if ${subscriberUsername} is subscribed to ${username}`);

    // CRITICAL FIX: Profile owner should ALWAYS be considered "subscribed" to their own content
    if (subscriberUsername === username) {
      console.log(`[Subscription Check] Profile owner - returning subscribed=true`);
      return res.json({ 
        isSubscribed: true, 
        isProfileOwner: true,
        message: 'You are viewing your own profile'
      });
    }

    // Check for active subscription that hasn't expired
    const subscription = await Subscription.findOne({
      subscriberId: subscriberUsername,
      targetUserId: username,
      status: 'active'
    }).lean();

    if (!subscription) {
      console.log(`[Subscription Check] No active subscription found for ${subscriberUsername} -> ${username}`);
      return res.json({ 
        isSubscribed: false,
        subscription: null
      });
    }

    // Check if subscription has expired
    let daysRemaining = 0;
    let expiryDate = null;

    if (subscription.expiresAt) {
      expiryDate = subscription.expiresAt;
      const now = new Date();
      const expiry = new Date(expiryDate);
      
      if (expiry < now) {
        console.log(`[Subscription Check] Subscription expired on ${expiryDate}`);
        await Subscription.updateOne(
          { _id: subscription._id },
          { status: 'expired' }
        );
        return res.json({ 
          isSubscribed: false,
          subscription: null,
          expired: true
        });
      }
      
      const diffTime = expiry - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } else {
      // Calculate based on plan
      const targetUser = await User.findOne({ username }).select('premiumPricing premiumPlans').lean();
      const plan = targetUser?.premiumPlans?.find(p => p.planCode === subscription.planCode);
      const daysMap = { weekly: 7, monthly: 30, yearly: 365 };
      const interval = plan?.interval || 'monthly';
      const daysToAdd = daysMap[interval] || 30;
      expiryDate = new Date(subscription.createdAt);
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);
      
      const now = new Date();
      if (expiryDate < now) {
        await Subscription.updateOne(
          { _id: subscription._id },
          { status: 'expired', expiresAt: expiryDate }
        );
        return res.json({ 
          isSubscribed: false,
          subscription: null,
          expired: true
        });
      }
      
      const diffTime = expiryDate - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    res.json({ 
      isSubscribed: true,
      subscription: {
        id: subscription.id,
        planCode: subscription.planCode,
        amount: subscription.amount,
        currency: subscription.currency,
        createdAt: subscription.createdAt,
        expiresAt: expiryDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0
      }
    });
  } catch (error) {
    console.error('[Subscription Check] Error:', error);
    res.status(500).json({ message: 'Server error checking subscription: ' + error.message });
  }
});



router.post('/pusher/auth', authenticateToken, (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  const userId = req.user.username;

  // Update user online status when they connect to Pusher
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
   
    // Send notification to followers about live stream
    try {
      const user = await User.findOne({ username: req.user.username });
      if (user && user.followers && user.followers.length > 0) {
        await sendNotificationToUsers(
          user.followers,
          `${req.user.username} is live!`,
          title,
          { type: 'live_stream', username: req.user.username, roomId, title }
        );
      }
    } catch (notifError) {
      console.log('[FCM] Live stream notification failed (non-critical):', notifError);
    }
   
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
        userMentions: extractUserMentions(`${stream.title} - Live Stream Recording`), // NEW: Add user mentions
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
        userMentions: extractUserMentions(`${stream.title} - Live Stream Recording`) // NEW: Add user mentions
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

// =============================================
// CHAT ROUTES WITH ENHANCED NOTIFICATIONS
// =============================================

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

// ENHANCED: Send message route with user status-based notifications
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

    // ENHANCED: Send notifications based on user status
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

// User status tracking endpoint
router.post('/user/online', authenticateToken, (req, res) => {
  if (req.user && req.user.username) {
    updateUserOnlineStatus(req.user.username);
    res.json({ message: 'User status updated to online' });
  } else {
    res.status(400).json({ message: 'User not authenticated' });
  }
});

router.post('/user/offline', authenticateToken, (req, res) => {
  if (req.user && req.user.username) {
    updateUserOfflineStatus(req.user.username);
    res.json({ message: 'User status updated to offline' });
  } else {
    res.status(400).json({ message: 'User not authenticated' });
  }
});

// =============================================
// AUTHENTICATION ROUTES
// =============================================

// Register route 001
// Register route
router.post('/register', async (req, res) => {
  const { username, email, password, firstName, lastName, gender, age, location, city, country, state, postalCode, phoneNumber, profilePicture, userType = 'content_creator', bio } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({
      message: 'Username, email, and password are required',
      field: !username ? 'username' : !email ? 'email' : 'password',
    });
  }

  
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
    return res.status(400).json({
      message: 'Username can only contain letters, numbers, underscores, and hyphens',
      field: 'username',
      value: trimmedUsername,
    });
  }

  if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(trimmedEmail)) {
    return res.status(400).json({
      message: 'Please use a valid email address',
      field: 'email',
      value: trimmedEmail,
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long', field: 'password' });
  }

  if (firstName && firstName.length > 50) {
    return res.status(400).json({ message: 'First name must be 50 characters or less', field: 'firstName' });
  }

  if (lastName && lastName.length > 50) {
    return res.status(400).json({ message: 'Last name must be 50 characters or less', field: 'lastName' });
  }

  if (gender && !['male', 'female', 'other'].includes(gender)) {
    return res.status(400).json({ message: 'Gender must be male, female, or other', field: 'gender' });
  }

  if (age && (isNaN(age) || age < 18 || age > 120)) {
    return res.status(400).json({ message: 'Age must be a number between 18 and 120', field: 'age' });
  }

  // Validate userType
  if (userType && !['content_creator', 'escort', 'both'].includes(userType)) {
    return res.status(400).json({ message: 'Invalid user type', field: 'userType' });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ username: trimmedUsername }, { email: trimmedEmail }],
    }).lean();

    if (existingUser) {
      if (existingUser.username === trimmedUsername) {
        return res.status(400).json({
          message: 'Username already taken',
          field: 'username',
          value: trimmedUsername,
          suggestion: 'Try a different username or log in if this is your account',
        });
      }

      if (existingUser.email === trimmedEmail) {
        return res.status(400).json({
          message: 'Email already exists',
          field: 'email',
          value: trimmedEmail,
          suggestion: 'Try logging in or use a different email address',
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let newId;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const maxIdUser = await User.findOne().sort({ id: -1 }).select('id').lean();
      newId = maxIdUser ? maxIdUser.id + 1 : 1;

      const newUser = new User({
        id: newId,
        username: trimmedUsername,
        email: trimmedEmail,
        password: hashedPassword,
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        gender,
        age,
        location: location?.trim(),
        city: city?.trim(),
        country: country?.trim(),
        state: state?.trim(),
        postalCode: postalCode?.trim(),
        phoneNumber: phoneNumber?.trim(),
        website: {
          twitter: '',
          instagram: '',
          youtube: '',
        },
        profilePicture: profilePicture || '',
        images: [],
        videos: [],
        subscribers: 0,
        subscribersList: [],
        posts: [],
        premiumContent: [],
        followers: [],
        following: [],
        premiumPricing: { weekly: 0, monthly: 0, yearly: 0 },
        premiumPlans: [
          { interval: 'weekly', planCode: 'PLN_weekly_default' },
          { interval: 'monthly', planCode: 'PLN_monthly_default' },
          { interval: 'yearly', planCode: 'PLN_yearly_default' },
        ],
        subscriptions: [],
        bio: bio || '',
        isAdmin: false,
        bankName: '',
        accountNumber: '',
        balance: 0,
        messagesFromPremiumOnly: false,
        userType: userType || 'content_creator',
        payoutRequests: [],
        fcmTokens: [],
        emailNotifications: true,
      });

      try {
        await newUser.save();
        
        // ========== ADD ACTIVITY LOGGING FOR NEW USER REGISTRATION ==========
        try {
          const registerActivity = new AdminActivity({
            id: crypto.randomBytes(16).toString('hex'),
            type: 'user_registered',
            data: {
              username: trimmedUsername,
              email: trimmedEmail,
              userType: userType || 'content_creator',
              firstName: firstName || '',
              lastName: lastName || '',
              location: location || '',
              country: country || ''
            },
            adminUser: trimmedUsername,
            adminId: newUser._id,
            timestamp: new Date()
          });
          await registerActivity.save();
          console.log('[Activity] New user registration logged:', trimmedUsername);
        } catch (activityError) {
          console.error('[Activity] Failed to log registration:', activityError);
        }
        
        const expiresIn = 24 * 60 * 60;
        const token = jwt.sign({
          email: newUser.email,
          _id: newUser._id,
          username: newUser.username,
          isAdmin: newUser.isAdmin
        }, JWT_SECRET, { expiresIn: '24h' });

        return res.status(201).json({
          token,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          username: newUser.username,
          message: 'Registration successful',
        });
      } catch (saveError) {
        if (saveError.name === 'MongoServerError' && saveError.code === 11000 && saveError.keyPattern.id) {
          attempts++;
          if (attempts >= maxAttempts) {
            return res.status(500).json({ message: 'Failed to generate unique ID after multiple attempts' });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        throw saveError;
      }
    }
  } catch (error) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      const duplicateField = error.keyPattern?.username ? 'username' : error.keyPattern?.email ? 'email' : 'id';
      const duplicateValue = error.keyValue?.username || error.keyValue?.email || error.keyValue?.id;
      return res.status(400).json({
        message: `${duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1)} already exists`,
        field: duplicateField,
        value: duplicateValue,
        suggestion:
          duplicateField === 'email'
            ? 'Try logging in or use a different email address'
            : duplicateField === 'username'
            ? 'Try a different username or log in if this is your account'
            : 'Unable to assign unique ID, please try again',
      });
    }

    console.error('[Register] Error:', error);
    return res.status(500).json({ message: 'Server error during registration: ' + error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.password || typeof user.password !== 'string') {
      return res.status(400).json({ message: 'This account was created with Google sign-in. Please use "Sign in with Google" instead.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const expiresIn = 24 * 60 * 60;
    const token = jwt.sign({ email: user.email, _id: user._id, username: user.username, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '24h' });

    // Update user online status on login
    updateUserOnlineStatus(user.username);

    return res.status(200).json({
      token,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      username: user.username,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    return res.status(500).json({ message: 'Server error during login: ' + error.message });
  }
});

// Admin login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
      const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
      if (!user) {
          return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (!user.password || typeof user.password !== 'string') {
          return res.status(400).json({ message: 'This account was created with Google sign-in. Please use "Sign in with Google" instead.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
          return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (!user.isAdmin) {
          return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
      }

      const expiresIn = 24 * 60 * 60;
      const token = jwt.sign({ email: user.email, _id: user._id, username: user.username, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '24h' });

      return res.status(200).json({
          token,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          username: user.username,
          message: 'Login successful',
      });
  } catch (error) {
      console.error('[Admin Login] Error:', error);
      return res.status(500).json({ message: 'Server error during admin login: ' + error.message });
  }
});

// Admin verify — checks that the stored adminToken is still valid and belongs to an admin
router.get('/admin/verify', authenticateToken, authenticateAdmin, (req, res) => {
  res.status(200).json({ valid: true, username: req.user.username, isAdmin: req.user.isAdmin });
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Update user offline status on logout
    if (req.user && req.user.username) {
      updateUserOfflineStatus(req.user.username);
    }

    // Remove FCM tokens on logout
    const user = await User.findOne({ email: req.user.email });
    if (user && user.fcmTokens && user.fcmTokens.length > 0) {
      user.fcmTokens = [];
      await user.save();
      console.log(`[FCM] Cleared FCM tokens for ${user.username} on logout`);
    }
   
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ message: 'Server error during logout: ' + error.message });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const expiresIn = 24 * 60 * 60;
    const newToken = jwt.sign({ email: user.email, _id: user._id, username: user.username, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({
      token: newToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      username: user.username,
    });
  } catch (error) {
    console.error('[Refresh] Error:', error);
    return res.status(500).json({ message: 'Server security error: ' + error.message });
  }
});

// Validate token
router.get('/validate-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('username email images profilePicture balance userType').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      valid: true,
      user: { 
        username: user.username, 
        email: user.email, 
        images: user.images, 
        profilePicture: user.profilePicture, 
        balance: user.balance,
        userType: user.userType || 'content_creator' // Ensure backward compatibility
      },
    });
  } catch (error) {
    console.error('[Validate Token] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// USER PROFILE ROUTES
// =============================================

// Get user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure backward compatibility for old users without userType
    if (!user.userType) {
      user.userType = 'content_creator';
    }

    res.json(user);
  } catch (error) {
    console.error('[Me] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get all users with bio and location data
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user.isAdmin;
  
    let projection = '-password';
  
    if (isAdmin) {
      // For admin users, include all fields including sensitive ones
      projection = {};
    } else {
      // For non-admin, exclude sensitive fields but include bio and location
      projection = '-password -bankName -accountNumber -phoneNumber';
    }

    const users = await User.find().select(projection).lean();
    
    // Ensure backward compatibility for old users without userType
    const usersWithDefaultType = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      // Ensure location fields exist
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    res.json(usersWithDefaultType);
  } catch (error) {
    console.error('[Users] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Search users with bio and location
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex }, 
        { location: searchRegex }, 
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex },
        { name: searchRegex }, 
        { firstName: searchRegex }, 
        { lastName: searchRegex }
      ],
    }).select('-password -bankName -accountNumber -phoneNumber').lean();

    // Ensure backward compatibility for old users without userType
    const usersWithDefaultType = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    res.json(usersWithDefaultType);
  } catch (error) {
    console.error('[Users Search] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Update user route - FIXED VERSION with bio and location support
// Update user route - FIXED VERSION with bio and location support AND numbersVisibility
router.put('/users/:username', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email !== req.user.email) {
      return res.status(403).json({ message: 'Unauthorized to update this profile' });
    }

    // Parse the request body - handle both JSON and form data
    let updateData = {};
    if (req.body.data) {
      // If data comes as JSON string in 'data' field
      try {
        updateData = JSON.parse(req.body.data);
      } catch (e) {
        updateData = req.body;
      }
    } else {
      updateData = req.body;
    }

    console.log('[Update User] Received data:', updateData);

    // Update basic fields
    if (updateData.username) user.username = updateData.username.trim();
    if (updateData.email) user.email = updateData.email.trim().toLowerCase();
    if (updateData.password) user.password = await bcrypt.hash(updateData.password, 10);
    if (updateData.name) user.name = updateData.name;
    if (updateData.firstName) user.firstName = updateData.firstName;
    if (updateData.lastName) user.lastName = updateData.lastName;
    if (updateData.bio !== undefined) user.bio = updateData.bio;
    if (updateData.location !== undefined) user.location = updateData.location;
    if (updateData.city !== undefined) user.city = updateData.city;
    if (updateData.country !== undefined) user.country = updateData.country;
    if (updateData.state !== undefined) user.state = updateData.state;

    // NEW: Handle userType - THIS IS THE CRITICAL FIX
    if (updateData.userType && ['content_creator', 'escort', 'both'].includes(updateData.userType)) {
      console.log('[Update User] Setting userType to:', updateData.userType);
      user.userType = updateData.userType;
    }

    // NEW: Handle numbersVisibility - ADD THIS
  if (updateData.numbersVisibility && ['all_users', 'subscribers_only', 'followers_only', 'non'].includes(updateData.numbersVisibility)) {
  console.log('[Update User] Setting numbersVisibility to:', updateData.numbersVisibility);
  user.numbersVisibility = updateData.numbersVisibility;
}

    // Handle website/social links
    if (updateData.website) {
      try {
        const websiteData = typeof updateData.website === 'string' ? JSON.parse(updateData.website) : updateData.website;
        user.website = {
          twitter: websiteData.twitter || user.website.twitter || '',
          instagram: websiteData.instagram || user.website.instagram || '',
          youtube: websiteData.youtube || user.website.youtube || '',
        };
      } catch (e) {
        console.error('[Update User] Website parse error:', e);
        // If parsing fails, keep existing website data
      }
    }

    // Handle social links directly
    if (updateData.socialLinks) {
      try {
        const socialData = typeof updateData.socialLinks === 'string' ? JSON.parse(updateData.socialLinks) : updateData.socialLinks;
        user.website = {
          twitter: socialData.twitter || user.website.twitter || '',
          instagram: socialData.instagram || user.website.instagram || '',
          youtube: socialData.youtube || user.website.youtube || '',
        };
      } catch (e) {
        console.error('[Update User] Social links parse error:', e);
      }
    }

    // Handle arrays
    if (updateData.images) user.images = Array.isArray(updateData.images) ? updateData.images : [];
    if (updateData.videos) user.videos = Array.isArray(updateData.videos) ? updateData.videos : [];

    // Handle profile picture
    if (req.file) {
      user.profilePicture = `/uploads/${req.file.filename}`;
    } else if (updateData.profilePicture !== undefined) {
      user.profilePicture = updateData.profilePicture || '';
    }

    // Handle premium pricing
    if (updateData.premiumPricing) {
      const premiumPricing = typeof updateData.premiumPricing === 'string' ? JSON.parse(updateData.premiumPricing) : updateData.premiumPricing;
      if (
        typeof premiumPricing.weekly === 'number' && premiumPricing.weekly >= 0 &&
        typeof premiumPricing.monthly === 'number' && premiumPricing.monthly >= 0 &&
        typeof premiumPricing.yearly === 'number' && premiumPricing.yearly >= 0
      ) {
        user.premiumPricing = premiumPricing;
      }
    }

    // Handle bank details
    if (typeof updateData.bankName === 'string') user.bankName = updateData.bankName.trim();
    if (typeof updateData.accountNumber === 'string') user.accountNumber = updateData.accountNumber.trim();
    if (typeof updateData.phoneNumber === 'string') user.phoneNumber = updateData.phoneNumber.trim();

    // Handle boolean fields
    if (updateData.messagesFromPremiumOnly !== undefined) {
      user.messagesFromPremiumOnly = Boolean(updateData.messagesFromPremiumOnly);
    }

    if (updateData.emailNotifications !== undefined) {
      user.emailNotifications = Boolean(updateData.emailNotifications);
    }

    // Handle other fields
    if (updateData.gender) user.gender = updateData.gender;
    if (updateData.age) user.age = updateData.age;
    if (updateData.postalCode) user.postalCode = updateData.postalCode;

    console.log('[Update User] Saving user with:', {
      userType: user.userType,
      numbersVisibility: user.numbersVisibility
    });

    // Save the user
    await user.save();

    // Fetch the updated user to ensure we have the latest data
    const updatedUser = await User.findOne({ username: user.username }).select('-password').lean();
    
    // Ensure userType and numbersVisibility are set for backward compatibility
    if (!updatedUser.userType) {
      updatedUser.userType = 'content_creator';
    }
    if (!updatedUser.numbersVisibility) {
      updatedUser.numbersVisibility = 'subscribers_only';
    }

    console.log('[Update User] User saved successfully with:', {
      userType: updatedUser.userType,
      numbersVisibility: updatedUser.numbersVisibility
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('[Update User] Error:', error);
    res.status(500).json({ message: 'Server error updating user: ' + error.message });
  }
});
// Get user by username with bio and location
// Get user by username with bio and location
// Get user by username with bio and location - FIXED VERSION
router.get('/users/:username', authenticateToken, async (req, res) => {
  console.log(`[Get User] Fetching user: ${req.params.username}`);
  try {
    const { fields } = req.query;
    let projection = '-password';

    if (fields) {
      const fieldArray = fields.split(',').map(f => f.trim());
      projection = fieldArray.reduce((proj, field) => ({ ...proj, [field]: 1 }), { _id: 0 });
      projection.password = 0;
    }

    const user = await User.findOne({ username: req.params.username }).select(projection).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure backward compatibility for old users without userType
    if (!user.userType) {
      user.userType = 'content_creator';
    }

    const userDetails = { 
      ...user, 
      socialLinks: user.website || { twitter: '', instagram: '', youtube: '' },
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      // FIXED: Use numbersVisibility instead of phoneNumberVisibleToAll
      numbersVisibility: user.numbersVisibility || 'subscribers_only'
    };
  
    // Show phone number if user allows it OR if requester is the user
    if (user.email !== req.user.email) {
      delete userDetails.bankName;
      delete userDetails.accountNumber;
      delete userDetails.balance;
      delete userDetails.payoutRequests;
      
      // Only hide phone number based on numbersVisibility setting
      const shouldHidePhone = await shouldHidePhoneForUser(
        user.username,
        req.user.username,
        user.numbersVisibility || 'subscribers_only'
      );
      
      if (shouldHidePhone) {
        delete userDetails.phoneNumber;
      }
    }

    res.json(userDetails);
  } catch (error) {
    console.error('[Get User] Error:', error);
    res.status(500).json({ message: 'Server error fetching user: ' + error.message });
  }
});

// Follow user
// Follow user
// Follow user
router.post('/users/:username/follow', authenticateToken, async (req, res) => {
  console.log(`[Follow] Following user: ${req.params.username}`);
  try {
    const targetUser = await User.findOne({ username: req.params.username });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findOne({ email: req.user.email });
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    if (currentUser.username === targetUser.username) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    if (!targetUser.followers.includes(currentUser.username)) {
      targetUser.followers.push(currentUser.username);
      currentUser.following.push(targetUser.username);
      await Promise.all([targetUser.save(), currentUser.save()]);
      
      // ========== ADD ACTIVITY LOGGING FOR NEW FOLLOWER ==========
      try {
        const followActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'new_follower',
          data: {
            follower: currentUser.username,
            followed: targetUser.username,
            timestamp: new Date().toISOString()
          },
          adminUser: currentUser.username,
          adminId: currentUser._id,
          timestamp: new Date()
        });
        await followActivity.save();
        console.log('[Activity] New follower logged:', currentUser.username, '->', targetUser.username);
      } catch (activityError) {
        console.error('[Activity] Failed to log follow:', activityError);
      }
     
      // Send notification to the user being followed
      try {
        await sendNotificationToUser(
          targetUser.username,
          'New Follower!',
          `${currentUser.username} started following you`,
          { type: 'new_follower', follower: currentUser.username }
        );
      } catch (notifError) {
        console.log('[FCM] Follow notification failed (non-critical):', notifError);
      }
    }

    const userDetails = targetUser.toObject();
    delete userDetails.password;
    delete userDetails.bankName;
    delete userDetails.accountNumber;
    delete userDetails.phoneNumber;
    delete userDetails.balance;
    delete userDetails.payoutRequests;

    res.json(userDetails);
  } catch (error) {
    console.error('[Follow] Error:', error);
    res.status(500).json({ message: 'Server error following user: ' + error.message });
  }
});
// Unfollow user
router.post('/users/:username/unfollow', authenticateToken, async (req, res) => {
  console.log(`[Unfollow] Unfollowing user: ${req.params.username}`);
  try {
    const targetUser = await User.findOne({ username: req.params.username });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findOne({ email: req.user.email });
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    if (currentUser.username === targetUser.username) {
      return res.status(400).json({ message: 'Cannot unfollow yourself' });
    }

    targetUser.followers = targetUser.followers.filter((f) => f !== currentUser.username);
    currentUser.following = currentUser.following.filter((f) => f !== targetUser.username);
    await Promise.all([targetUser.save(), currentUser.save()]);

    const userDetails = targetUser.toObject();
    delete userDetails.password;
    delete userDetails.bankName;
    delete userDetails.accountNumber;
    delete userDetails.phoneNumber;
    delete userDetails.balance;
    delete userDetails.payoutRequests;

    res.json(userDetails);
  } catch (error) {
    console.error('[Unfollow] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Public user profile with bio and location
// Public user profile with bio and location
router.get('/public/users/:username/profile', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('username profilePicture userType bio location city country state').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure backward compatibility for old users without userType
    const userType = user.userType || 'content_creator';

    res.json({ 
      username: user.username, 
      profilePicture: user.profilePicture,
      userType: userType,
      bio: user.bio || '',
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || ''
    });
  } catch (error) {
    console.error('[Public User Profile] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// POSTS ROUTES
// =============================================

// Public posts with admin posts inserted every 6 posts
// FIXED: Public posts with admin posts inserted every 6 posts FOR ALL USERS

// In auth.js - Add this new route for ALL posts with admin posts
// =============================================
// FAST PUBLIC POSTS ENDPOINT - REPLACE YOUR EXISTING ONE
// =============================================

router.get('/all/posts', checkDbConnection, async (req, res) => {
  const cacheKey = 'all_posts_fast_v2';
  const bypassCache = req.query.bypassCache === 'true';
  const cachedPosts = !bypassCache ? cache.get(cacheKey) : null;

  if (cachedPosts) {
    console.log('[Fast Posts] Returning cached posts');
    return res.json(cachedPosts);
  }

  try {
    console.log('[Fast Posts] Fetching fresh posts...');
    
    // OPTIMIZED: Get posts with LIMIT and proper indexing
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .limit(200)  // LIMIT to 200 posts for faster loading
      .lean()
      .exec();

    // Get admin posts (limited)
    const adminUsers = await User.find({ isAdmin: true }).select('username').limit(10).lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .limit(30)  // LIMIT admin posts
      .lean();
    }

    console.log('[Fast Posts] Found:', {
      publicPosts: publicPosts.length,
      adminPosts: adminPosts.length
    });

    // Insert admin posts every 6th post
    let allPosts = publicPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
    }

    // Cache for 2 minutes (shorter for fresh content)
    if (!bypassCache) {
      cache.set(cacheKey, allPosts, 120);
    }

    res.json(allPosts);
  } catch (error) {
    console.error('[Fast Posts] Error:', error);
    cache.del(cacheKey);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});



router.post('/test/public-post', async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!username || !text) {
      return res.status(400).json({ message: 'Username and text are required' });
    }

    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newPost = await createPost({ text, username, isPremium: false });
    cache.del('public_posts');
    res.status(201).json(newPost);
  } catch (error) {
    console.error('[Test Public Post] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Public users with bio and location
router.get('/public/users', async (req, res) => {
  const cacheKey = 'public_users';
  const cachedUsers = cache.get(cacheKey);
  if (cachedUsers) {
    return res.json(cachedUsers);
  }

  try {
    const users = await User.find().select('username userType bio location city country state').lean();
    
    // Ensure backward compatibility for old users without userType
    const usersWithDefaultType = users.map(user => ({
      username: user.username,
      userType: user.userType || 'content_creator',
      bio: user.bio || '',
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || ''
    }));
    
    cache.set(cacheKey, usersWithDefaultType);
    res.json(usersWithDefaultType);
  } catch (error) {
    console.error('[Public Users] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get all posts
router.get('/posts', authenticateToken, async (req, res) => {
  try {
    const posts = await Post.find().sort({ timestamp: -1 }).lean();
    res.json(posts);
  } catch (error) {
    console.error('[Posts] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Create new post
// Create new post with activity logging
router.post('/posts/new', authenticateToken, async (req, res) => {
  try {
    const { text, username, images, videos, timestamp, isPremium = false, hashtags, userMentions } = req.body;
    if (!username || !text) {
      return res.status(400).json({ message: 'Username and text are required' });
    }

    const user = await User.findOne({ username, email: req.user.email });
    if (!user) {
      return res.status(403).json({ message: 'Unauthorized or user not found' });
    }

    const newPost = await createPost({ text, username, images, videos, timestamp, isPremium, hashtags, userMentions });
    cache.del('public_posts');
    
    // ========== ADD ACTIVITY LOGGING FOR POST CREATED ==========
    try {
      const postActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'post_created',
        data: {
          username: username,
          postId: newPost.id,
          isPremium: isPremium || false,
          hasImages: images && images.length > 0,
          hasVideos: videos && videos.length > 0,
          textLength: text?.length || 0
        },
        adminUser: username,
        adminId: user._id,
        timestamp: new Date()
      });
      await postActivity.save();
      console.log('[Activity] Post created logged:', username);
    } catch (activityError) {
      console.error('[Activity] Failed to log post creation:', activityError);
    }
    
    res.status(201).json(newPost);
  } catch (error) {
    console.error('[New Post] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Update post
router.put('/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text, images, videos, isPremium, hashtags, userMentions } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const post = await Post.findOne({ id: Number(postId), username: user.username });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.text = text;
    post.images = Array.isArray(images) ? images : post.images;
    post.videos = Array.isArray(videos) ? videos : post.videos;
    if (isPremium !== undefined) post.isPremium = Boolean(isPremium);
    post.hashtags = Array.isArray(hashtags) ? hashtags : extractHashtags(text);
    post.userMentions = Array.isArray(userMentions) ? userMentions : extractUserMentions(text); // NEW: Update user mentions

    await post.save();

    const userPost = user.posts.find((p) => p.id === Number(postId));
    if (userPost) {
      userPost.text = post.text;
      userPost.images = post.images;
      userPost.videos = post.videos;
      userPost.isPremium = post.isPremium;
      userPost.hashtags = post.hashtags;
      userPost.userMentions = post.userMentions; // NEW: Update user mentions
      await user.save();
    }

    cache.del('public_posts');
    res.json(post);
  } catch (error) {
    console.error('[Update Post] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Delete post
router.delete('/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const post = await Post.findOne({ id: Number(postId), username: user.username });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    await Post.deleteOne({ id: Number(postId) });
    user.posts = user.posts.filter((p) => p.id !== Number(postId));
    await user.save();

    cache.del('public_posts');
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[Delete Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting post: ' + error.message });
  }
});

// Create premium post
// Create premium post with activity logging
router.post('/premium-posts', authenticateToken, async (req, res) => {
  try {
    const { text, username, images, videos, timestamp, hashtags, userMentions } = req.body;
    if (!username || !text) {
      return res.status(400).json({ message: 'Username and text are required' });
    }

    const user = await User.findOne({ username, email: req.user.email });
    if (!user) {
      return res.status(403).json({ message: 'Unauthorized or user not found' });
    }

    const newPremiumPost = {
      id: Date.now().toString(),
      text,
      username,
      timestamp: timestamp || new Date().toISOString(),
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      likes: [],
      comments: [],
      hashtags: Array.isArray(hashtags) ? hashtags : extractHashtags(text),
      userMentions: Array.isArray(userMentions) ? userMentions : extractUserMentions(text),
    };

    user.premiumContent.push(newPremiumPost);
    await user.save();
    
    // ========== ADD ACTIVITY LOGGING FOR PREMIUM POST CREATED ==========
    try {
      const premiumPostActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'premium_post_created',
        data: {
          username: username,
          postId: newPremiumPost.id,
          textLength: text?.length || 0
        },
        adminUser: username,
        adminId: user._id,
        timestamp: new Date()
      });
      await premiumPostActivity.save();
      console.log('[Activity] Premium post created logged:', username);
    } catch (activityError) {
      console.error('[Activity] Failed to log premium post:', activityError);
    }
    
    res.status(201).json(newPremiumPost);
  } catch (error) {
    console.error('[Create Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error creating premium post: ' + error.message });
  }
});

// Update premium post
router.put('/premium-posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { text, images, videos, hashtags, userMentions } = req.body;
    if (!postId) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const premiumPostIndex = user.premiumContent.findIndex((p) => p.id === postId);
    if (premiumPostIndex === -1) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    const premiumPost = user.premiumContent[premiumPostIndex];
    premiumPost.text = text;
    premiumPost.images = Array.isArray(images) ? images : premiumPost.images;
    premiumPost.videos = Array.isArray(videos) ? videos : premiumPost.videos;
    premiumPost.hashtags = Array.isArray(hashtags) ? hashtags : extractHashtags(text);
    premiumPost.userMentions = Array.isArray(userMentions) ? userMentions : extractUserMentions(text); // NEW: Update user mentions

    await user.save();
    res.json(premiumPost);
  } catch (error) {
    console.error('[Update Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error updating premium post: ' + error.message });
  }
});

// Delete premium post
router.delete('/premium-posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const premiumPostIndex = user.premiumContent.findIndex((p) => p.id === postId);
    if (premiumPostIndex === -1) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    user.premiumContent.splice(premiumPostIndex, 1);
    await user.save();
    res.json({ message: 'Premium post deleted successfully' });
  } catch (error) {
    console.error('[Delete Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting premium post: ' + error.message });
  }
});

// Cancel subscription
router.post('/subscriptions/cancel', authenticateToken, async (req, res) => {
  const { username, planCode } = req.body;
  if (!username || !planCode) {
      return res.status(400).json({ message: 'Username and plan code are required' });
  }

  try {
      const result = await cancelSubscription(req.user.username, username, planCode);
      if (!result.success) {
          return res.status(400).json({ message: result.message });
      }

      res.json({ message: result.message });
  } catch (error) {
      console.error('[Cancel Subscription] Error:', error);
      res.status(500).json({ message: 'Server error cancelling subscription: ' + error.message });
  }
});

// FIXED: User posts endpoint with admin posts for ALL users
// FIXED: User posts endpoint with proper profile owner check
// =============================================
// In auth.js, update the /users/:username/posts endpoint:

router.get('/users/:username/posts', authenticateToken, async (req, res) => {
  console.log(`[User Posts] Fetching posts for: ${req.params.username}`);
  try {
    const { username } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const requesterUsername = req.user.username;
    const isAdmin = req.user.isAdmin;  // CRITICAL: Check if requester is admin

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 50);
    const skip = (pageNum - 1) * limitNum;

    // For admin - return ALL posts (both premium and normal) fast
    if (isAdmin) {
      console.log(`[User Posts] Admin access for ${username} - returning all posts`);
      
      // Get all posts from the target user (both normal and premium)
      const allPosts = [];
      
      // Get regular posts
      const regularPosts = await Post.find({ username })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      allPosts.push(...regularPosts);
      
      // Also get premium posts from user's premiumContent
      const targetUser = await User.findOne({ username }).select('premiumContent').lean();
      if (targetUser && targetUser.premiumContent && targetUser.premiumContent.length > 0) {
        const premiumPosts = targetUser.premiumContent
          .slice(skip, skip + limitNum)
          .map(post => ({ ...post, isPremium: true }));
        allPosts.push(...premiumPosts);
      }
      
      // Sort by timestamp
      allPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Limit final results
      const finalPosts = allPosts.slice(0, limitNum);
      
      console.log(`[User Posts] Admin fetched ${finalPosts.length} posts for ${username}`);
      
      return res.json({
        posts: finalPosts,
        total: finalPosts.length,
        hasMore: allPosts.length > limitNum
      });
    }

    // For non-admin users - use the existing logic
    const isProfileOwner = requesterUsername === username;
    
    // Get public posts (always visible)
    const publicPosts = await Post.find({ username, isPremium: false })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    let premiumPosts = [];
    
    // Only if profile owner or subscribed
    if (isProfileOwner) {
      const user = await User.findOne({ username }).select('premiumContent').lean();
      if (user && user.premiumContent) {
        premiumPosts = user.premiumContent
          .slice(skip, skip + limitNum)
          .map(post => ({ ...post, isPremium: true }));
      }
    } else {
      // Check subscription only for non-owners
      const isSubscribed = await checkSubscriptionStatus(requesterUsername, username);
      if (isSubscribed) {
        const user = await User.findOne({ username }).select('premiumContent').lean();
        if (user && user.premiumContent) {
          premiumPosts = user.premiumContent
            .slice(skip, skip + limitNum)
            .map(post => ({ ...post, isPremium: true }));
        }
      }
    }

    // Combine and sort
    let allPosts = [...publicPosts, ...premiumPosts];
    allPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`[User Posts] Non-admin fetched ${allPosts.length} posts for ${username}`);

    res.json({
      posts: allPosts,
      total: allPosts.length,
      hasMore: allPosts.length === limitNum
    });
    
  } catch (error) {
    console.error('[User Posts] Error:', error);
    res.status(500).json({ 
      posts: [], 
      error: error.message 
    });
  }
});


// Increment post views
router.post('/posts/:postId/views', async (req, res) => {
  try {
      const { postId } = req.params;
      const post = await Post.findOne({ id: Number(postId) });
      if (!post) {
          return res.status(404).json({ message: 'Post not found' });
      }

      post.views += 1;
      await post.save();
      res.json({ views: post.views });
  } catch (error) {
      console.error('[Increment Views] Error:', error);
      res.status(500).json({ message: 'Server error incrementing views: ' + error.message });
  }
});



// =============================================
// PAYOUT ROUTES
// =============================================

// Request payout
// Request payout - UPDATED TO ALLOW MULTIPLE REQUESTS
// =============================================
// ENHANCED PAYOUT REQUEST ROUTE - WITH BETTER TRACKING
// =============================================

// Request payout - with activity logging
router.post('/payouts/request', authenticateToken, async (req, res) => {
  console.log('[Payout Request] Request received');
  try {
      const { amount, bankName, accountNumber } = req.body;
      if (!amount || !bankName || !accountNumber) {
          return res.status(400).json({ message: 'Amount, bank name, and account number are required' });
      }

      const user = await User.findOne({ email: req.user.email });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      if (amount <= 0) {
          return res.status(400).json({ message: 'Amount must be greater than zero' });
      }

      if (amount < 100) {
          return res.status(400).json({ message: 'Minimum payout amount is ₦100' });
      }

      if (user.balance < amount) {
          return res.status(400).json({ message: 'Insufficient balance' });
      }

      const payoutRequestId = crypto.randomBytes(16).toString('hex');
      const payoutRequest = new PayoutRequest({
          id: payoutRequestId,
          userId: user._id,
          username: user.username,
          amount,
          bankName,
          accountNumber,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
          adminNote: ''
      });

      user.payoutRequests.push({
          id: payoutRequestId,
          amount,
          bankName,
          accountNumber,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
          adminNote: ''
      });

      user.balance -= amount;
      await Promise.all([payoutRequest.save(), user.save()]);
     
      // ========== ADD ACTIVITY LOGGING FOR PAYOUT REQUESTED ==========
      try {
        const payoutActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'payout_requested',
          data: {
            username: user.username,
            amount: amount,
            bankName: bankName,
            accountNumber: accountNumber,
            requestId: payoutRequestId
          },
          adminUser: user.username,
          adminId: user._id,
          timestamp: new Date()
        });
        await payoutActivity.save();
        console.log('[Activity] Payout requested logged:', user.username, amount);
      } catch (activityError) {
        console.error('[Activity] Failed to log payout request:', activityError);
      }
     
      // Send notification to admins
      try {
          const admins = await User.find({ isAdmin: true }).select('username fcmTokens').lean();
          const adminTokens = admins.flatMap(admin => admin.fcmTokens || []).filter(Boolean);
          if (adminTokens.length > 0) {
              await sendFCMNotification(
                  adminTokens,
                  '💰 New Payout Request',
                  `${user.username} requested ₦${amount.toLocaleString()} payout`,
                  { type: 'payout_request', username: user.username, amount: amount.toString(), requestId: payoutRequestId }
              );
          }
      } catch (notifError) {
          console.log('[FCM] Payout request notification failed:', notifError);
      }
     
      res.status(201).json({ 
          message: 'Payout request submitted', 
          payoutRequestId,
          newBalance: user.balance
      });
  } catch (error) {
      console.error('[Payout Request] Error:', error);
      res.status(500).json({ message: 'Server error requesting payout: ' + error.message });
  }
});

// Admin: Get all payout requests
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
// Admin: Process payout request - FIXED to accept both _id and id
// =============================================
// ADMIN: PROCESS PAYOUT REQUEST - FIXED
// =============================================

router.put('/admin/payout-requests/:requestId', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
      const { requestId } = req.params;
      const { status, adminNote } = req.body;

      console.log(`[Admin Payout] Processing request ${requestId} -> ${status}`);
      console.log(`[Admin Payout] Reason: ${adminNote || 'No reason provided'}`);

      if (!requestId) {
          return res.status(400).json({ message: 'Request ID is required' });
      }

      if (!['approved', 'rejected'].includes(status)) {
          return res.status(400).json({ message: 'Status must be approved or rejected' });
      }

      // Find by id field first
      let payoutRequest = await PayoutRequest.findOne({ id: requestId });
      
      // If not found, try by MongoDB _id
      if (!payoutRequest && mongoose.Types.ObjectId.isValid(requestId)) {
          payoutRequest = await PayoutRequest.findById(requestId);
      }
      
      if (!payoutRequest) {
          return res.status(404).json({ message: 'Payout request not found' });
      }

      const user = await User.findOne({ username: payoutRequest.username });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      if (payoutRequest.status !== 'pending') {
          return res.status(400).json({ 
              message: `Payout request already ${payoutRequest.status}`,
              currentStatus: payoutRequest.status
          });
      }

      // Update payout request
      payoutRequest.status = status;
      payoutRequest.updatedAt = new Date();
      payoutRequest.adminNote = adminNote || '';

      // Update user's payout requests array
      const userPayoutRequest = user.payoutRequests.find((pr) => pr.id === payoutRequest.id);
      if (userPayoutRequest) {
          userPayoutRequest.status = status;
          userPayoutRequest.updatedAt = new Date();
          userPayoutRequest.adminNote = adminNote || '';
      }

      if (status === 'rejected') {
          // Refund the amount to user's balance
          user.balance += payoutRequest.amount;
          console.log(`[Admin Payout] Rejected - Refunded ₦${payoutRequest.amount} to ${user.username}`);
      } else if (status === 'approved') {
          // Create transaction record for approved payout
          const transaction = new Transaction({
              id: crypto.randomBytes(16).toString('hex'),
              userId: user.username,
              type: 'payout',
              amount: payoutRequest.amount,
              description: `Payout approved: ${payoutRequest.bankName} (${payoutRequest.accountNumber})`,
              status: 'completed',
              createdAt: new Date(),
              relatedId: payoutRequest.id,
          });
          await transaction.save();
          console.log(`[Admin Payout] Approved - Payout of ₦${payoutRequest.amount} to ${user.username}`);
      }
      
      await Promise.all([payoutRequest.save(), user.save()]);
     
      // Send notification to user about payout status
      try {
          const statusMessage = status === 'approved' 
              ? `Your payout request for ₦${payoutRequest.amount.toLocaleString()} has been approved!`
              : `Your payout request for ₦${payoutRequest.amount.toLocaleString()} has been rejected.`;
          
          await sendNotificationToUser(
              user.username,
              `💰 Payout Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
              statusMessage + (adminNote ? `\nReason: ${adminNote}` : ''),
              { 
                  type: 'payout_status', 
                  status, 
                  amount: payoutRequest.amount.toString(), 
                  requestId: payoutRequest.id,
                  adminNote: adminNote || ''
              }
          );
      } catch (notifError) {
          console.log('[Admin Payout] Notification failed:', notifError);
      }
     
      console.log(`[Admin Payout] Successfully ${status} request ${payoutRequest.id}`);
      
      res.json({ 
          message: `Payout request ${status}`, 
          payoutRequest: {
              id: payoutRequest.id,
              status: payoutRequest.status,
              amount: payoutRequest.amount,
              adminNote: payoutRequest.adminNote,
              updatedAt: payoutRequest.updatedAt
          }
      });
  } catch (error) {
      console.error('[Admin Payout] Error:', error);
      res.status(500).json({ message: 'Server error processing payout: ' + error.message });
  }
});

// =============================================
// TRANSACTIONS & SUBSCRIPTIONS
// =============================================

// Get transactions
router.get('/transactions', authenticateToken, async (req, res) => {
  console.log('[Transactions] Fetch request received');
  try {
      const { fields } = req.query;
      const user = await User.findOne({ email: req.user.email });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      let projection = {};
      if (fields) {
          fields.split(',').forEach(field => {
              if (['id', 'type', 'amount', 'status', 'createdAt', 'reference'].includes(field.trim())) {
                  projection[field.trim()] = 1;
              }
          });
      } else {
          projection = { id: 1, type: 1, amount: 1, status: 1, createdAt: 1, reference: 1 };
      }

      const transactions = await Transaction.find({ userId: user.username })
          .select(projection)
          .lean();

      res.json(transactions);
  } catch (error) {
      console.error('[Transactions] Error:', error);
      res.status(500).json({ message: 'Server error fetching transactions: ' + error.message });
  }
});

// Get payout requests (for current user)
// =============================================
// GET PAYOUT REQUESTS FOR CURRENT USER - FIXED
// =============================================

router.get('/payout-requests', authenticateToken, async (req, res) => {
  console.log('[Payout Requests] Fetch request received');
  try {
      const { fields, includeAll = true } = req.query;
      const user = await User.findOne({ email: req.user.email });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Get ALL payout requests (not just pending) - include status, adminNote, updatedAt
      const payoutRequests = await PayoutRequest.find({ 
          userId: user.username 
      })
      .select('id amount bankName accountNumber status createdAt updatedAt adminNote')
      .sort({ createdAt: -1 })
      .lean();

      // Also check user.payoutRequests as fallback
      if (payoutRequests.length === 0 && user.payoutRequests && user.payoutRequests.length > 0) {
          console.log('[Payout Requests] Using user.payoutRequests as fallback');
          const fallbackRequests = user.payoutRequests.map(pr => ({
              id: pr.id,
              amount: pr.amount,
              bankName: pr.bankName,
              accountNumber: pr.accountNumber,
              status: pr.status,
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt || pr.createdAt,
              adminNote: pr.adminNote || ''
          }));
          return res.json(fallbackRequests);
      }

      console.log(`[Payout Requests] Found ${payoutRequests.length} requests for ${user.username}`);
      
      // Log for debugging
      payoutRequests.forEach(req => {
          console.log(`  - ${req.status}: ₦${req.amount} (${req.adminNote || 'No note'})`);
      });
      
      res.json(payoutRequests);
  } catch (error) {
      console.error('[Payout Requests] Error:', error);
      res.status(500).json({ message: 'Server error fetching payout requests: ' + error.message });
  }
});

// Get user's subscriptions
router.get('/subscriptions', authenticateToken, async (req, res) => {
  console.log('[Subscriptions] Fetch request received');
  try {
      const subscriberUsername = req.user.username;
      const { fields } = req.query;

      if (!subscriberUsername) {
          return res.status(401).json({ message: 'Authenticated user required' });
      }

      let projection = {};
      if (fields) {
          fields.split(',').forEach(field => {
              if (['subscriberId', 'targetUserId', 'planCode', 'amount', 'status'].includes(field.trim())) {
                  projection[field.trim()] = 1;
              }
          });
      } else {
          projection = { subscriberId: 1, targetUserId: 1, planCode: 1, amount: 1, status: 1 };
      }

      const subscriptions = await Subscription.find({
          subscriberId: subscriberUsername
      })
      .select(projection)
      .lean();

      res.json(subscriptions);
  } catch (error) {
      console.error('[Subscriptions] Error:', error);
      res.status(500).json({ message: 'Server error fetching subscriptions: ' + error.message });
  }
});

// Check subscription status for a specific user
router.get('/users/:targetUsername/subscription', authenticateToken, async (req, res) => {
  try {
      const { targetUsername } = req.params;
      const subscriberUsername = req.user.username;

      if (!subscriberUsername || !targetUsername) {
          return res.status(400).json({ message: 'Usernames required' });
      }

      if (subscriberUsername === targetUsername) {
          return res.json({ isSubscribed: true });
      }

      const isSubscribed = await checkSubscriptionStatus(subscriberUsername, targetUsername);
      res.json({ isSubscribed });
  } catch (error) {
      console.error('[Subscription Check] Error:', error);
      res.status(500).json({ message: 'Server error checking subscription: ' + error.message });
  }
});


// =============================================
// ADMIN ROUTES
// =============================================

// Delete user (Admin only)
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

// =============================================
// UTILITY ROUTES
// =============================================




router.get('/posts/with-admin', authenticateToken, async (req, res) => {
  const cacheKey = `posts_with_admin_${req.user.username}`;
  const bypassCache = req.query.bypassCache === 'true';
  const cachedPosts = !bypassCache ? cache.get(cacheKey) : null;

  if (cachedPosts) {
    return res.json(cachedPosts);
  }

  try {
    console.log(`[PostsWithAdmin] Fetching posts with admin posts for user: ${req.user.username}`);
    
    // Get user's accessible posts (including premium if subscribed)
    let userPosts = [];
    if (req.user.username) {
      // This would need to be implemented based on your user's subscriptions
      // For now, we'll get public posts and the user's own posts
      const publicPosts = await Post.find({ 
        $or: [
          { isPremium: false },
          { username: req.user.username } // User's own premium posts
        ]
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean()
      .exec();
      
      userPosts = publicPosts;
    } else {
      userPosts = await Post.find({ isPremium: false })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean()
        .exec();
    }

    // Get admin posts
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
    }

    // Insert admin posts every 6th post
    let allPosts = userPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(userPosts, adminPosts);
    }

    if (!bypassCache) {
      cache.set(cacheKey, allPosts, 300);
    }

    res.json(allPosts);
  } catch (error) {
    console.error('[PostsWithAdmin] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts: ' + error.message });
  }
});


// Search posts by hashtag (public only)
router.get('/posts/hashtag/:hashtag', async (req, res) => {
  try {
      const { hashtag } = req.params;
      if (!hashtag || hashtag.trim() === '') {
          return res.status(400).json({ message: 'Hashtag is required' });
      }

      const normalizedHashtag = hashtag.trim().toLowerCase().replace(/^#/, '');
      const posts = await Post.find({
          hashtags: normalizedHashtag,
          isPremium: false,
      })
          .sort({ timestamp: -1 })
          .limit(50)
          .lean();

      res.json(posts);
  } catch (error) {
      console.error('[Hashtag Search] Error:', error);
      res.status(500).json({ message: 'Server error fetching hashtag posts: ' + error.message });
  }
});

// NEW: Search posts by user mention
router.get('/posts/mention/:username', async (req, res) => {
  try {
      const { username } = req.params;
      if (!username || username.trim() === '') {
          return res.status(400).json({ message: 'Username is required' });
      }

      const normalizedUsername = username.trim().toLowerCase();
      const posts = await Post.find({
          userMentions: normalizedUsername,
          isPremium: false,
      })
          .sort({ timestamp: -1 })
          .limit(50)
          .lean();

      res.json(posts);
  } catch (error) {
      console.error('[Mention Search] Error:', error);
      res.status(500).json({ message: 'Server error fetching mention posts: ' + error.message });
  }
});

// Test email endpoint
router.post('/test-email', authenticateToken, async (req, res) => {
  try {
      const { toEmail, toName, fromUsername, messageText } = req.body;
      
      if (!toEmail || !fromUsername || !messageText) {
          return res.status(400).json({ message: 'toEmail, fromUsername, and messageText are required' });
      }

      console.log('[Email Test] Attempting to send test email...');
      const result = await sendEmailNotification(toEmail, toName, fromUsername, messageText, 'test-' + Date.now());
      
      if (!result) {
          return res.status(500).json({ message: 'Failed to send test email - check email configuration' });
      }
      
      const response = {
          message: 'Test email sent successfully',
          messageId: result.messageId,
          accepted: result.accepted,
          rejected: result.rejected
      };

      res.json(response);
  } catch (error) {
      console.error('[Email Test] Error:', error);
      res.status(500).json({ 
          message: 'Failed to send test email: ' + error.message,
          errorCode: error.code,
          response: error.response
      });
  }
});


// Health check
router.get('/health', async (req, res) => {
  try {
      const dbState = mongoose.connection.readyState;
      if (dbState !== 1) {
          return res.status(500).json({
              status: 'error',
              message: 'Database not connected',
              dbState,
          });
      }

      await mongoose.connection.db.command({ ping: 1 });
      res.json({
          status: 'ok',
          message: 'Server and database are healthy',
          dbState,
          dbName: mongoose.connection.name,
          emailInitialized: isEmailInitialized,
          emailTransporter: !!emailTransporter,
          gmailConfig: {
              user: GMAIL_CONFIG.user,
              configured: true
          }
      });
  } catch (error) {
      return res.status(500).json({
          status: 'error',
          message: error.message,
      });
  }
});

// =============================================
// EMAIL TESTING ROUTES
// =============================================

// Test email configuration
router.get('/test-email-config', authenticateToken, async (req, res) => {
  try {
      if (!emailTransporter) {
          return res.status(500).json({ 
              message: 'Email transporter not initialized',
              config: {
                  hasEmailUser: true,
                  hasEmailPass: true,
                  emailUser: GMAIL_CONFIG.user,
                  isEmailInitialized
              }
          });
      }

      // Test the connection
      emailTransporter.verify((error, success) => {
          if (error) {
              console.error('Email transporter verification failed:', error);
              return res.status(500).json({ 
                  message: 'Email transporter verification failed',
                  error: error.message,
                  code: error.code,
                  isEmailInitialized
              });
          } else {
              return res.json({ 
                  message: 'Email transporter is ready',
                  success: true,
                  isEthereal: false,
                  isEmailInitialized,
                  gmailUser: GMAIL_CONFIG.user
              });
          }
      });
  } catch (error) {
      console.error('Email config test error:', error);
      res.status(500).json({ 
          message: 'Email config test failed: ' + error.message,
          isEmailInitialized
      });
  }
});

// Reinitialize email transporter
router.post('/reinitialize-email', authenticateToken, async (req, res) => {
  try {
      console.log('[Email] Manually reinitializing email transporter...');
      await initializeEmailTransporter();
      
      res.json({
          message: 'Email transporter reinitialized',
          isEmailInitialized,
          hasTransporter: !!emailTransporter,
          gmailUser: GMAIL_CONFIG.user
      });
  } catch (error) {
      console.error('Email reinitialization error:', error);
      res.status(500).json({ 
          message: 'Failed to reinitialize email: ' + error.message,
          isEmailInitialized
      });
  }
});

// Add to auth.js routes

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

// Add this route to auth.js - Bulk user type query
router.post('/users/bulk-user-types', authenticateToken, async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log('[BulkUserTypes] Fetching user types for:', usernames.length, 'users');

    // Fetch users with only username and userType fields
    const users = await User.find(
      { username: { $in: usernames } },
      { username: 1, userType: 1, _id: 0 }
    ).lean();

    // Create a map of username to userType
    const userTypeMap = {};
    users.forEach(user => {
      userTypeMap[user.username] = user.userType || 'content_creator';
    });

    // Fill in missing usernames with default
    usernames.forEach(username => {
      if (!userTypeMap[username]) {
        userTypeMap[username] = 'content_creator';
      }
    });

    console.log('[BulkUserTypes] Returning user types for:', Object.keys(userTypeMap).length, 'users');
    
    res.json({ userTypeMap });
  } catch (error) {
    console.error('[BulkUserTypes] Error:', error);
    res.status(500).json({ message: 'Server error fetching user types: ' + error.message });
  }
});


// Add this debug route to auth.js to check admin posts
router.get('/debug/admin-posts', async (req, res) => {
  try {
    console.log('[Debug] Checking admin posts...');
    
    // Get all admin users
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    console.log('[Debug] Admin usernames:', adminUsernames);
    
    // Get posts from admin users
    const adminPosts = await Post.find({ 
      username: { $in: adminUsernames }
    })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();
    
    console.log('[Debug] Raw admin posts found:', adminPosts.length);
    
    // Check which ones are marked as admin posts
    const markedAdminPosts = adminPosts.filter(post => post.isAdminPost === true);
    console.log('[Debug] Posts with isAdminPost=true:', markedAdminPosts.length);
    
    // Get public posts to see what's actually being returned
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
      
    console.log('[Debug] Public posts sample:', publicPosts.map(p => ({
      id: p.id,
      username: p.username,
      isAdminPost: p.isAdminPost,
      hasGoldenBadge: p.hasGoldenBadge,
      text: p.text?.substring(0, 50)
    })));
    
    res.json({
      adminUsernames,
      totalAdminPosts: adminPosts.length,
      markedAdminPosts: markedAdminPosts.length,
      adminPosts: adminPosts.map(p => ({
        id: p.id,
        username: p.username,
        isAdminPost: p.isAdminPost,
        hasGoldenBadge: p.hasGoldenBadge,
        text: p.text?.substring(0, 50),
        timestamp: p.timestamp
      })),
      publicPostsSample: publicPosts.map(p => ({
        id: p.id,
        username: p.username,
        isAdminPost: p.isAdminPost,
        hasGoldenBadge: p.hasGoldenBadge
      }))
    });
    
  } catch (error) {
    console.error('[Debug] Error:', error);
    res.status(500).json({ message: 'Debug error: ' + error.message });
  }
});


// Test route to create an admin post
router.post('/test/create-admin-post', async (req, res) => {
  try {
    const { text, username } = req.body;
    
    if (!text || !username) {
      return res.status(400).json({ message: 'Text and username are required' });
    }

    // Find the user to verify they are admin
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('[Test] Creating admin post for user:', username, 'isAdmin:', user.isAdmin);

    const postCount = await Post.countDocuments();
    const newPost = new Post({
      id: postCount + 1,
      text: text || 'Test Admin Post - This should appear for all users!',
      username: username,
      timestamp: new Date().toISOString(),
      images: [],
      videos: [],
      likes: [],
      comments: [],
      views: 0,
      isPremium: false,
      hashtags: ['test', 'admin'],
      userMentions: [],
      isAdminPost: true, // Explicitly mark as admin post
      hasGoldenBadge: true, // Add golden badge
    });

    await newPost.save();
    
    // Also add to user's posts
    const adminUser = await User.findOne({ username });
    if (adminUser) {
      adminUser.posts.unshift({ ...newPost.toObject(), isAdminPost: true, hasGoldenBadge: true });
      await adminUser.save();
    }

    // Clear cache
    cache.del('public_posts');
    cache.del('all_posts_with_admin');

    console.log('[Test] Admin post created successfully:', {
      id: newPost.id,
      username: newPost.username,
      isAdminPost: newPost.isAdminPost,
      hasGoldenBadge: newPost.hasGoldenBadge
    });

    res.status(201).json({
      message: 'Admin test post created successfully',
      post: newPost
    });
  } catch (error) {
    console.error('[Test Admin Post] Error:', error);
    res.status(500).json({ message: 'Server error creating test admin post: ' + error.message });
  }
});



// In auth.js - Add this route to properly fetch posts with admin posts for ALL users
// Change the /all/posts route (around line 2482-2520)
router.get('/all/posts', checkDbConnection, async (req, res) => {
  const cacheKey = 'all_posts_with_admin';
  const bypassCache = req.query.bypassCache === 'true';
  const cachedPosts = !bypassCache ? cache.get(cacheKey) : null;

  if (cachedPosts) {
    return res.json(cachedPosts);
  }

  try {

    console.log('[All Posts] Fetching all posts with admin posts for ALL users...');

    // REMOVE LIMIT: Get regular public posts
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    // Get admin posts for ALL users
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean(); // REMOVED LIMIT
    }

    console.log('[All Posts] Found:', {
      publicPosts: publicPosts.length,
      adminPosts: adminPosts.length,
      adminUsernames
    });

    // Insert admin posts every 6th post
    let allPosts = [];
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
      console.log('[All Posts] After insertion:', allPosts.length);
    } else {
      allPosts = publicPosts;
    }

    if (!bypassCache) {
      cache.set(cacheKey, allPosts, 300);
    }

    res.json(allPosts);
  } catch (error) {
    console.error('[All Posts] Error:', error);
    cache.del(cacheKey);
    res.status(500).json({ message: 'Server error fetching all posts: ' + error.message });
  }
});

// Debug route to check admin posts
router.get('/debug/admin-posts', async (req, res) => {
  try {
    console.log('[Debug] Checking admin posts...');
    
    // Get all admin users
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    console.log('[Debug] Admin usernames:', adminUsernames);
    
    // Get posts from admin users
    const adminPosts = await Post.find({ 
      username: { $in: adminUsernames }
    })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();
    
    console.log('[Debug] Raw admin posts found:', adminPosts.length);
    
    // Check which ones are marked as admin posts
    const markedAdminPosts = adminPosts.filter(post => post.isAdminPost === true);
    console.log('[Debug] Posts with isAdminPost=true:', markedAdminPosts.length);
    
    // Get public posts to see what's actually being returned
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
      
    console.log('[Debug] Public posts sample:', publicPosts.map(p => ({
      id: p.id,
      username: p.username,
      isAdminPost: p.isAdminPost,
      hasGoldenBadge: p.hasGoldenBadge,
      text: p.text?.substring(0, 50)
    })));
    
    res.json({
      adminUsernames,
      totalAdminPosts: adminPosts.length,
      markedAdminPosts: markedAdminPosts.length,
      adminPosts: adminPosts.map(p => ({
        id: p.id,
        username: p.username,
        isAdminPost: p.isAdminPost,
        hasGoldenBadge: p.hasGoldenBadge,
        text: p.text?.substring(0, 50),
        timestamp: p.timestamp
      })),
      publicPostsSample: publicPosts.map(p => ({
        id: p.id,
        username: p.username,
        isAdminPost: p.isAdminPost,
        hasGoldenBadge: p.hasGoldenBadge
      }))
    });
    
  } catch (error) {
    console.error('[Debug] Error:', error);
    res.status(500).json({ message: 'Debug error: ' + error.message });
  }
});


// Public search route for unlogged users
router.get('/public/search/users', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { location: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex }
      ],
    }).select('username profilePicture firstName lastName location city country bio userType').lean();

    // Ensure backward compatibility for old users without userType
    const usersWithDefaultType = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator'
    }));

    res.json(usersWithDefaultType);
  } catch (error) {
    console.error('[Public Users Search] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});

// Public general search route
router.get('/public/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q, 'i');
    
    // Search users
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { location: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex }
      ],
    }).select('username profilePicture firstName lastName location city country bio userType').lean();

    // Search posts for additional context
    const posts = await Post.find({
      $or: [
        { text: searchRegex },
        { hashtags: q.toLowerCase() }
      ],
      isPremium: false
    }).select('username text hashtags timestamp').limit(10).lean();

    const usersWithDefaultType = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator'
    }));

    res.json({
      users: usersWithDefaultType,
      posts: posts
    });
  } catch (error) {
    console.error('[Public Search] Error:', error);
    res.status(500).json({ message: 'Server error performing search: ' + error.message });
  }
});

// Comprehensive public search route for unlogged users
router.get('/public/search/users', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    console.log('[Public Search] Searching for:', q);
    
    const searchRegex = new RegExp(q, 'i');
    
    // Search across ALL user fields
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex },
        { postalCode: searchRegex }
      ],
    }).select('username profilePicture firstName lastName name location city country bio userType').lean();

    console.log('[Public Search] Found users:', users.length);

    // Ensure backward compatibility for old users without userType
    const usersWithDefaultType = users.map(user => ({
      username: user.username,
      profilePicture: user.profilePicture,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      location: user.location,
      city: user.city,
      country: user.country,
      bio: user.bio,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    }));

    res.json(usersWithDefaultType);
  } catch (error) {
    console.error('[Public Users Search] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});

// Public user search with simpler endpoint
router.get('/public/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ]
    }).select('username profilePicture location city country bio firstName lastName userType').lean();

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    }));

    res.json(enhancedUsers);
  } catch (error) {
    console.error('[Public User Search] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get all public users (for fallback search)
router.get('/public/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('username profilePicture firstName lastName location city country bio userType')
      .limit(1000)
      .lean();

    const usersWithDefaultType = users.map(user => ({
      username: user.username,
      profilePicture: user.profilePicture,
      firstName: user.firstName,
      lastName: user.lastName,
      location: user.location,
      city: user.city,
      country: user.country,
      bio: user.bio,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    }));

    res.json(usersWithDefaultType);
} catch (error) {
    console.error('[Public Users] Error:', error);
    res.status(500).json({ message: 'Server error fetching users: ' + error.message });
  }
});

// =============================================
// NEW ROUTES FOR USER BIO AND COUNTRY/STATE DISPLAY
// =============================================


// =============================================
// PUBLIC SEARCH ROUTES FOR UNLOGGED USERS
// =============================================

// Public search users endpoint
// Public search users endpoint
router.get('/public/search/users', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchRegex = new RegExp(q.trim(), 'i');
    
    // Search across all user fields including location data
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ],
    }).select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers').lean();

    // Ensure backward compatibility and include ALL location data
    const usersWithLocationData = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      // Ensure ALL location fields exist
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followers: user.followers || [],
      following: user.following || [],
      subscribers: user.subscribers || 0
    }));

    console.log(`[Public Search] Found ${usersWithLocationData.length} users with location data for query: "${q}"`);
    res.json(usersWithLocationData);
  } catch (error) {
    console.error('[Public Search] Error:', error);
    res.status(500).json({ message: 'Server error performing search: ' + error.message });
  }
});

// Public users search with simpler endpoint
router.get('/public/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ]
    }).select('username profilePicture location city country bio firstName lastName userType').lean();

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    }));

    res.json(enhancedUsers);
  } catch (error) {
    console.error('[Public User Search] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get all public users (for fallback search)
// Get all public users (for fallback search)
router.get('/public/users', async (req, res) => {
  try {
    const { limit = 1000 } = req.query;
    
    const users = await User.find({})
      .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
      .limit(parseInt(limit))
      .lean();

    const usersWithLocationData = users.map(user => ({
      username: user.username,
      profilePicture: user.profilePicture,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      followers: user.followers || [],
      following: user.following || [],
      subscribers: user.subscribers || 0
    }));

    console.log(`[Public Users] Returning ${usersWithLocationData.length} users with location data`);
    res.json(usersWithLocationData);
  } catch (error) {
    console.error('[Public Users] Error:', error);
    res.status(500).json({ message: 'Server error fetching users: ' + error.message });
  }
});

// Debug route to check user data
router.get('/debug/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log('[Debug User] Checking user data for:', username);

    // Get user with ALL fields to see what's actually in the database
    const user = await User.findOne({ username }).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check what location fields exist
    const locationFields = {
      location: user.location,
      city: user.city,
      country: user.country,
      state: user.state,
      bio: user.bio
    };

    console.log('[Debug User] Location fields found:', locationFields);

    res.json({
      username: user.username,
      exists: true,
      locationFields: locationFields,
      hasLocationData: user.location || user.city || user.country || user.state || user.bio,
      allFields: Object.keys(user).filter(key => 
        ['location', 'city', 'country', 'state', 'bio', 'firstName', 'lastName', 'name'].includes(key)
      )
    });
  } catch (error) {
    console.error('[Debug User] Error:', error);
    res.status(500).json({ message: 'Debug error: ' + error.message });
  }
});

// Public hashtag search
router.get('/public/hashtag/:hashtag', async (req, res) => {
  try {
    const { hashtag } = req.params;
    if (!hashtag || hashtag.trim() === '') {
      return res.status(400).json({ message: 'Hashtag is required' });
    }

    const normalizedHashtag = hashtag.trim().toLowerCase();
    const posts = await Post.find({
      hashtags: normalizedHashtag,
      isPremium: false,
    })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    console.log(`[Public Hashtag] Found ${posts.length} posts for hashtag: #${normalizedHashtag}`);
    res.json(posts);
  } catch (error) {
    console.error('[Public Hashtag] Error:', error);
    res.status(500).json({ message: 'Server error fetching hashtag posts: ' + error.message });
  }
});

// Public general search endpoint
router.get('/public/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json({ users: [], posts: [] });
    }

    const searchRegex = new RegExp(q, 'i');
    
    // Search users
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { location: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { bio: searchRegex }
      ],
    }).select('username profilePicture firstName lastName location city country bio userType').lean();

    // Search posts for additional context
    const posts = await Post.find({
      $or: [
        { text: searchRegex },
        { hashtags: q.toLowerCase() }
      ],
      isPremium: false
    }).select('username text hashtags timestamp images videos').limit(10).lean();

    const usersWithDefaultType = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator'
    }));

    res.json({
      users: usersWithDefaultType,
      posts: posts
    });
  } catch (error) {
    console.error('[Public Search] Error:', error);
    res.status(500).json({ message: 'Server error performing search: ' + error.message });
  }
});

// =============================================
// ADDITIONAL MISSING ROUTES
// =============================================

// Delete post route
router.delete('/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const post = await Post.findOne({ id: Number(postId), username: user.username });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    await Post.deleteOne({ id: Number(postId) });
    user.posts = user.posts.filter((p) => p.id !== Number(postId));
    await user.save();

    cache.del('public_posts');
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[Delete Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting post: ' + error.message });
  }
});

// Delete premium post route
router.delete('/premium-posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const premiumPostIndex = user.premiumContent.findIndex((p) => p.id === postId);
    if (premiumPostIndex === -1) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    user.premiumContent.splice(premiumPostIndex, 1);
    await user.save();
    
    res.json({ message: 'Premium post deleted successfully' });
  } catch (error) {
    console.error('[Delete Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting premium post: ' + error.message });
  }
});


// =============================================
// PUBLIC ROUTES FOR NON-LOGGED-IN USERS - FIXED VERSION
// =============================================

// Public get single post by ID - FIXED VERSION
router.get('/public/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    console.log('[Public Post] Fetching post with ID:', id);

    // Convert id to number for posts collection lookup
    const postId = Number(id);
    
    // First try to find in posts collection with number ID
    let post = await Post.findOne({ 
      id: postId,
      isPremium: false // Only return non-premium posts via public endpoint
    }).lean();

    // If not found, try with string ID (for premium posts converted to regular)
    if (!post) {
      post = await Post.findOne({ 
        id: id, // Try string ID
        isPremium: false
      }).lean();
    }

    // If still not found in posts collection, search through all users' posts
    if (!post) {
      console.log('[Public Post] Not found in posts collection, searching user posts...');
      
      const allUsers = await User.find({}).select('username posts profilePicture').lean();
      
      for (const user of allUsers) {
        if (!user.posts || !Array.isArray(user.posts)) continue;
        
        // Try to find post by numeric ID
        let userPost = user.posts.find(p => 
          p.id === postId && !p.isPremium
        );
        
        // If not found, try by string ID or _id
        if (!userPost) {
          userPost = user.posts.find(p => 
            (p.id?.toString() === id || p._id?.toString() === id) && 
            !p.isPremium
          );
        }
        
        if (userPost) {
          post = {
            ...userPost,
            _id: userPost._id || userPost.id, // Ensure _id is set
            username: user.username,
            userProfilePicture: user.profilePicture,
            // Ensure all required fields are present
            likes: userPost.likes || [],
            comments: userPost.comments || [],
            views: userPost.views || 0,
            images: userPost.images || [],
            videos: userPost.videos || [],
            hashtags: userPost.hashtags || [],
            userMentions: userPost.userMentions || [],
            isPremium: false,
            isAdminPost: userPost.isAdminPost || false,
            hasGoldenBadge: userPost.hasGoldenBadge || false
          };
          console.log('[Public Post] Found in user posts:', user.username);
          break;
        }
      }
    }

    if (!post) {
      console.log('[Public Post] Post not found with ID:', id);
      return res.status(404).json({ message: 'Post not found or requires authentication' });
    }

    console.log('[Public Post] Found post:', {
      id: post.id,
      _id: post._id,
      username: post.username,
      isPremium: post.isPremium,
      text: post.text ? post.text.substring(0, 50) + '...' : 'No text'
    });

    res.json(post);
  } catch (error) {
    console.error('[Public Post] Error:', error);
    res.status(500).json({ message: 'Server error fetching post: ' + error.message });
  }
});

// Enhanced public get premium post by ID
router.get('/public/premium-posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    console.log('[Public Premium Post] Fetching premium post with ID:', id);

    // Find the user who owns this premium post
    const users = await User.find({}).select('username premiumContent profilePicture').lean();

    let premiumPost = null;
    let postOwner = null;

    for (const user of users) {
      if (!user.premiumContent || !Array.isArray(user.premiumContent)) continue;
      
      const foundPost = user.premiumContent.find(p => 
        p.id === id || p.id?.toString() === id || p._id?.toString() === id
      );
      
      if (foundPost) {
        premiumPost = foundPost;
        postOwner = user;
        break;
      }
    }

    if (!premiumPost || !postOwner) {
      return res.status(404).json({ message: 'Premium post not found' });
    }

    // Return limited data for non-authenticated users
    const limitedPost = {
      id: premiumPost.id || premiumPost._id,
      username: postOwner.username,
      userProfilePicture: postOwner.profilePicture,
      isPremium: true,
      timestamp: premiumPost.timestamp,
      text: '🔒 Premium content - Subscribe to view this post',
      images: [],
      videos: [],
      likes: premiumPost.likes?.length || 0,
      comments: [],
      views: premiumPost.views || 0,
      hashtags: [],
      userMentions: [],
      isAdminPost: premiumPost.isAdminPost || false,
      hasGoldenBadge: premiumPost.hasGoldenBadge || false,
      requiresSubscription: true
    };

    console.log('[Public Premium Post] Returning limited data for premium post:', id);
    res.json(limitedPost);
  } catch (error) {
    console.error('[Public Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error fetching premium post: ' + error.message });
  }
});

// Debug route to check all posts
router.get('/debug/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('[Debug Post] Searching for post with ID:', id);

    // Search in posts collection
    const postInCollection = await Post.findOne({
      $or: [
        { id: Number(id) },
        { id: id },
        { _id: id }
      ]
    }).lean();

    // Search in all users' posts
    const allUsers = await User.find({}).select('username posts premiumContent').lean();
    
    let postInUserPosts = null;
    let postInPremiumContent = null;
    let foundUser = null;

    for (const user of allUsers) {
      // Check regular posts
      if (user.posts && Array.isArray(user.posts)) {
        const found = user.posts.find(p => 
          p.id === Number(id) || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        if (found) {
          postInUserPosts = found;
          foundUser = user;
          break;
        }
      }
      
      // Check premium content
      if (user.premiumContent && Array.isArray(user.premiumContent)) {
        const found = user.premiumContent.find(p => 
          p.id === id || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        if (found) {
          postInPremiumContent = found;
          foundUser = user;
          break;
        }
      }
    }

    res.json({
      searchId: id,
      inPostsCollection: postInCollection ? {
        id: postInCollection.id,
        _id: postInCollection._id,
        username: postInCollection.username,
        isPremium: postInCollection.isPremium,
        text: postInCollection.text
      } : null,
      inUserPosts: postInUserPosts ? {
        id: postInUserPosts.id,
        _id: postInUserPosts._id,
        username: foundUser?.username,
        isPremium: postInUserPosts.isPremium,
        text: postInUserPosts.text
      } : null,
      inPremiumContent: postInPremiumContent ? {
        id: postInPremiumContent.id,
        _id: postInPremiumContent._id,
        username: foundUser?.username,
        isPremium: true,
        text: postInPremiumContent.text
      } : null,
      totalUsers: allUsers.length
    });

  } catch (error) {
    console.error('[Debug Post] Error:', error);
    res.status(500).json({ message: 'Debug error: ' + error.message });
  }
});
// Comprehensive post search across all locations
router.get('/find-post/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('[Find Post] Comprehensive search for ID:', id);

    let post = null;
    let source = '';

    // 1. Try posts collection first
    post = await Post.findOne({
      $or: [
        { id: Number(id) },
        { id: id },
        { _id: id }
      ]
    }).lean();

    if (post) {
      source = 'posts_collection';
      console.log('[Find Post] Found in posts collection');
    }

    // 2. If not found, search all users' regular posts
    if (!post) {
      const allUsers = await User.find({}).select('username posts profilePicture').lean();
      
      for (const user of allUsers) {
        if (!user.posts || !Array.isArray(user.posts)) continue;
        
        const userPost = user.posts.find(p => 
          p.id === Number(id) || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        
        if (userPost) {
          post = {
            ...userPost,
            username: user.username,
            userProfilePicture: user.profilePicture,
            // Ensure all fields
            likes: userPost.likes || [],
            comments: userPost.comments || [],
            views: userPost.views || 0,
            images: userPost.images || [],
            videos: userPost.videos || [],
            hashtags: userPost.hashtags || [],
            userMentions: userPost.userMentions || [],
            isPremium: userPost.isPremium || false,
            isAdminPost: userPost.isAdminPost || false,
            hasGoldenBadge: userPost.hasGoldenBadge || false
          };
          source = 'user_posts';
          console.log('[Find Post] Found in user posts:', user.username);
          break;
        }
      }
    }

    // 3. If still not found, search premium content
    if (!post) {
      const allUsers = await User.find({}).select('username premiumContent profilePicture').lean();
      
      for (const user of allUsers) {
        if (!user.premiumContent || !Array.isArray(user.premiumContent)) continue;
        
        const premiumPost = user.premiumContent.find(p => 
          p.id === id || 
          p.id?.toString() === id || 
          p._id?.toString() === id
        );
        
        if (premiumPost) {
          post = {
            ...premiumPost,
            username: user.username,
            userProfilePicture: user.profilePicture,
            isPremium: true,
            // Ensure all fields
            likes: premiumPost.likes || [],
            comments: premiumPost.comments || [],
            views: premiumPost.views || 0,
            images: premiumPost.images || [],
            videos: premiumPost.videos || [],
            hashtags: premiumPost.hashtags || [],
            userMentions: premiumPost.userMentions || [],
            isAdminPost: premiumPost.isAdminPost || false,
            hasGoldenBadge: premiumPost.hasGoldenBadge || false
          };
          source = 'premium_content';
          console.log('[Find Post] Found in premium content:', user.username);
          break;
        }
      }
    }

    if (!post) {
      console.log('[Find Post] Post not found anywhere with ID:', id);
      return res.status(404).json({ 
        message: 'Post not found',
        searchedId: id
      });
    }

    console.log('[Find Post] Successfully found post:', {
      id: post.id,
      source,
      username: post.username,
      isPremium: post.isPremium
    });

    res.json({
      ...post,
      _source: source
    });

  } catch (error) {
    console.error('[Find Post] Error:', error);
    res.status(500).json({ message: 'Server error finding post: ' + error.message });
  }
});

// Public get user profile with bio and location
// Public get user profile with bio and location
// Public user profile with bio and location
// Public get user profile with bio and location - FIXED VERSION
// Update the public user profile route
// Update the public users endpoint in auth.js
router.get('/public/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    console.log(`[Public User] Fetching profile for: ${username}, unlogged user`);
    
    const user = await User.findOne({ username }).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // For public endpoint (unlogged users), check visibility
    const visibility = user.numbersVisibility || 'all_users';
    
    // Use the fixed shouldHidePhoneForUser function
    const shouldHidePhone = await shouldHidePhoneForUser(username, null, visibility);
    
    console.log(`[Public User] Phone visibility check:`, {
      username,
      visibility,
      shouldHidePhone,
      phoneNumberInDB: user.phoneNumber,
      phoneNumberType: typeof user.phoneNumber
    });

    const userResponse = {
      username: user.username,
      name: user.displayName || user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      followers: user.followers || [],
      following: user.following || [],
      subscribers: user.subscribers || 0,
      userType: user.userType || 'content_creator',
      isAdmin: user.isAdmin || false,
      profilePicture: user.profilePicture || null,
      bio: user.bio || '',
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      website: user.website || '',
      socialLinks: user.socialLinks || { twitter: '', instagram: '', youtube: '' },
      images: user.images || [],
      videos: user.videos || [],
      premiumPricing: user.premiumPricing || { weekly: 0, monthly: 0, yearly: 0 },
      messagesFromPremiumOnly: user.messagesFromPremiumOnly || false,
      numbersVisibility: visibility,
      createdAt: user.createdAt
    };

    // Include phone number if allowed
    if (!shouldHidePhone) {
      userResponse.phoneNumber = user.phoneNumber || '';
    } else {
      userResponse.phoneNumber = '';
    }

    console.log(`[Public User] Final response:`, {
      username,
      phoneNumberInResponse: userResponse.phoneNumber,
      phoneNumberLength: userResponse.phoneNumber?.length,
      numbersVisibility: userResponse.numbersVisibility
    });

    res.json(userResponse);
  } catch (error) {
    console.error('[Public User] Error:', error);
    res.status(500).json({ message: 'Server error fetching public user: ' + error.message });
  }
});
// Add a test endpoint to debug phone visibility
router.get('/test/phone-visibility/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const requesterUsername = req.user?.username || null;
    
    console.log(`[Test Phone] Testing visibility for ${username}, requester: ${requesterUsername || 'unlogged'}`);
    
    const user = await User.findOne({ username }).select('phoneNumber numbersVisibility').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const shouldHide = await shouldHidePhoneForUser(username, requesterUsername, user.numbersVisibility);
    
    res.json({
      username,
      phoneNumberInDB: user.phoneNumber,
      phoneNumberType: typeof user.phoneNumber,
      numbersVisibility: user.numbersVisibility || 'all_users',
      shouldHidePhone: shouldHide,
      canSeePhone: !shouldHide,
      requester: requesterUsername || 'unlogged'
    });
  } catch (error) {
    console.error('[Test Phone] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Public get user's public posts
router.get('/public/users/:username/posts', async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

  
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('[Public User Posts] Fetching posts for:', username);

    // Get user's public posts from posts collection
    const publicPosts = await Post.find({ 
      username, 
      isPremium: false 
    })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

    // Get user info
    const user = await User.findOne({ username }).select(`
      premiumPricing 
      premiumPlans 
      premiumContent
    `).lean();

    const hasPremiumContent = user && user.premiumContent && user.premiumContent.length > 0;

    // Get admin posts and insert them
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let allPosts = publicPosts;
    
    if (adminUsernames.length > 0) {
      const adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
      
      if (adminPosts.length > 0) {
        allPosts = insertAdminPosts(publicPosts, adminPosts);
      }
    }

    const response = {
      posts: allPosts,
      hasPremiumContent,
      isSubscribed: false, // Non-logged-in users are never subscribed
      isProfileOwner: false, // Non-logged-in users are never profile owners
      premiumPricing: user?.premiumPricing || { weekly: 0, monthly: 0, yearly: 0 },
      premiumPlans: user?.premiumPlans || []
    };

    console.log('[Public User Posts] Returning:', {
      postsCount: response.posts.length,
      hasPremiumContent: response.hasPremiumContent,
      username
    });

    res.json(response);
  } catch (error) {
    console.error('[Public User Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching user posts: ' + error.message });
  }
});

// =============================================
// NEW ROUTES FOR USER BIO AND COUNTRY/STATE DISPLAY
// =============================================

// Get all users with bio and location (for logged-in users)
router.get('/users-with-bio', authenticateToken, async (req, res) => {
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
          { firstName: searchRegex },
          { lastName: searchRegex },
          { location: searchRegex },
          { city: searchRegex },
          { country: searchRegex },
          { state: searchRegex },
          { bio: searchRegex }
        ]
      };
    }

    const users = await User.find(query)
      .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments(query);

    // Enhance user data with display names
    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

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
    console.error('[Users With Bio] Error:', error);
    res.status(500).json({ message: 'Server error fetching users: ' + error.message });
  }
});

// Get user profile with enhanced bio and location data
router.get('/users/:username/profile-full', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    console.log('[User Profile Full] Fetching full profile for:', username);

    const user = await User.findOne({ username }).select(`
      username 
      profilePicture 
      firstName 
      lastName 
      name 
      location 
      city 
      country 
      state
      bio 
      userType 
      subscribers
      followers
      following
      website
      premiumPricing
      premiumPlans
      isAdmin
      createdAt
      images
      videos
    `).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's public post count
    const publicPostCount = await Post.countDocuments({ 
      username, 
      isPremium: false 
    });

    // Get user's premium post count
    const premiumPostCount = user.premiumContent ? user.premiumContent.length : 0;

    // Enhance user data
    const enhancedUser = {
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      socialLinks: user.website || { twitter: '', instagram: '', youtube: '' },
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      stats: {
        publicPosts: publicPostCount,
        premiumPosts: premiumPostCount,
        followers: user.followers ? user.followers.length : 0,
        following: user.following ? user.following.length : 0,
        subscribers: user.subscribers || 0
      },
      // Remove sensitive fields
      website: undefined
    };

    console.log('[User Profile Full] Found user:', enhancedUser.username);
    res.json(enhancedUser);
  } catch (error) {
    console.error('[User Profile Full] Error:', error);
    res.status(500).json({ message: 'Server error fetching user profile: ' + error.message });
  }
});

// Search users by location and bio
router.get('/search/users-by-location', authenticateToken, async (req, res) => {
  try {
    const { location, country, city, state, bio } = req.query;
    
    if (!location && !country && !city && !state && !bio) {
      return res.status(400).json({ message: 'At least one search parameter is required' });
    }

    let query = {
      $or: []
    };

    if (location) {
      const locationRegex = new RegExp(location, 'i');
      query.$or.push(
        { location: locationRegex },
        { city: locationRegex },
        { country: locationRegex },
        { state: locationRegex }
      );
    }

    if (country) {
      const countryRegex = new RegExp(country, 'i');
      query.$or.push({ country: countryRegex });
    }

    if (city) {
      const cityRegex = new RegExp(city, 'i');
      query.$or.push({ city: cityRegex });
    }

    if (state) {
      const stateRegex = new RegExp(state, 'i');
      query.$or.push({ state: stateRegex });
    }

    if (bio) {
      const bioRegex = new RegExp(bio, 'i');
      query.$or.push({ bio: bioRegex });
    }

    // If no OR conditions were added, return empty
    if (query.$or.length === 0) {
      return res.json([]);
    }

    const users = await User.find(query)
      .select('username profilePicture firstName lastName location city country state bio userType followers')
      .limit(100)
      .lean();

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followerCount: user.followers ? user.followers.length : 0
    }));

    console.log(`[Search Users By Location] Found ${enhancedUsers.length} users`);
    res.json(enhancedUsers);
  } catch (error) {
    console.error('[Search Users By Location] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});

// Update user bio and location
router.put('/users/:username/bio-location', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email !== req.user.email) {
      return res.status(403).json({ message: 'Unauthorized to update this profile' });
    }

    // Parse the request body
    let updateData = {};
    if (req.body.data) {
      try {
        updateData = JSON.parse(req.body.data);
      } catch (e) {
        updateData = req.body;
      }
    } else {
      updateData = req.body;
    }

    console.log('[Update Bio Location] Received data:', updateData);

    // Update bio and location fields
    if (updateData.bio !== undefined) user.bio = updateData.bio;
    if (updateData.location !== undefined) user.location = updateData.location;
    if (updateData.city !== undefined) user.city = updateData.city;
    if (updateData.country !== undefined) user.country = updateData.country;
    if (updateData.state !== undefined) user.state = updateData.state;

    // Handle profile picture update
    if (req.file) {
      user.profilePicture = `/uploads/${req.file.filename}`;
    } else if (updateData.profilePicture !== undefined) {
      user.profilePicture = updateData.profilePicture || '';
    }

    // Save the user
    await user.save();

    // Fetch the updated user
    const updatedUser = await User.findOne({ username: user.username })
      .select('username profilePicture firstName lastName location city country state bio userType')
      .lean();

    // Ensure all fields exist
    const responseUser = {
      ...updatedUser,
      userType: updatedUser.userType || 'content_creator',
      location: updatedUser.location || '',
      city: updatedUser.city || '',
      country: updatedUser.country || '',
      state: updatedUser.state || '',
      bio: updatedUser.bio || ''
    };

    console.log('[Update Bio Location] User updated successfully');
    res.json(responseUser);
  } catch (error) {
    console.error('[Update Bio Location] Error:', error);
    res.status(500).json({ message: 'Server error updating bio and location: ' + error.message });
  }
});

// Get users by country
router.get('/users/country/:country', authenticateToken, async (req, res) => {
  try {
    const { country } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!country) {
      return res.status(400).json({ message: 'Country is required' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const countryRegex = new RegExp(country, 'i');
    
    const users = await User.find({ country: countryRegex })
      .select('username profilePicture firstName lastName location city country state bio userType followers')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments({ country: countryRegex });

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followerCount: user.followers ? user.followers.length : 0
    }));

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
    console.error('[Users By Country] Error:', error);
    res.status(500).json({ message: 'Server error fetching users by country: ' + error.message });
  }
});

// Get users by state
router.get('/users/state/:state', authenticateToken, async (req, res) => {
  try {
    const { state } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!state) {
      return res.status(400).json({ message: 'State is required' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const stateRegex = new RegExp(state, 'i');
    
    const users = await User.find({ state: stateRegex })
      .select('username profilePicture firstName lastName location city country state bio userType followers')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments({ state: stateRegex });

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followerCount: user.followers ? user.followers.length : 0
    }));

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
    console.error('[Users By State] Error:', error);
    res.status(500).json({ message: 'Server error fetching users by state: ' + error.message });
  }
});

// Get users by city
router.get('/users/city/:city', authenticateToken, async (req, res) => {
  try {
    const { city } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!city) {
      return res.status(400).json({ message: 'City is required' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const cityRegex = new RegExp(city, 'i');
    
    const users = await User.find({ city: cityRegex })
      .select('username profilePicture firstName lastName location city country state bio userType followers')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments({ city: cityRegex });

    const enhancedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followerCount: user.followers ? user.followers.length : 0
    }));

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
    console.error('[Users By City] Error:', error);
    res.status(500).json({ message: 'Server error fetching users by city: ' + error.message });
  }
});

// In auth.js - Add this comprehensive hashtag search endpoint
router.get('/api/public/hashtag-enhanced/:hashtag', async (req, res) => {
  try {
    const { hashtag } = req.params;
    if (!hashtag || hashtag.trim() === '') {
      return res.status(400).json({ message: 'Hashtag is required' });
    }

    const normalizedHashtag = hashtag.trim().toLowerCase();
    console.log(`[HashtagEnhanced] Searching for #${normalizedHashtag}`);

    // Method 1: Search posts collection
    const postsFromCollection = await Post.find({
      hashtags: normalizedHashtag,
      isPremium: false,
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    console.log(`[HashtagEnhanced] Posts collection: ${postsFromCollection.length} posts`);

    // Method 2: Search all users' posts
    let postsFromUsers = [];
    try {
      const allUsers = await User.find({})
        .select('username posts')
        .limit(100)
        .lean();

      for (const user of allUsers) {
        if (user.posts && Array.isArray(user.posts)) {
          const userMatchingPosts = user.posts.filter(post => {
            if (post.isPremium) return false;
            
            const postHashtags = post.hashtags || extractHashtags(post.text || '');
            return Array.isArray(postHashtags) && 
                   postHashtags.some(tag => tag.toLowerCase() === normalizedHashtag);
          });

          if (userMatchingPosts.length > 0) {
            // Add user info to posts
            const postsWithUserInfo = userMatchingPosts.map(post => ({
              ...post,
              username: user.username,
              // Ensure all required fields
              likes: post.likes || [],
              comments: post.comments || [],
              views: post.views || 0,
              images: post.images || [],
              videos: post.videos || [],
              hashtags: post.hashtags || extractHashtags(post.text || ''),
            }));
            
            postsFromUsers = [...postsFromUsers, ...postsWithUserInfo];
          }
        }
      }
    } catch (userError) {
      console.warn('[HashtagEnhanced] User search error:', userError.message);
    }

    console.log(`[HashtagEnhanced] Users' posts: ${postsFromUsers.length} posts`);

    // Method 3: Text-based search in all posts
    let textMatches = [];
    if (postsFromCollection.length + postsFromUsers.length < 20) {
      try {
        const allPosts = await Post.find({
          isPremium: false,
          text: { $regex: `#${normalizedHashtag}`, $options: 'i' }
        })
          .sort({ timestamp: -1 })
          .limit(50)
          .lean();

        textMatches = allPosts;
        console.log(`[HashtagEnhanced] Text search: ${textMatches.length} posts`);
      } catch (textError) {
        console.warn('[HashtagEnhanced] Text search error:', textError.message);
      }
    }

    // Combine all results
    const allPosts = [...postsFromCollection, ...postsFromUsers, ...textMatches];
    
    // Remove duplicates
    const uniquePosts = [];
    const seenIds = new Set();
    
    for (const post of allPosts) {
      const postId = post.id || post._id?.toString();
      if (postId && !seenIds.has(postId)) {
        seenIds.add(postId);
        uniquePosts.push(post);
      }
    }

    // Sort by timestamp
    const sortedPosts = uniquePosts.sort((a, b) => 
      new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt)
    );

    console.log(`[HashtagEnhanced] Total unique posts found: ${sortedPosts.length}`);
    
    res.json({
      posts: sortedPosts,
      stats: {
        fromCollection: postsFromCollection.length,
        fromUsers: postsFromUsers.length,
        fromTextSearch: textMatches.length,
        totalUnique: sortedPosts.length
      }
    });
  } catch (error) {
    console.error('[HashtagEnhanced] Error:', error);
    res.status(500).json({ message: 'Server error fetching hashtag posts: ' + error.message });
  }
});

// Update the existing hashtag endpoint in auth.js
router.get('/api/public/hashtag/:hashtag', async (req, res) => {
  try {
    const { hashtag } = req.params;
    if (!hashtag || hashtag.trim() === '') {
      return res.status(400).json({ message: 'Hashtag is required' });
    }

    const normalizedHashtag = hashtag.trim().toLowerCase();
    console.log(`[Public Hashtag] Searching for #${normalizedHashtag}`);

    // Search in posts collection
    const posts = await Post.find({
      $or: [
        { hashtags: normalizedHashtag },
        { text: { $regex: `#${normalizedHashtag}`, $options: 'i' } }
      ],
      isPremium: false,
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    console.log(`[Public Hashtag] Found ${posts.length} posts from collection`);

    // If few results, try to search in users' posts
    if (posts.length < 10) {
      try {
        const allUsers = await User.find({})
          .select('username posts')
          .limit(50)
          .lean();

        let userPostsFound = 0;
        for (const user of allUsers) {
          if (user.posts && Array.isArray(user.posts)) {
            const matchingUserPosts = user.posts.filter(post => {
              if (post.isPremium) return false;
              
              const postText = post.text || '';
              const postHashtags = post.hashtags || extractHashtags(postText);
              
              return Array.isArray(postHashtags) ? 
                postHashtags.some(tag => tag.toLowerCase() === normalizedHashtag) :
                postText.toLowerCase().includes(`#${normalizedHashtag}`);
            });

            if (matchingUserPosts.length > 0) {
              userPostsFound += matchingUserPosts.length;
              // Add these posts to results with user info
              matchingUserPosts.forEach(post => {
                posts.push({
                  ...post,
                  username: user.username,
                  // Ensure consistent structure
                  likes: post.likes || [],
                  comments: post.comments || [],
                  views: post.views || 0,
                  images: post.images || [],
                  videos: post.videos || [],
                  hashtags: post.hashtags || extractHashtags(post.text || ''),
                });
              });
            }
          }
        }
        console.log(`[Public Hashtag] Added ${userPostsFound} posts from users`);
      } catch (userError) {
        console.warn('[Public Hashtag] User search failed:', userError.message);
      }
    }

    // Remove duplicates
    const uniquePosts = [];
    const seenIds = new Set();
    
    for (const post of posts) {
      const postId = post.id || post._id?.toString();
      if (postId && !seenIds.has(postId)) {
        seenIds.add(postId);
        uniquePosts.push(post);
      }
    }


    // Sort by timestamp
    const sortedPosts = uniquePosts.sort((a, b) => 
      new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt)
    );

    console.log(`[Public Hashtag] Returning ${sortedPosts.length} unique posts for hashtag: #${normalizedHashtag}`);
    res.json(sortedPosts);
  } catch (error) {
    console.error('[Public Hashtag] Error:', error);
    res.status(500).json({ message: 'Server error fetching hashtag posts: ' + error.message });
  }

});

// Add to your auth.js in the PUBLIC ROUTES section
router.get('/api/public/search/users', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchRegex = new RegExp(q.trim(), 'i');
    
    // Search across all user fields
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { name: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ],
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // Ensure backward compatibility
    const usersWithDefaults = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      followers: user.followers || [],
      following: user.following || [],
      subscribers: user.subscribers || 0
    }));

    console.log(`[Public Search] Found ${usersWithDefaults.length} users for query: "${q}"`);
    res.json(usersWithDefaults);
    
  } catch (error) {
    console.error('[Public Search Users] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});


// In your auth.js file, add these routes in the appropriate sections:

// =============================================
// ENHANCED SEARCH ROUTES - FOR BOTH LOGGED IN AND UNLOGGED USERS
// =============================================

// Comprehensive search endpoint for logged-in users
router.get('/search/comprehensive', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({ users: [], posts: [] });
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Comprehensive Search] Searching for: "${searchTerm}"`);
    
    // Search users
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { name: searchRegex },
        { email: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // Search posts
    const posts = await Post.find({
      $or: [
        { text: searchRegex },
        { hashtags: searchTerm }
      ],
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    // Format users
    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Comprehensive Search] Found ${formattedUsers.length} users and ${posts.length} posts`);
    
    res.json({
      users: formattedUsers,
      posts: posts
    });
  } catch (error) {
    console.error('[Comprehensive Search] Error:', error);
    res.status(500).json({ message: 'Server error during search: ' + error.message });
  }
});

// Public comprehensive search endpoint for unlogged users
router.get('/public/search/comprehensive', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({ users: [], posts: [] });
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Public Comprehensive Search] Searching for: "${searchTerm}"`);
    
    // Search users
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { name: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // Search posts
    const posts = await Post.find({
      $or: [
        { text: searchRegex },
        { hashtags: searchTerm }
      ],
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    // Format users
    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Public Comprehensive Search] Found ${formattedUsers.length} users and ${posts.length} posts`);
    
    res.json({
      users: formattedUsers,
      posts: posts
    });
  } catch (error) {
    console.error('[Public Comprehensive Search] Error:', error);
    res.status(500).json({ message: 'Server error during search: ' + error.message });
  }
});

// Enhanced location search
router.get('/search/locations', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Location Search] Searching for location: "${searchTerm}"`);
    
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Location Search] Found ${formattedUsers.length} users from location`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('[Location Search] Error:', error);
    res.status(500).json({ message: 'Server error during location search: ' + error.message });
  }
});

// Public location search for unlogged users
router.get('/public/search/locations', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Public Location Search] Searching for location: "${searchTerm}"`);
    
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Public Location Search] Found ${formattedUsers.length} users from location`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('[Public Location Search] Error:', error);
    res.status(500).json({ message: 'Server error during location search: ' + error.message });
  }
});

// Enhanced search users endpoint
router.get('/search/users', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Search Users] Searching for: "${searchTerm}"`);
    
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { name: searchRegex },
        { email: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Search Users] Found ${formattedUsers.length} users`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('[Search Users] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});

// Public search users endpoint
router.get('/public/search/users', async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Public Search Users] Searching for: "${searchTerm}"`);
    
    const searchRegex = new RegExp(searchTerm, 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { name: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Public Search Users] Found ${formattedUsers.length} users`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('[Public Search Users] Error:', error);
    res.status(500).json({ message: 'Server error searching users: ' + error.message });
  }
});

// Bulk user types endpoint
router.post('/users/bulk-user-types', authenticateToken, async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log('[BulkUserTypes] Fetching user types for:', usernames.length, 'users');

    // Fetch users with only username and userType fields
    const users = await User.find(
      { username: { $in: usernames } },
      { username: 1, userType: 1, _id: 0 }
    ).lean();

    // Create a map of username to userType
    const userTypeMap = {};
    users.forEach(user => {
      userTypeMap[user.username] = user.userType || 'content_creator';
    });

    // Fill in missing usernames with default
    usernames.forEach(username => {
      if (!userTypeMap[username]) {
        userTypeMap[username] = 'content_creator';
      }
    });

    console.log('[BulkUserTypes] Returning user types for:', Object.keys(userTypeMap).length, 'users');
    
    res.json({ userTypeMap });
  } catch (error) {
    console.error('[BulkUserTypes] Error:', error);
    res.status(500).json({ message: 'Server error fetching user types: ' + error.message });
  }
});


// backend/routes/posts.js
router.get('/location/:location', async (req, res) => {
  try {
    const location = req.params.location.toLowerCase();
    
    // Query your database for posts from this location
    // This is a sample query - adjust based on your database structure
    const posts = await Post.find({
      $or: [
        { location: { $regex: location, $options: 'i' } },
        { city: { $regex: location, $options: 'i' } },
        { country: { $regex: location, $options: 'i' } },
        { state: { $regex: location, $options: 'i' } }
      ]
    })
    .populate('user', 'username profilePicture firstName lastName')
    .sort({ timestamp: -1 })
    .limit(50);
    
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts by location:', error);
    res.status(500).json({ error: 'Failed to fetch posts by location' });
  }
});

// =============================================
// ENHANCED LOCATION SEARCH ROUTES
// =============================================

// Get users by location
router.get('/users/location/:location', async (req, res) => {
  try {
    const location = req.params.location.toLowerCase();
    const { limit = 100 } = req.query;
    
    console.log(`[Location Users] Searching for users in location: "${location}"`);
    
    const searchRegex = new RegExp(location, 'i');
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Location Users] Found ${formattedUsers.length} users from location: "${location}"`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('[Location Users] Error:', error);
    res.status(500).json({ message: 'Server error fetching users by location: ' + error.message });
  }
});

// Get posts by location
router.get('/posts/location/:location', async (req, res) => {
  try {
    const location = req.params.location.toLowerCase();
    const { limit = 100 } = req.query;
    
    console.log(`[Location Posts] Searching for posts from location: "${location}"`);

    // First get users from this location
    const searchRegex = new RegExp(location, 'i');
    const usersFromLocation = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username')
    .lean();

    const usernamesFromLocation = usersFromLocation.map(user => user.username);
    
    console.log(`[Location Posts] Found ${usernamesFromLocation.length} users from location: "${location}"`);

    // Now get posts from these users
    let posts = [];
    
    if (usernamesFromLocation.length > 0) {
      posts = await Post.find({
        username: { $in: usernamesFromLocation },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    }

    console.log(`[Location Posts] Found ${posts.length} posts from location: "${location}"`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Location Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts by location: ' + error.message });
  }
});

// Search location (combined users and posts)
router.get('/search/location/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 50 } = req.query;
    
    console.log(`[Location Search] Searching location: "${query}"`);
    
    const searchRegex = new RegExp(query, 'i');
    
    // Get users from location
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // Get posts from these users
    const usernames = users.map(user => user.username);
    let posts = [];
    
    if (usernames.length > 0) {
      posts = await Post.find({
        username: { $in: usernames },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    }

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Location Search] Found ${formattedUsers.length} users and ${posts.length} posts for location: "${query}"`);
    
    res.json({
      users: formattedUsers,
      posts: posts
    });
  } catch (error) {
    console.error('[Location Search] Error:', error);
    res.status(500).json({ message: 'Server error searching location: ' + error.message });
  }
});

// Location-based search with detailed results
router.get('/location/:query/posts', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 100 } = req.query;
    
    console.log(`[Location Posts Detailed] Searching posts from location: "${query}"`);
    
    // First, find users from this location
    const searchRegex = new RegExp(query, 'i');
    const usersFromLocation = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture')
    .lean();

    const usernamesFromLocation = usersFromLocation.map(user => user.username);
    console.log(`[Location Posts Detailed] Found ${usernamesFromLocation.length} users from location: "${query}"`);

    // Get posts from these users
    let posts = [];
    if (usernamesFromLocation.length > 0) {
      posts = await Post.find({
        username: { $in: usernamesFromLocation },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

      // Add user profile picture to each post
      const userMap = {};
      usersFromLocation.forEach(user => {
        userMap[user.username] = user.profilePicture;
      });

      posts = posts.map(post => ({
        ...post,
        userProfilePicture: userMap[post.username]
      }));
    }

    console.log(`[Location Posts Detailed] Found ${posts.length} posts from location: "${query}"`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Location Posts Detailed] Error:', error);
    res.status(500).json({ message: 'Server error fetching location posts: ' + error.message });
  }
});

// Batch fetch posts for multiple users
router.post('/posts/batch', async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log(`[Posts Batch] Fetching posts for ${usernames.length} users`);

    const posts = await Post.find({
      username: { $in: usernames },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

    console.log(`[Posts Batch] Found ${posts.length} posts`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Posts Batch] Error:', error);
    res.status(500).json({ message: 'Server error fetching batch posts: ' + error.message });
  }
});

// Public location search for unlogged users
router.get('/public/location/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 50 } = req.query;
    
    console.log(`[Public Location] Searching location: "${query}"`);
    
    const searchRegex = new RegExp(query, 'i');
    
    // Get users from location
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // Get posts from these users
    const usernames = users.map(user => user.username);
    let posts = [];
    
    if (usernames.length > 0) {
      posts = await Post.find({
        username: { $in: usernames },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    }

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Public Location] Found ${formattedUsers.length} users and ${posts.length} posts for location: "${query}"`);
    
    res.json({
      users: formattedUsers,
      posts: posts,
      query: query
    });
  } catch (error) {
    console.error('[Public Location] Error:', error);
    res.status(500).json({ message: 'Server error searching location: ' + error.message });
  }
});
// =============================================
// POSTS BY USERNAMES ENDPOINT - CRITICAL FOR LOCATION POSTS
// =============================================

// Fetch posts by multiple usernames
router.post('/posts/by-usernames', authenticateToken, async (req, res) => {
  try {
    const { usernames, limit = 100 } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log(`[Posts By Usernames] Fetching posts for ${usernames.length} usernames`);

    // If usernames is empty, return empty array
    if (usernames.length === 0) {
      return res.json([]);
    }

    // Method 1: Fetch posts from posts collection
    const postsFromCollection = await Post.find({
      username: { $in: usernames },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    console.log(`[Posts By Usernames] Found ${postsFromCollection.length} posts from collection`);

    // Method 2: Also fetch posts from users' personal posts arrays
    let postsFromUsers = [];
    
    try {
      // Get users with their posts
      const users = await User.find({
        username: { $in: usernames }
      })
      .select('username posts')
      .lean();

      // Extract posts from users
      for (const user of users) {
        if (user.posts && Array.isArray(user.posts)) {
          // Filter out premium posts and add user info
          const userNonPremiumPosts = user.posts
            .filter(post => !post.isPremium)
            .map(post => ({
              ...post,
              username: user.username,
              // Ensure all required fields
              likes: post.likes || [],
              comments: post.comments || [],
              views: post.views || 0,
              images: post.images || [],
              videos: post.videos || [],
              hashtags: post.hashtags || extractHashtags(post.text || ''),
              userMentions: post.userMentions || extractUserMentions(post.text || ''),
              isAdminPost: post.isAdminPost || false,
              hasGoldenBadge: post.hasGoldenBadge || false
            }));
          
          postsFromUsers = [...postsFromUsers, ...userNonPremiumPosts];
        }
      }
      
      console.log(`[Posts By Usernames] Found ${postsFromUsers.length} posts from users' arrays`);
    } catch (userError) {
      console.warn('[Posts By Usernames] Error fetching from users:', userError.message);
    }

    // Combine results from both methods
    const allPosts = [...postsFromCollection, ...postsFromUsers];
    
    // Remove duplicates based on post ID
    const uniquePosts = [];
    const seenPostIds = new Set();
    
    for (const post of allPosts) {
      const postId = post.id || post._id?.toString();
      if (postId && !seenPostIds.has(postId)) {
        seenPostIds.add(postId);
        uniquePosts.push(post);
      }
    }

    // Sort by timestamp (newest first)
    const sortedPosts = uniquePosts.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.createdAt || 0);
      const dateB = new Date(b.timestamp || b.createdAt || 0);
      return dateB - dateA;
    });

    // Limit to requested limit
    const finalPosts = sortedPosts.slice(0, parseInt(limit));

    console.log(`[Posts By Usernames] Returning ${finalPosts.length} unique posts for ${usernames.length} users`);
    
    res.json(finalPosts);
    
  } catch (error) {
    console.error('[Posts By Usernames] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts by usernames: ' + error.message });
  }
});

// Also add a public version for non-logged-in users
router.post('/public/posts/by-usernames', async (req, res) => {
  try {
    const { usernames, limit = 50 } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log(`[Public Posts By Usernames] Fetching posts for ${usernames.length} usernames`);

    // If usernames is empty, return empty array
    if (usernames.length === 0) {
      return res.json([]);
    }

    // For public access, only fetch non-premium posts
    const posts = await Post.find({
      username: { $in: usernames },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    console.log(`[Public Posts By Usernames] Found ${posts.length} posts`);
    
    res.json(posts);
    
  } catch (error) {
    console.error('[Public Posts By Usernames] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts by usernames: ' + error.message });
  }
});


// Add to auth.js - Enhanced location posts endpoint

// Enhanced: Get posts by location
router.get('/api/posts/location/:location', async (req, res) => {
  try {
    const location = req.params.location.toLowerCase();
    const { limit = 200 } = req.query;
    
    console.log(`[Location Posts API] Searching for posts from location: "${location}"`);

    // First, find users from this location
    const searchRegex = new RegExp(location, 'i');
    const usersFromLocation = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username')
    .lean();

    const usernamesFromLocation = usersFromLocation.map(user => user.username);
    
    console.log(`[Location Posts API] Found ${usernamesFromLocation.length} users from location: "${location}"`);

    // If no users found, return empty array
    if (usernamesFromLocation.length === 0) {
      return res.json([]);
    }

    // Now get ALL posts from these users (not just one per user)
    const posts = await Post.find({
      username: { $in: usernamesFromLocation },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    console.log(`[Location Posts API] Found ${posts.length} posts from location: "${location}"`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Location Posts API] Error:', error);
    res.status(500).json({ message: 'Server error fetching posts by location: ' + error.message });
  }
});

// Enhanced: Get comprehensive location search results
router.get('/api/search/location/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 100 } = req.query;
    
    console.log(`[Comprehensive Location Search] Searching: "${query}"`);
    
    const searchRegex = new RegExp(query, 'i');
    
    // 1. Get users from this location
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    // 2. Get ALL posts from these users (not just one per user)
    const usernames = users.map(user => user.username);
    let posts = [];
    
    if (usernames.length > 0) {
      posts = await Post.find({
        username: { $in: usernames },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) * 2) // Get more posts for location searches
      .lean();
    }

    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Comprehensive Location Search] Found ${formattedUsers.length} users and ${posts.length} posts for location: "${query}"`);
    
    res.json({
      users: formattedUsers,
      posts: posts,
      query: query
    });
  } catch (error) {
    console.error('[Comprehensive Location Search] Error:', error);
    res.status(500).json({ message: 'Server error searching location: ' + error.message });
  }
});

// Enhanced: Get ALL posts for location (for when user switches to posts view)
router.get('/api/location/:query/posts-all', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 300 } = req.query; // Increase limit to get ALL posts
    
    console.log(`[Location All Posts] Getting ALL posts from location: "${query}"`);
    
    // 1. Find all users from this location
    const searchRegex = new RegExp(query, 'i');
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username')
    .lean();

    const usernames = users.map(user => user.username);
    
    if (usernames.length === 0) {
      return res.json([]);
    }

    // 2. Get ALL posts from ALL users in this location
    const posts = await Post.find({
      username: { $in: usernames },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    console.log(`[Location All Posts] Found ${posts.length} posts from ${usernames.length} users in location: "${query}"`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Location All Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching all location posts: ' + error.message });
  }
});

// In auth.js - Add this enhanced comprehensive search route
// In auth.js - Update the comprehensive search route
router.get('/api/auth/search/comprehensive', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 500 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({ users: [], posts: [] });
    }

    const searchTerm = q.trim().toLowerCase();
    console.log(`[Enhanced Comprehensive Search] Searching for: "${searchTerm}"`);
    
    const searchRegex = new RegExp(searchTerm, 'i');
    
    // 1. Search users by ALL fields
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { name: searchRegex },
        { email: searchRegex },
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex },
        { bio: searchRegex }
      ]
    })
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
    .limit(parseInt(limit))
    .lean();

    console.log(`[Enhanced Comprehensive Search] Found ${users.length} users`);
    
    // 2. For location searches, get ALL posts from ALL users in that location
    let posts = [];
    const usernames = users.map(user => user.username);
    
    if (usernames.length > 0) {
      console.log(`[Enhanced Comprehensive Search] Getting ALL posts from ${usernames.length} users`);
      
      // CRITICAL: Get ALL posts from these users, not just a few
      posts = await Post.find({
        username: { $in: usernames },
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) * 2) // Get LOTS of posts for location searches
      .lean();
      
      console.log(`[Enhanced Comprehensive Search] Found ${posts.length} posts from users`);
    }
    
    // 3. Also search posts by location in post fields (if posts collection has location fields)
    try {
      const locationPosts = await Post.find({
        $or: [
          { location: searchRegex },
          { city: searchRegex },
          { country: searchRegex },
          { state: searchRegex }
        ],
        isPremium: false
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
      
      // Combine with existing posts, remove duplicates
      const postIds = new Set(posts.map(p => p._id?.toString()));
      locationPosts.forEach(post => {
        const postId = post._id?.toString();
        if (postId && !postIds.has(postId)) {
          posts.push(post);
          postIds.add(postId);
        }
      });
      
      console.log(`[Enhanced Comprehensive Search] Added ${locationPosts.length} posts from location fields`);
    } catch (locationError) {
      console.warn('[Enhanced Comprehensive Search] Location post search failed:', locationError.message);
    }

    // Format users
    const formattedUsers = users.map(user => ({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    }));

    console.log(`[Enhanced Comprehensive Search] Returning ${formattedUsers.length} users and ${posts.length} posts`);
    
    res.json({
      users: formattedUsers,
      posts: posts
    });
  } catch (error) {
    console.error('[Enhanced Comprehensive Search] Error:', error);
    res.status(500).json({ message: 'Server error during comprehensive search: ' + error.message });
  }
});
// Add this new route (add it after the /all/posts route)
router.get('/posts/unlimited', async (req, res) => {
  try {
    console.log('[Unlimited Posts] Fetching ALL posts without limits...');
    
    // Get ALL public posts (no limit)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    // Get ALL admin posts (no limit)
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean();
    }

    // Insert admin posts every 6th post
    let allPosts = publicPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
    }

    console.log(`[Unlimited Posts] Returning ${allPosts.length} posts (${publicPosts.length} public + ${adminPosts.length} admin)`);
    
    res.json({
      posts: allPosts,
      totalPosts: allPosts.length,
      publicPosts: publicPosts.length,
      adminPosts: adminPosts.length,
      message: `Fetched ${allPosts.length} posts without limits`
    });
  } catch (error) {
    console.error('[Unlimited Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching unlimited posts: ' + error.message });
  }
});
// Add this for unauthenticated users
router.get('/public/posts/unlimited', async (req, res) => {
  try {
    console.log('[Public Unlimited Posts] Fetching ALL public posts without limits...');
    
    // Get ALL public posts (no limit, no premium)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    // Get ALL admin posts (no limit)
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean();
    }

    // Insert admin posts every 6th post
    let allPosts = publicPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
    }

    console.log(`[Public Unlimited Posts] Returning ${allPosts.length} posts`);
    
    res.json({
      posts: allPosts,
      totalPosts: allPosts.length,
      message: `Fetched ${allPosts.length} public posts without limits`
    });
  } catch (error) {
    console.error('[Public Unlimited Posts] Error:', error);
    res.status(500).json({ message: 'Server error fetching unlimited posts: ' + error.message });
  }
});

// Add to auth.js in the PUBLIC ROUTES section
router.get('/public/user-types/bulk', async (req, res) => {
  try {
    const { usernames } = req.query;
    
    if (!usernames) {
      return res.status(400).json({ message: 'Usernames parameter is required' });
    }

    const usernameArray = usernames.split(',');
    
    if (usernameArray.length > 100) {
      return res.status(400).json({ message: 'Maximum 100 usernames allowed' });
    }

    console.log('[Public Bulk UserTypes] Fetching for:', usernameArray.length, 'users');

    const users = await User.find(
      { username: { $in: usernameArray } },
      { username: 1, userType: 1, _id: 0 }
    ).lean();

    const userTypeMap = {};
    users.forEach(user => {
      userTypeMap[user.username] = user.userType || 'content_creator';
    });


    // Fill in missing usernames with default
    usernameArray.forEach(username => {
      if (!userTypeMap[username]) {
        userTypeMap[username] = 'content_creator';
      }
    });


    res.json({ userTypeMap });
  } catch (error) {
    console.error('[Public Bulk UserTypes] Error:', error);
    res.status(500).json({ message: 'Server error fetching user types: ' + error.message });
  }
});

// In auth.js - Add these routes

// Get ALL posts without limits
// Get ALL posts without limits - WITH BOOST DATA
router.get('/posts/unlimited', authenticateToken, async (req, res) => {
  try {
    console.log('[Posts Unlimited] Fetching ALL posts with boost data...');
    
    // Get ALL public posts (no limit)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    // Get ALL admin posts (no limit)
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean();
    }

    // ========== CRITICAL: FETCH ACTIVE BOOSTS ==========
    const currentUserId = req.user._id;
    const currentUsername = req.user.username;
    
    // Get ALL active boosts (not expired)
    const activeBoosts = await Boost.find({
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).lean();
    
    console.log('[Posts Unlimited] Found active boosts:', activeBoosts.length);
    
    // Create a map of postId -> boost info (using string conversion for consistent comparison)
    const boostMap = new Map();
    activeBoosts.forEach(boost => {
      const postIdStr = boost.postId?.toString();
      if (postIdStr) {
        // If multiple boosts for same post, keep the one with highest priority
        const existing = boostMap.get(postIdStr);
        if (!existing || boost.priority > existing.priority) {
          boostMap.set(postIdStr, {
            isBoosted: true,
            boostInfo: {
              id: boost.id,
              durationDays: boost.durationDays,
              targetAudience: boost.targetAudience,
              expiresAt: boost.expiresAt,
              priority: boost.priority
            },
            boostPriority: boost.priority || 0
          });
        }
      }
    });
    
    console.log('[Posts Unlimited] Posts with boosts:', boostMap.size);
    
    // Function to add boost info to a post
    const addBoostInfoToPost = (post) => {
      const postIdStr = (post.id || post._id)?.toString();
      const boostData = boostMap.get(postIdStr);
      
      if (boostData) {
        console.log(`[Posts Unlimited] Adding boost to post ${postIdStr}:`, boostData);
        return {
          ...post,
          isBoosted: true,
          boostInfo: boostData.boostInfo,
          boostPriority: boostData.boostPriority,
          boostExpiresAt: boostData.boostInfo.expiresAt
        };
      }
      return {
        ...post,
        isBoosted: false,
        boostInfo: null,
        boostPriority: 0,
        boostExpiresAt: null
      };
    };
    
    // Add boost info to all posts
    const boostedPublicPosts = publicPosts.map(addBoostInfoToPost);
    const boostedAdminPosts = adminPosts.map(addBoostInfoToPost);
    
    // Insert admin posts every 6th post
    let allPosts = boostedPublicPosts;
    if (boostedAdminPosts.length > 0) {
      allPosts = insertAdminPosts(boostedPublicPosts, boostedAdminPosts);
    } else {
      allPosts = boostedPublicPosts;
    }
    
    // Sort: Boosted posts first, then by priority, then by timestamp
    allPosts.sort((a, b) => {
      // Boosted first
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      
      // If both boosted, sort by priority (higher first)
      if (a.isBoosted && b.isBoosted) {
        const aPriority = a.boostPriority || 0;
        const bPriority = b.boostPriority || 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
      }
      
      // Otherwise sort by timestamp (newest first)
      return new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0);
    });
    
    const boostedCount = allPosts.filter(p => p.isBoosted === true).length;
    console.log(`[Posts Unlimited] Returning ${allPosts.length} posts (${boostedCount} boosted)`);
    
    res.json({ 
      posts: allPosts,
      boostedCount: boostedCount,
      message: `Fetched ${allPosts.length} posts with ${boostedCount} boosted posts prioritized`
    });
    
  } catch (error) {
    console.error('[Posts Unlimited] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Public version
// Public version for unauthenticated users
router.get('/public/posts/unlimited', async (req, res) => {
  try {
    console.log('[Public Posts Unlimited] Fetching ALL public posts with boost data...');
    
    // Get ALL public posts (no limit, no premium)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

    // Get ALL admin posts (no limit)
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let adminPosts = [];
    if (adminUsernames.length > 0) {
      adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean();
    }
    
    // ========== FETCH ACTIVE BOOSTS (Public) ==========
    const activeBoosts = await Boost.find({
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).lean();
    
    console.log('[Public Posts Unlimited] Found active boosts:', activeBoosts.length);
    
    // Create boost map
    const boostMap = new Map();
    activeBoosts.forEach(boost => {
      const postIdStr = boost.postId?.toString();
      if (postIdStr) {
        const existing = boostMap.get(postIdStr);
        if (!existing || boost.priority > existing.priority) {
          boostMap.set(postIdStr, {
            isBoosted: true,
            boostInfo: {
              id: boost.id,
              durationDays: boost.durationDays,
              targetAudience: boost.targetAudience,
              expiresAt: boost.expiresAt,
              priority: boost.priority
            },
            boostPriority: boost.priority || 0
          });
        }
      }
    });
    
    // Add boost info to posts
    const boostedPublicPosts = publicPosts.map(post => {
      const postIdStr = (post.id || post._id)?.toString();
      const boostData = boostMap.get(postIdStr);
      if (boostData) {
        return {
          ...post,
          isBoosted: true,
          boostInfo: boostData.boostInfo,
          boostPriority: boostData.boostPriority,
          boostExpiresAt: boostData.boostInfo.expiresAt
        };
      }
      return {
        ...post,
        isBoosted: false,
        boostInfo: null,
        boostPriority: 0,
        boostExpiresAt: null
      };
    });
    
    const boostedAdminPosts = adminPosts.map(post => {
      const postIdStr = (post.id || post._id)?.toString();
      const boostData = boostMap.get(postIdStr);
      if (boostData) {
        return {
          ...post,
          isBoosted: true,
          boostInfo: boostData.boostInfo,
          boostPriority: boostData.boostPriority,
          boostExpiresAt: boostData.boostInfo.expiresAt,
          isAdminPost: true,
          hasGoldenBadge: true
        };
      }
      return {
        ...post,
        isBoosted: false,
        boostInfo: null,
        boostPriority: 0,
        boostExpiresAt: null,
        isAdminPost: true,
        hasGoldenBadge: true
      };
    });

    // Insert admin posts every 6th post
    let allPosts = boostedPublicPosts;
    if (boostedAdminPosts.length > 0) {
      allPosts = insertAdminPosts(boostedPublicPosts, boostedAdminPosts);
    } else {
      allPosts = boostedPublicPosts;
    }
    
    // Sort: Boosted posts first
    allPosts.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      if (a.isBoosted && b.isBoosted) {
        return (b.boostPriority || 0) - (a.boostPriority || 0);
      }
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });
    
    const boostedCount = allPosts.filter(p => p.isBoosted === true).length;
    console.log(`[Public Posts Unlimited] Returning ${allPosts.length} posts (${boostedCount} boosted)`);
    
    res.json({ 
      posts: allPosts,
      boostedCount: boostedCount
    });
    
  } catch (error) {
    console.error('[Public Posts Unlimited] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get ALL posts from location users
router.get('/location/:query/posts-all', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const { limit = 500 } = req.query;
    
    console.log(`[Location All Posts] Getting ALL posts from location: "${query}"`);
    
    const searchRegex = new RegExp(query, 'i');
    
    // Find all users from this location
    const users = await User.find({
      $or: [
        { location: searchRegex },
        { city: searchRegex },
        { country: searchRegex },
        { state: searchRegex }
      ]
    })
    .select('username')
    .lean();

    const usernames = users.map(user => user.username);
    
    console.log(`[Location All Posts] Found ${usernames.length} users from location`);
    
    if (usernames.length === 0) {
      return res.json([]);
    }

    // Get ALL posts from ALL users in this location
    const posts = await Post.find({
      username: { $in: usernames },
      isPremium: false
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .lean();

    console.log(`[Location All Posts] Found ${posts.length} posts from location`);
    
    res.json(posts);
  } catch (error) {
    console.error('[Location All Posts] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});
// Add this route to auth.js to debug available endpoints
router.get('/debug/endpoints', (req, res) => {
  try {
    // Get all registered routes
    const routes = [];
    router.stack.forEach(middleware => {
      if (middleware.route) {
        // Routes registered directly on the router
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        // Router middleware
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    
    // Filter for user posts endpoints
    const userPostsEndpoints = routes.filter(route => 
      route.path.includes('/users/') && route.path.includes('/posts')
    );
    
    const publicPostsEndpoints = routes.filter(route => 
      route.path.includes('/public/posts')
    );
    
    const locationEndpoints = routes.filter(route => 
      route.path.includes('/location/')
    );
    
    res.json({
      totalRoutes: routes.length,
      userPostsEndpoints,
      publicPostsEndpoints,
      locationEndpoints,
      allRoutes: routes
    });
  } catch (error) {
    res.status(500).json({ message: 'Error: ' + error.message });
  }
});
// Backend route (in your Node.js/Express backend)
router.get('/api/auth/public/posts/location', async (req, res) => {
  try {
    const { country, limit = 100, skip = 0, mix = 60 } = req.query;
    
    if (!country) {
      return res.status(400).json({ error: 'Country parameter is required' });
    }
    
    const limitNum = parseInt(limit);
    const skipNum = parseInt(skip);
    const mixRatio = parseInt(mix);
    
    // Calculate counts based on mix ratio
    const localLimit = Math.floor(limitNum * (mixRatio / 100));
    const globalLimit = limitNum - localLimit;
    
    console.log(`Backend 60/40 mix: ${localLimit} local, ${globalLimit} global for ${country}`);
    
    // Fetch local posts
    const localPosts = await Post.find({ 
      $or: [
        { 'user.country': { $regex: new RegExp(country, 'i') } },
        { 'user.location': { $regex: new RegExp(country, 'i') } },
        { userCountry: { $regex: new RegExp(country, 'i') } }
      ],
      isDeleted: false 
    })
      .sort({ timestamp: -1 })
      .skip(skipNum)
      .limit(localLimit)
      .populate('user', 'username country location')
      .lean();
    
    // Fetch global posts (excluding the selected country)
    const globalPosts = await Post.find({ 
      $and: [
        {
          $or: [
            { 'user.country': { $not: new RegExp(country, 'i') } },
            { 'user.country': { $exists: false } },
            { 'user.country': null }
          ]
        },
        {
          $or: [
            { 'user.location': { $not: new RegExp(country, 'i') } },
            { 'user.location': { $exists: false } },
            { 'user.location': null }
          ]
        },
        {
          $or: [
            { userCountry: { $not: new RegExp(country, 'i') } },
            { userCountry: { $exists: false } },
            { userCountry: null }
          ]
        }
      ],
      isDeleted: false 
    })
      .sort({ timestamp: -1 })
      .skip(skipNum)
      .limit(globalLimit)
      .populate('user', 'username country location')
      .lean();
    
    // Add userCountry field for frontend
    const enhancedLocal = localPosts.map(post => ({
      ...post,
      userCountry: post.user?.country || post.user?.location || post.userCountry || country
    }));
    
    const enhancedGlobal = globalPosts.map(post => ({
      ...post,
      userCountry: post.user?.country || post.user?.location || post.userCountry || 'Unknown'
    }));
    
    // Combine and shuffle
    const combinedPosts = [...enhancedLocal, ...enhancedGlobal];
    const shuffledPosts = combinedPosts.sort(() => Math.random() - 0.5);
    
    console.log(`Backend returned ${shuffledPosts.length} posts (${enhancedLocal.length} local, ${enhancedGlobal.length} global)`);
    
    res.json(shuffledPosts);
    
  } catch (error) {
    console.error('Error fetching location-based posts:', error);
    res.status(500).json({ error: 'Failed to fetch location-based posts' });
  }
});

// In auth.js - Add these public view counting endpoints

// Public view count for regular posts
// auth.js - Ensure these routes exist


router.put('/users/:username/phone-visibility', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const { phoneNumberVisibleToAll } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if requester is the user
    if (user.email !== req.user.email) {
      return res.status(403).json({ message: 'Unauthorized to update this setting' });
    }
    
    // Update the visibility setting
    user.phoneNumberVisibleToAll = Boolean(phoneNumberVisibleToAll);
    await user.save();
    
    res.json({
      message: 'Phone number visibility updated successfully',
      phoneNumberVisibleToAll: user.phoneNumberVisibleToAll
    });
    
  } catch (error) {
    console.error('[Phone Visibility Update] Error:', error);
    res.status(500).json({ message: 'Server error updating phone visibility: ' + error.message });
  }
});
// Get user by username with bio and location
// Get user by username with bio and location
router.get('/users/:username', authenticateToken, async (req, res) => {
  console.log(`[Get User] Fetching user: ${req.params.username}`);
  try {
    const { fields } = req.query;
    let projection = '-password';

    if (fields) {
      const fieldArray = fields.split(',').map(f => f.trim());
      projection = fieldArray.reduce((proj, field) => ({ ...proj, [field]: 1 }), { _id: 0 });
      projection.password = 0;
    }

    const user = await User.findOne({ username: req.params.username }).select(projection).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure backward compatibility for old users without userType
    if (!user.userType) {
      user.userType = 'content_creator';
    }

    const userDetails = { 
      ...user, 
      socialLinks: user.website || { twitter: '', instagram: '', youtube: '' },
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      phoneNumberVisibleToAll: user.phoneNumberVisibleToAll || false // Include the setting
    };
  
    // Show phone number if user allows it OR if requester is the user
    if (user.email !== req.user.email) {
      delete userDetails.bankName;
      delete userDetails.accountNumber;
      delete userDetails.balance;
      delete userDetails.payoutRequests;
      
      // Only hide phone number if user hasn't made it public
      if (!user.phoneNumberVisibleToAll) {
        delete userDetails.phoneNumber;
      }
    }

    res.json(userDetails);
  } catch (error) {
    console.error('[Get User] Error:', error);
    res.status(500).json({ message: 'Server error fetching user: ' + error.message });
  }
});


router.get('/users/:username', authenticateToken, async (req, res) => {
  console.log(`[Get User] Fetching user: ${req.params.username}`);
  try {
    const { fields } = req.query;
    let projection = '-password';

    if (fields) {
      const fieldArray = fields.split(',').map(f => f.trim());
      projection = fieldArray.reduce((proj, field) => ({ ...proj, [field]: 1 }), { _id: 0 });
      projection.password = 0;
    }

    const user = await User.findOne({ username: req.params.username }).select(projection).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure backward compatibility for old users without userType
    if (!user.userType) {
      user.userType = 'content_creator';
    }

    const userDetails = { 
      ...user, 
      socialLinks: user.website || { twitter: '', instagram: '', youtube: '' },
      // Ensure location fields exist
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      numbersVisibility: user.numbersVisibility || 'subscribers_only' // Ensure it's included
    };
    delete userDetails.website;

    // Check if requester is viewing their own profile
    const isProfileOwner = user.email === req.user.email;
    
    if (!isProfileOwner) {
      // For non-owners, check if we need to hide phone number based on visibility setting
      const shouldHidePhoneNumber = await shouldHidePhoneForUser(
        user.username,
        req.user.username,
        user.numbersVisibility || 'subscribers_only'
      );
      
      if (shouldHidePhoneNumber) {
        delete userDetails.phoneNumber;
      }
      
      // Always hide sensitive financial info
      delete userDetails.bankName;
      delete userDetails.accountNumber;
      delete userDetails.balance;
      delete userDetails.payoutRequests;
    }

    res.json(userDetails);
  } catch (error) {
    console.error('[Get User] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Helper function to check if phone number should be hidden
// Helper function to check if phone number should be hidden
// Update the helper function in your backend (auth.js)
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

// Update phone number visibility setting
router.put('/users/:username/phone-visibility', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const { numbersVisibility } = req.body;
    
    if (!numbersVisibility || !['everyone', 'subscribers_only', 'followers_only', 'hidden'].includes(numbersVisibility)) {
      return res.status(400).json({ 
        message: 'Valid visibility setting required (everyone, subscribers_only, followers_only, hidden)' 
      });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if requester is the user
    if (user.email !== req.user.email) {
      return res.status(403).json({ message: 'Unauthorized to update this setting' });
    }
    
    // Update the visibility setting
    user.numbersVisibility = numbersVisibility;
    await user.save();
    
    res.json({
      message: 'Phone number visibility updated successfully',
      numbersVisibility: user.numbersVisibility
    });
    
  } catch (error) {
    console.error('[Phone Visibility Update] Error:', error);
    res.status(500).json({ message: 'Server error updating phone visibility: ' + error.message });
  }
});

// Get phone number with proper visibility checks
router.get('/users/:username/phone', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username }).select('username phoneNumber numbersVisibility').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isProfileOwner = req.user.username === username;
    
    // Check visibility
    const shouldHidePhone = await shouldHidePhoneForUser(
      username,
      req.user.username,
      user.numbersVisibility || 'subscribers_only'
    );
    
    if (shouldHidePhone && !isProfileOwner) {
      return res.status(403).json({ 
        message: 'Phone number not available based on user privacy settings',
        numbersVisibility: user.numbersVisibility || 'subscribers_only'
      });
    }
    
    res.json({
      username: user.username,
      phoneNumber: user.phoneNumber || '',
      numbersVisibility: user.numbersVisibility || 'subscribers_only'
    });
    
  } catch (error) {
    console.error('[Get Phone] Error:', error);
    res.status(500).json({ message: 'Server error fetching phone number: ' + error.message });
  }
});

// Add a debug endpoint to check user data
router.get('/debug/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    console.log(`[Debug] Checking user data for: ${username}`);
    
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      username: user.username,
      phoneNumber: user.phoneNumber,
      phoneNumberType: typeof user.phoneNumber,
      numbersVisibility: user.numbersVisibility,
      rawUser: user // Return full user object for debugging
    });
  } catch (error) {
    console.error('[Debug User] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});
// Example: /api/users/:username/public
router.get('/users/:username/public', async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .select('username displayName bio profilePicture followersCount followingCount postsCount createdAt isVerified');
  res.json(user);
});





// Add these public endpoints to your backend:

// 1. Public posts endpoint (already exists via fetchPublicPosts)
router.get('/api/posts/public', async (req, res) => {
  try {
    const posts = await Post.find({ isPremium: false })
      .select('id text images videos timestamp username')
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Public hashtag search
router.get('/api/hashtags/public/:hashtag', async (req, res) => {
  try {
    const hashtag = req.params.hashtag.toLowerCase();
    const posts = await Post.find({
      $and: [
        { isPremium: false },
        { $or: [
          { text: { $regex: `#${hashtag}`, $options: 'i' } },
          { hashtags: { $in: [hashtag] } }
        ]}
      ]
    })
    .select('id text images videos timestamp username')
    .sort({ timestamp: -1 })
    .limit(30);
    
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});







//profile
// In your backend (Node.js/Express)
router.get('/api/users/:username/public', async (req, res) => {
  try {
    const user = await User.findOne({ 
      username: req.params.username,
      isActive: true 
    }).select('username displayName bio profilePicture followersCount followingCount postsCount subscribers createdAt isVerified userType location city country state phoneNumber numbersVisibility');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Public user fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/posts/public', async (req, res) => {
  try {
    const { username, limit = 20, skip = 0 } = req.query;
    
    let query = { isPremium: false }; // Only non-premium for public
    if (username) {
      query.username = username;
    }
    
    const posts = await Post.find(query)
      .select('id text images videos timestamp likes comments views username isPremium')
      .sort({ timestamp: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));
    
    res.json(posts);
  } catch (error) {
    console.error('Public posts fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});



// auth.js - Add these fixed view count endpoints

// Fixed: Increment post views with database persistence
router.post('/posts/:postId/views', async (req, res) => {
  try {
    const { postId } = req.params;
    console.log(`[View Count] Incrementing views for post: ${postId}`);
    
    // Find the post in posts collection
    let post = await Post.findOne({ id: Number(postId) });
    
    if (!post) {
      // Try to find by other IDs
      post = await Post.findOne({ 
        $or: [
          { id: postId },
          { _id: postId }
        ]
      });
    }
    
    if (!post) {
      console.log(`[View Count] Post ${postId} not found in posts collection`);
      
      // Try to find in users' posts
      const allUsers = await User.find({}).select('username posts').lean();
      let foundPost = null;
      let foundUser = null;
      
      for (const user of allUsers) {
        if (user.posts && Array.isArray(user.posts)) {
          const userPost = user.posts.find(p => 
            p.id === Number(postId) || 
            p.id?.toString() === postId || 
            p._id?.toString() === postId
          );
          
          if (userPost) {
            foundPost = userPost;
            foundUser = user;
            break;
          }
        }
      }
      
      if (!foundPost) {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      // Update view count in user's post
      await User.updateOne(
        { username: foundUser.username, 'posts.id': foundPost.id || foundPost._id },
        { $inc: { 'posts.$.views': 1 } }
      );
      
      // Also update in posts collection if it exists there
      await Post.updateOne(
        { 
          $or: [
            { id: Number(postId) },
            { id: postId },
            { _id: postId }
          ]
        },
        { $inc: { views: 1 } },
        { upsert: true }
      );
      
      const newViews = (foundPost.views || 0) + 1;
      return res.json({ 
        views: newViews,
        message: 'View counted in user posts'
      });
    }
    
    // Post found in posts collection
    post.views += 1;
    await post.save();
    
    // Also update in user's posts array for consistency
    const user = await User.findOne({ username: post.username });
    if (user) {
      const userPost = user.posts.find(p => p.id === Number(postId));
      if (userPost) {
        userPost.views = (userPost.views || 0) + 1;
        await user.save();
      }
    }
    
    console.log(`[View Count] Views incremented: ${post.id} = ${post.views}`);
    
    res.json({ 
      views: post.views,
      message: 'View counted successfully'
    });
  } catch (error) {
    console.error('[View Count] Error:', error);
    res.status(500).json({ 
      message: 'Server error counting view: ' + error.message
    });
  }
});

// Fixed: Public view count for non-logged users


// =============================================
// BLOG ROUTES
// =============================================

// Admin: Create blog post
router.post('/admin/blog/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { 
      title, 
      content, 
      excerpt, 
      category, 
      tags, 
      featuredImage, 
      isPublished = true,
      isFeatured = false,
      readTime,
      metaTitle,
      metaDescription 
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    // Get admin user
    const adminUser = await User.findOne({ email: req.user.email });
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();

    // Check if slug exists
    const existingSlug = await BlogPost.findOne({ slug });
    if (existingSlug) {
      // Add timestamp to make it unique
      const uniqueSlug = `${slug}-${Date.now()}`;
      blogSlug = uniqueSlug;
    }

    const blogId = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    const blogPost = new BlogPost({
      id: blogId,
      title,
      slug,
      content,
      excerpt: excerpt || content.substring(0, 200) + '...',
      author: adminUser.name || adminUser.username,
      authorUsername: adminUser.username,
      category: category || 'announcements',
      tags: Array.isArray(tags) ? tags : [],
      featuredImage: featuredImage || '',
      isPublished,
      isFeatured,
      readTime: readTime || Math.ceil(content.length / 1000), // 1 min per 1000 chars
      metaTitle: metaTitle || title,
      metaDescription: metaDescription || excerpt || content.substring(0, 160),
      createdAt: now,
      updatedAt: now,
      publishedAt: isPublished ? now : null
    });

    await blogPost.save();

    // Send notification to all users about new blog post
    try {
      await sendNotificationToAllUsers(
        'New Blog Post!',
        `${title}`,
        {
          type: 'blog_post',
          author: adminUser.username,
          blogId: blogId,
          slug: slug,
          category: category
        }
      );
    } catch (notificationError) {
      console.error('[FCM] Blog post notification failed (non-critical):', notificationError);
    }

    res.status(201).json({
      message: 'Blog post created successfully',
      blogPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        category: blogPost.category,
        createdAt: blogPost.createdAt
      }
    });
  } catch (error) {
    console.error('[Admin Blog Create] Error:', error);
    res.status(500).json({ message: 'Server error creating blog post: ' + error.message });
  }
});

// Admin: Update blog post
router.put('/admin/blog/posts/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const blogPost = await BlogPost.findOne({ id });
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Update fields
    if (updateData.title !== undefined) {
      blogPost.title = updateData.title;
      // Regenerate slug if title changed
      if (updateData.title !== blogPost.title) {
        const newSlug = updateData.title
          .toLowerCase()
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, '-')
          .replace(/--+/g, '-')
          .trim();
        
        // Check if new slug exists
        const existingSlug = await BlogPost.findOne({ slug: newSlug, id: { $ne: id } });
        blogPost.slug = existingSlug ? `${newSlug}-${Date.now()}` : newSlug;
      }
    }
    
    if (updateData.content !== undefined) blogPost.content = updateData.content;
    if (updateData.excerpt !== undefined) blogPost.excerpt = updateData.excerpt;
    if (updateData.category !== undefined) blogPost.category = updateData.category;
    if (updateData.tags !== undefined) blogPost.tags = Array.isArray(updateData.tags) ? updateData.tags : [];
    if (updateData.featuredImage !== undefined) blogPost.featuredImage = updateData.featuredImage;
    if (updateData.isPublished !== undefined) {
      blogPost.isPublished = updateData.isPublished;
      if (updateData.isPublished && !blogPost.publishedAt) {
        blogPost.publishedAt = new Date();
      }
    }
    if (updateData.isFeatured !== undefined) blogPost.isFeatured = updateData.isFeatured;
    if (updateData.readTime !== undefined) blogPost.readTime = updateData.readTime;
    if (updateData.metaTitle !== undefined) blogPost.metaTitle = updateData.metaTitle;
    if (updateData.metaDescription !== undefined) blogPost.metaDescription = updateData.metaDescription;
    
    blogPost.updatedAt = new Date();

    await blogPost.save();

    res.json({
      message: 'Blog post updated successfully',
      blogPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        updatedAt: blogPost.updatedAt
      }
    });
  } catch (error) {
    console.error('[Admin Blog Update] Error:', error);
    res.status(500).json({ message: 'Server error updating blog post: ' + error.message });
  }
});

// Admin: Delete blog post
router.delete('/admin/blog/posts/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const blogPost = await BlogPost.findOne({ id });
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    await BlogPost.deleteOne({ id });

    res.json({
      message: 'Blog post deleted successfully',
      deletedPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug
      }
    });
  } catch (error) {
    console.error('[Admin Blog Delete] Error:', error);
    res.status(500).json({ message: 'Server error deleting blog post: ' + error.message });
  }
});

// Admin: Get all blog posts
router.get('/admin/blog/posts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      isPublished, 
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    // Search filter
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { excerpt: searchRegex },
        { author: searchRegex },
        { tags: searchRegex }
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Published status filter
    if (isPublished !== undefined) {
      query.isPublished = isPublished === 'true';
    }

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const blogPosts = await BlogPost.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalBlogPosts = await BlogPost.countDocuments(query);

    // Get statistics
    const totalViews = await BlogPost.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$views' } } }
    ]);

    const totalLikes = await BlogPost.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: { $size: '$likes' } } } }
    ]);

    const categoryStats = await BlogPost.aggregate([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json({
      blogPosts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalBlogPosts / limitNum),
        totalBlogPosts,
        hasNext: pageNum < Math.ceil(totalBlogPosts / limitNum),
        hasPrev: pageNum > 1
      },
      stats: {
        totalViews: totalViews.length > 0 ? totalViews[0].total : 0,
        totalLikes: totalLikes.length > 0 ? totalLikes[0].total : 0,
        categoryStats
      }
    });
  } catch (error) {
    console.error('[Admin Blog List] Error:', error);
    res.status(500).json({ message: 'Server error fetching blog posts: ' + error.message });
  }
});

// Public: Get blog posts
router.get('/blog/posts', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      featured, 
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      author 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { isPublished: true };

    // Search filter
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { excerpt: searchRegex },
        { author: searchRegex },
        { tags: searchRegex }
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Author filter
    if (author) {
      query.authorUsername = author;
    }

    // Featured filter
    if (featured === 'true') {
      query.isFeatured = true;
    }

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const blogPosts = await BlogPost.find(query)
      .select('-content') // Don't send full content in list view
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalBlogPosts = await BlogPost.countDocuments(query);

    // Increment views for each post (optional)
    if (blogPosts.length > 0) {
      const postIds = blogPosts.map(post => post.id);
      await BlogPost.updateMany(
        { id: { $in: postIds } },
        { $inc: { views: 1 } }
      );
    }

    // Get categories for filter
    const categories = await BlogPost.distinct('category', { isPublished: true });

    res.json({
      blogPosts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalBlogPosts / limitNum),
        totalBlogPosts,
        hasNext: pageNum < Math.ceil(totalBlogPosts / limitNum),
        hasPrev: pageNum > 1
      },
      categories,
      filters: {
        category,
        featured,
        search,
        sortBy,
        sortOrder,
        author
      }
    });
  } catch (error) {
    console.error('[Public Blog List] Error:', error);
    res.status(500).json({ message: 'Server error fetching blog posts: ' + error.message });
  }
});

// Public: Get single blog post by slug
router.get('/blog/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const blogPost = await BlogPost.findOne({ slug, isPublished: true }).lean();
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    // Increment views
    await BlogPost.updateOne(
      { slug },
      { $inc: { views: 1 } }
    );

    // Get related posts (same category, exclude current)
    const relatedPosts = await BlogPost.find({
      category: blogPost.category,
      slug: { $ne: slug },
      isPublished: true
    })
    .select('title slug excerpt featuredImage createdAt readTime')
    .limit(3)
    .sort({ createdAt: -1 })
    .lean();

    // Get author details
    const author = await User.findOne({ username: blogPost.authorUsername })
      .select('username profilePicture name bio')
      .lean();

    res.json({
      ...blogPost,
      authorDetails: author,
      relatedPosts
    });
  } catch (error) {
    console.error('[Public Blog Single] Error:', error);
    res.status(500).json({ message: 'Server error fetching blog post: ' + error.message });
  }
});

// Public: Get blog categories
router.get('/blog/categories', async (req, res) => {
  try {
    const categories = await BlogPost.aggregate([
      { $match: { isPublished: true } },
      { $group: { 
        _id: '$category', 
        count: { $sum: 1 },
        latestPost: { $max: '$createdAt' }
      }},
      { $sort: { count: -1 } }
    ]);

    // Map category IDs to names
    const categoryNames = {
      'getting-started': 'Getting Started',
      'account-management': 'Account Management',
      'premium-content': 'Premium Content',
      'live-streaming': 'Live Streaming',
      'payments-earnings': 'Payments & Earnings',
      'privacy-safety': 'Privacy & Safety',
      'technical-support': 'Technical Support',
      'announcements': 'Announcements',
      'tips-tricks': 'Tips & Tricks'
    };

    const formattedCategories = categories.map(cat => ({
      id: cat._id,
      name: categoryNames[cat._id] || cat._id,
      count: cat.count,
      latestPost: cat.latestPost
    }));

    res.json(formattedCategories);
  } catch (error) {
    console.error('[Blog Categories] Error:', error);
    res.status(500).json({ message: 'Server error fetching categories: ' + error.message });
  }
});

// Public: Search blog posts
router.get('/blog/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const results = await BlogPost.find({
      isPublished: true,
      $or: [
        { title: searchRegex },
        { content: searchRegex },
        { excerpt: searchRegex },
        { tags: searchRegex }
      ]
    })
    .select('title slug excerpt featuredImage category createdAt readTime')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 })
    .lean();

    res.json(results);
  } catch (error) {
    console.error('[Blog Search] Error:', error);
    res.status(500).json({ message: 'Server error searching blog: ' + error.message });
  }
});

// Like blog post
router.post('/blog/posts/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;

    const blogPost = await BlogPost.findOne({ id });
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    const alreadyLiked = blogPost.likes.includes(username);
    
    if (alreadyLiked) {
      // Unlike
      blogPost.likes = blogPost.likes.filter(like => like !== username);
    } else {
      // Like
      blogPost.likes.push(username);
    }

    await blogPost.save();

    res.json({
      likes: blogPost.likes,
      likesCount: blogPost.likes.length,
      isLiked: !alreadyLiked
    });
  } catch (error) {
    console.error('[Blog Like] Error:', error);
    res.status(500).json({ message: 'Server error liking blog post: ' + error.message });
  }
});

// Add comment to blog post
router.post('/blog/posts/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const username = req.user.username;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const blogPost = await BlogPost.findOne({ id });
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    const user = await User.findOne({ username }).select('username name profilePicture isAdmin').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const commentId = crypto.randomBytes(8).toString('hex');
    const comment = {
      id: commentId,
      username,
      text: text.trim(),
      timestamp: new Date(),
      isAdminReply: user.isAdmin || false,
      replies: []
    };

    blogPost.comments.push(comment);
    await blogPost.save();

    // Send notification to blog author
    if (blogPost.authorUsername !== username) {
      try {
        await sendNotificationToUser(
          blogPost.authorUsername,
          'New Comment on Your Blog Post',
          `${username} commented on "${blogPost.title}"`,
          { 
            type: 'blog_comment', 
            blogId: id, 
            commenter: username,
            slug: blogPost.slug
          }
        );
      } catch (notifError) {
        console.log('[FCM] Blog comment notification failed (non-critical):', notifError);
      }
    }

    res.status(201).json({
      message: 'Comment added successfully',
      comment: {
        ...comment,
        userProfile: {
          username: user.username,
          name: user.name || user.username,
          profilePicture: user.profilePicture,
          isAdmin: user.isAdmin
        }
      }
    });
  } catch (error) {
    console.error('[Blog Comment] Error:', error);
    res.status(500).json({ message: 'Server error adding comment: ' + error.message });
  }
});

// Reply to blog comment
router.post('/blog/posts/:id/comments/:commentId/reply', authenticateToken, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { text } = req.body;
    const username = req.user.username;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Reply text is required' });
    }

    const blogPost = await BlogPost.findOne({ id });
    if (!blogPost) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    const user = await User.findOne({ username }).select('username name profilePicture isAdmin').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const comment = blogPost.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const replyId = crypto.randomBytes(8).toString('hex');
    const reply = {
      id: replyId,
      username,
      text: text.trim(),
      timestamp: new Date(),
      isAdminReply: user.isAdmin || false
    };

    comment.replies.push(reply);
    await blogPost.save();

    // Send notification to original commenter
    if (comment.username !== username) {
      try {
        await sendNotificationToUser(
          comment.username,
          'New Reply to Your Comment',
          `${username} replied to your comment on "${blogPost.title}"`,
          { 
            type: 'blog_comment_reply', 
            blogId: id, 
            replier: username,
            slug: blogPost.slug
          }
        );
      } catch (notifError) {
        console.log('[FCM] Blog reply notification failed (non-critical):', notifError);
      }
    }

    res.status(201).json({
      message: 'Reply added successfully',
      reply: {
        ...reply,
        userProfile: {
          username: user.username,
          name: user.name || user.username,
          profilePicture: user.profilePicture,
          isAdmin: user.isAdmin
        }
      }
    });
  } catch (error) {
    console.error('[Blog Comment Reply] Error:', error);
    res.status(500).json({ message: 'Server error adding reply: ' + error.message });
  }
});

// Public: Get featured blog posts
router.get('/blog/featured', async (req, res) => {
  try {
    const featuredPosts = await BlogPost.find({
      isPublished: true,
      isFeatured: true
    })
    .select('title slug excerpt featuredImage category createdAt readTime views likes')
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

    res.json(featuredPosts);
  } catch (error) {
    console.error('[Blog Featured] Error:', error);
    res.status(500).json({ message: 'Server error fetching featured posts: ' + error.message });
  }
});

// Public: Get popular blog posts
router.get('/blog/popular', async (req, res) => {
  try {
    const popularPosts = await BlogPost.find({
      isPublished: true
    })
    .select('title slug excerpt featuredImage category createdAt readTime views likes')
    .sort({ views: -1, likes: -1 })
    .limit(6)
    .lean();

    res.json(popularPosts);
  } catch (error) {
    console.error('[Blog Popular] Error:', error);
    res.status(500).json({ message: 'Server error fetching popular posts: ' + error.message });
  }
});

// Public: Get recent blog posts
router.get('/blog/recent', async (req, res) => {
  try {
    const recentPosts = await BlogPost.find({
      isPublished: true
    })
    .select('title slug excerpt featuredImage category createdAt readTime')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

    res.json(recentPosts);
  } catch (error) {
    console.error('[Blog Recent] Error:', error);
    res.status(500).json({ message: 'Server error fetching recent posts: ' + error.message });
  }
});

// Admin: Get blog statistics
router.get('/admin/blog/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total stats
    const totalPosts = await BlogPost.countDocuments();
    const publishedPosts = await BlogPost.countDocuments({ isPublished: true });
    const featuredPosts = await BlogPost.countDocuments({ isFeatured: true });

    // Views and likes totals
    const viewsStats = await BlogPost.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' }, avgViews: { $avg: '$views' } } }
    ]);

    const likesStats = await BlogPost.aggregate([
      { $group: { _id: null, totalLikes: { $sum: { $size: '$likes' } }, avgLikes: { $avg: { $size: '$likes' } } } }
    ]);

    // Recent posts
    const recentPosts = await BlogPost.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title slug views likes createdAt')
      .lean();

    // Most popular posts
    const popularPosts = await BlogPost.find()
      .sort({ views: -1 })
      .limit(5)
      .select('title slug views likes')
      .lean();

    // Posts by category
    const postsByCategory = await BlogPost.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Monthly stats
    const monthlyStats = await BlogPost.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          totalViews: { $sum: '$views' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ]);

    res.json({
      overview: {
        totalPosts,
        publishedPosts,
        featuredPosts,
        totalViews: viewsStats.length > 0 ? viewsStats[0].totalViews : 0,
        avgViews: viewsStats.length > 0 ? Math.round(viewsStats[0].avgViews) : 0,
        totalLikes: likesStats.length > 0 ? likesStats[0].totalLikes : 0,
        avgLikes: likesStats.length > 0 ? Math.round(likesStats[0].avgLikes) : 0
      },
      recentPosts,
      popularPosts,
      postsByCategory,
      monthlyStats
    });
  } catch (error) {
    console.error('[Admin Blog Stats] Error:', error);
    res.status(500).json({ message: 'Server error fetching blog statistics: ' + error.message });
  }
});

// Export blog posts (CSV/JSON)
router.get('/admin/blog/export', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    const blogPosts = await BlogPost.find()
      .select('-__v')
      .lean();

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['ID', 'Title', 'Slug', 'Author', 'Category', 'Views', 'Likes', 'Published', 'Created At'];
      const csvRows = [headers.join(',')];
      
      blogPosts.forEach(post => {
        const row = [
          post.id,
          `"${post.title.replace(/"/g, '""')}"`,
          post.slug,
          post.author,
          post.category,
          post.views,
          post.likes.length,
          post.isPublished ? 'Yes' : 'No',
          new Date(post.createdAt).toISOString()
        ];
        csvRows.push(row.join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=blog-posts-export.csv');
      return res.send(csvRows.join('\n'));
    } else {
      // Default JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=blog-posts-export.json');
      return res.json(blogPosts);
    }
  } catch (error) {
    console.error('[Blog Export] Error:', error);
    res.status(500).json({ message: 'Server error exporting blog posts: ' + error.message });
  }
});
// Check username availability
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 3) {
      return res.status(400).json({ 
        available: false, 
        message: 'Username must be at least 3 characters' 
      });
    }
    
    // Check if username exists (case insensitive)
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    }).lean();
    
    const available = !existingUser;
    
    res.json({
      available,
      message: available ? 'Username is available' : 'Username is already taken',
      username: username
    });
  } catch (error) {
    console.error('[Check Username] Error:', error);
    res.status(500).json({ 
      available: false, 
      message: 'Error checking username availability' 
    });
  }
});

// Check email availability
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        available: false, 
        message: 'Invalid email format' 
      });
    }
    
    const existingUser = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    }).lean();
    
    const available = !existingUser;
    
    res.json({
      available,
      message: available ? 'Email is available' : 'Email is already registered',
      email: email
    });
  } catch (error) {
    console.error('[Check Email] Error:', error);
    res.status(500).json({ 
      available: false, 
      message: 'Error checking email availability' 
    });
  }
});


// Debug route to check subscription directly
router.get('/debug/subscription/:targetUsername', authenticateToken, async (req, res) => {
  try {
    const { targetUsername } = req.params;
    const subscriberUsername = req.user.username;
    
    console.log(`[Debug Subscription] Checking for ${subscriberUsername} -> ${targetUsername}`);
    
    // Find all subscriptions (including inactive)
    const subscriptions = await Subscription.find({
      subscriberId: subscriberUsername,
      targetUserId: targetUsername
    }).lean();
    
    // Get target user's premium plans
    const targetUser = await User.findOne({ username: targetUsername }).select('premiumPricing premiumPlans username').lean();
    
    res.json({
      subscriber: subscriberUsername,
      target: targetUsername,
      allSubscriptions: subscriptions,
      activeSubscription: subscriptions.find(s => s.status === 'active'),
      targetUser: targetUser,
      currentTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Debug Subscription] Error:', error);
    res.status(500).json({ message: 'Debug error: ' + error.message });
  }
});



// =============================================
// FIXED VIEW COUNTING ENDPOINTS - FOR BOTH LOGGED AND UNLOGGED USERS
// =============================================


// Add this route after your other routes (around line where you have /users/bulk-user-types)

// Bulk user types endpoint - FIXED VERSION
router.post('/users/types/batch', authenticateToken, async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log('[BulkUserTypes] Fetching user types for:', usernames.length, 'users');

    // Fetch users with only username and userType fields
    const users = await User.find(
      { username: { $in: usernames } },
      { username: 1, userType: 1, _id: 0 }
    ).lean();

    // Create a map of username to userType
    const userTypeMap = {};
    users.forEach(user => {
      userTypeMap[user.username] = user.userType || 'content_creator';
    });

    // Fill in missing usernames with default
    usernames.forEach(username => {
      if (!userTypeMap[username]) {
        userTypeMap[username] = 'content_creator';
      }
    });

    console.log('[BulkUserTypes] Returning user types for:', Object.keys(userTypeMap).length, 'users');
    
    res.json({ userTypeMap });
  } catch (error) {
    console.error('[BulkUserTypes] Error:', error);
    res.status(500).json({ message: 'Server error fetching user types: ' + error.message });
  }
});



// Batch fetch users by usernames (for location data)
router.post('/api/users/batch', async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    console.log('[Batch Users] Fetching users for:', usernames.length, 'usernames');

    // Limit to reasonable number
    const uniqueUsernames = [...new Set(usernames)].slice(0, 100);
    
    const users = await User.find(
      { username: { $in: uniqueUsernames } },
      { 
        username: 1, 
        city: 1, 
        country: 1, 
        state: 1, 
        location: 1, 
        bio: 1,
        firstName: 1,
        lastName: 1,
        name: 1,
        profilePicture: 1,
        userType: 1
      }
    ).lean();

    console.log('[Batch Users] Found:', users.length, 'users');

    res.json(users);
  } catch (error) {
    console.error('[Batch Users] Error:', error);
    res.status(500).json({ message: 'Server error fetching batch users: ' + error.message });
  }
});

// Public user endpoint for unlogged users
router.get('/api/users/:username/public', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username })
      .select('username profilePicture firstName lastName name location city country state bio userType')
      .lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      ...user,
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || ''
    });
  } catch (error) {
    console.error('[Public User] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Add this to auth.js - CORRECTED PUBLIC USER ENDPOINT (no extra /public suffix)
router.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username })
      .select('username profilePicture firstName lastName name location city country state bio userType')
      .lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      username: user.username,
      profilePicture: user.profilePicture,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    });
  } catch (error) {
    console.error('[Public User] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Batch fetch users endpoint
router.post('/api/users/batch', async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    const uniqueUsernames = [...new Set(usernames)].slice(0, 100);
    
    const users = await User.find(
      { username: { $in: uniqueUsernames } },
      { 
        username: 1, 
        city: 1, 
        country: 1, 
        state: 1, 
        location: 1, 
        bio: 1,
        firstName: 1,
        lastName: 1,
        name: 1,
        profilePicture: 1,
        userType: 1
      }
    ).lean();

    res.json(users);
  } catch (error) {
    console.error('[Batch Users] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Batch fetch users by usernames (for location data)
router.post('/api/users/batch', async (req, res) => {
  try {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ message: 'Usernames array is required' });
    }

    const uniqueUsernames = [...new Set(usernames)].slice(0, 100);
    
    const users = await User.find(
      { username: { $in: uniqueUsernames } },
      { 
        username: 1, 
        city: 1, 
        country: 1, 
        state: 1, 
        location: 1, 
        bio: 1,
        firstName: 1,
        lastName: 1,
        name: 1,
        profilePicture: 1,
        userType: 1
      }
    ).lean();

    res.json(users);
  } catch (error) {
    console.error('[Batch Users] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Public user endpoint (no auth required)
router.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username })
      .select('username profilePicture firstName lastName name location city country state bio userType')
      .lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      username: user.username,
      profilePicture: user.profilePicture,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      location: user.location || '',
      city: user.city || '',
      country: user.country || '',
      state: user.state || '',
      bio: user.bio || '',
      userType: user.userType || 'content_creator',
      displayName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    });
  } catch (error) {
    console.error('[Public User] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Enhanced Public posts with user location data
// Enhanced Public posts with user location data
router.get('/public/posts', checkDbConnection, async (req, res) => {
  const cacheKey = 'public_posts_with_location';
  const bypassCache = req.query.bypassCache === 'true';
  const cachedPosts = !bypassCache ? cache.get(cacheKey) : null;

  if (cachedPosts) {
    console.log('[Public Posts] Returning cached posts with location data');
    return res.json(cachedPosts);
  }

  try {
    console.log('[Public Posts] Fetching fresh public posts with user location data...');
    
    // Get ALL public posts (non-premium)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    console.log('[Public Posts] Raw public posts from database:', publicPosts.length);
    
    // Get unique usernames from posts
    const uniqueUsernames = [...new Set(publicPosts.map(post => post.username).filter(Boolean))];
    
    console.log('[Public Posts] Unique usernames found:', uniqueUsernames.length);
    
    // Fetch user data for all these usernames including location fields
    const users = await User.find(
      { username: { $in: uniqueUsernames } },
      { 
        username: 1, 
        city: 1, 
        country: 1, 
        state: 1, 
        location: 1, 
        bio: 1,
        firstName: 1,
        lastName: 1,
        name: 1,
        profilePicture: 1,
        userType: 1
      }
    ).lean();

    // Create a map of username to user data
    const userMap = {};
    users.forEach(user => {
      userMap[user.username] = user;
      console.log(`[Public Posts] User ${user.username} location:`, {
        city: user.city,
        country: user.country,
        location: user.location
      });
    });

    // Enhance posts with user location data
    const enhancedPosts = publicPosts.map(post => {
      const userData = userMap[post.username] || {};
      return {
        ...post,
        // Add location fields directly to the post object
        city: userData.city || post.city || '',
        country: userData.country || post.country || '',
        state: userData.state || post.state || '',
        location: userData.location || post.location || '',
        userCity: userData.city || '',
        userCountry: userData.country || '',
        userState: userData.state || '',
        userLocation: userData.location || '',
        displayName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || post.username,
        userProfilePicture: userData.profilePicture || null,
        userType: userData.userType || 'content_creator',
        // Ensure other required fields
        likes: post.likes || [],
        comments: post.comments || [],
        views: post.views || 0,
        images: post.images || [],
        videos: post.videos || [],
      };
    });

    // Get admin posts and insert them every 6 posts
    const adminUsers = await User.find({ isAdmin: true }).select('username').lean();
    const adminUsernames = adminUsers.map(admin => admin.username);
    
    let allPosts = enhancedPosts;
    
    if (adminUsernames.length > 0) {
      const adminPosts = await Post.find({ 
        username: { $in: adminUsernames },
        isAdminPost: true 
      })
      .sort({ timestamp: -1 })
      .lean();
      
      if (adminPosts.length > 0) {
        // Enhance admin posts with user data
        const enhancedAdminPosts = adminPosts.map(post => {
          const userData = userMap[post.username] || {};
          return {
            ...post,
            city: userData.city || '',
            country: userData.country || '',
            state: userData.state || '',
            location: userData.location || '',
            userCity: userData.city || '',
            userCountry: userData.country || '',
            displayName: userData.name || post.username,
            isAdminPost: true,
            hasGoldenBadge: true,
          };
        });
        
        allPosts = insertAdminPosts(enhancedPosts, enhancedAdminPosts);
      }
    }

    // Cache the results
    if (!bypassCache) {
      cache.set(cacheKey, allPosts, 300);
    }

    console.log('[Public Posts] Returning posts with location data:', {
      total: allPosts.length,
      sampleWithLocation: allPosts.slice(0, 3).map(p => ({
        username: p.username,
        city: p.city,
        country: p.country,
        location: p.location
      }))
    });
    
    res.json(allPosts);
    
  } catch (error) {
    console.error('[Public Posts] Error:', error);
    cache.del(cacheKey);
    res.status(500).json({ message: 'Server error fetching public posts: ' + error.message });
  }
});

// Admin: Send broadcast email to all users
// Helper function for enhanced email HTML with media and markdown support
const buildEnhancedEmailHTML = (subject, message, images = [], videos = []) => {
  // Parse markdown-style formatting
  let formattedContent = message
    // Headers
    .replace(/^## (.*?)$/gm, '<h2 style="color: #333; margin-top: 20px; margin-bottom: 10px;">$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3 style="color: #555; margin-top: 15px; margin-bottom: 8px;">$1</h3>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Underline
    .replace(/___(.*?)___/g, '<u>$1</u>')
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color: #667eea; text-decoration: underline;" target="_blank">$1</a>')
    // Images from markdown
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;" />')
    // Bullet lists
    .replace(/^• (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 5px;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 5px;">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');
  
  // Wrap lists in ul/ol
  if (formattedContent.includes('<li')) {
    formattedContent = formattedContent.replace(/(<li.*?<\/li>)/g, '<ul style="margin: 10px 0;">$1</ul>');
  }
  
  // Build media section from uploaded files
  let mediaSection = '';
  
  if (images && images.length > 0) {
    mediaSection += '<div style="margin: 20px 0;">';
    mediaSection += '<h4 style="color: #333; margin-bottom: 10px;">📸 Attached Images</h4>';
    mediaSection += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    images.forEach(img => {
      mediaSection += `<img src="${img}" style="max-width: 200px; max-height: 150px; border-radius: 8px; object-fit: cover;" />`;
    });
    mediaSection += '</div></div>';
  }
  
  if (videos && videos.length > 0) {
    mediaSection += '<div style="margin: 20px 0;">';
    mediaSection += '<h4 style="color: #333; margin-bottom: 10px;">🎬 Attached Videos</h4>';
    mediaSection += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    videos.forEach(video => {
      mediaSection += `<video controls style="max-width: 300px; max-height: 200px; border-radius: 8px;">
                         <source src="${video}" type="video/mp4">
                         Your browser does not support the video tag.
                       </video>`;
    });
    mediaSection += '</div></div>';
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject.replace(/</g, '&lt;')}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .message-box { background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
            .footer { text-align: center; padding: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; background: #fafafa; }
            hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
            img { max-width: 100%; height: auto; border-radius: 8px; }
            video { max-width: 100%; border-radius: 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📢 Announcement from 6tyNine</h1>
            </div>
            <div class="content">
                <div class="message-box">
                    ${formattedContent}
                    ${mediaSection}
                </div>
                <hr>
                <p style="font-size: 14px; color: #666;">
                    This is an official announcement from the 6tyNine team.
                </p>
                <p style="font-size: 12px; color: #999;">
                    You're receiving this email because you have an account on 6tyNine.
                    To unsubscribe from these emails, please update your notification settings in the app.
                </p>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} 6tyNine. All rights reserved.</p>
                <p>Questions? Contact us at support@6tynine.com</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

// Admin: Send broadcast email to all users (ENHANCED with media support)
router.post('/admin/send-broadcast-email', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { toEmail, toName, subject, message, fromAdmin, images, videos } = req.body;

    console.log('[Broadcast] Received request to send email to:', toEmail);
    console.log('[Broadcast] Subject:', subject);
    console.log('[Broadcast] Has images:', images?.length > 0);
    console.log('[Broadcast] Has videos:', videos?.length > 0);
    console.log('[Broadcast] Message preview:', message?.substring(0, 100));

    if (!toEmail || !subject || !message) {
      return res.status(400).json({ message: 'Email, subject, and message are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      console.error(`[Broadcast] Invalid email address: ${toEmail}`);
      return res.status(400).json({ message: 'Invalid email address' });
    }

    // Wait for email initialization if not ready
    if (!isEmailInitialized) {
      console.log('[Broadcast] Email not initialized, attempting to initialize...');
      try {
        await initializeEmailTransporter();
      } catch (error) {
        console.error('[Broadcast] Failed to initialize email transporter:', error);
        return res.status(500).json({ message: 'Email system not available. Please check email configuration.' });
      }
    }

    if (!emailTransporter || !isEmailInitialized) {
      console.error('[Broadcast] Email transporter not initialized after retry');
      return res.status(500).json({ message: 'Email system not available. Please contact administrator.' });
    }

    // Get admin user info
    const adminUser = await User.findOne({ email: req.user.email }).select('username name').lean();
    const adminName = adminUser?.name || adminUser?.username || '6tyNine Admin';

    // Build HTML content with media and markdown support
    const htmlContent = buildEnhancedEmailHTML(subject, message, images || [], videos || []);
    
    // Plain text version (strip HTML/markdown)
    const plainText = message
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1: $2')
      .replace(/!\[(.*?)\]\((.*?)\)/g, '[Image: $2]')
      .replace(/^## (.*?)$/gm, '$1\n---')
      .replace(/^### (.*?)$/gm, '$1\n---')
      .replace(/\n/g, '\n');

    const mailOptions = {
      from: {
        name: '6tyNine Announcements',
        address: GMAIL_CONFIG.user
      },
      to: toEmail,
      subject: subject,
      html: htmlContent,
      text: `ANNOUNCEMENT FROM 6tyNine\n\nHello ${toName || 'there'},\n\n${plainText}\n\n---\nThis is an official announcement from the 6tyNine team.\n\nYou're receiving this email because you have an account on 6tyNine.\nTo unsubscribe from these emails, please update your notification settings in the app.\n\n© ${new Date().getFullYear()} 6tyNine`
    };

    // Add attachments if images/videos are provided as files
    if (images && images.length > 0) {
      mailOptions.attachments = mailOptions.attachments || [];
      images.forEach((img, idx) => {
        if (img.startsWith('data:image')) {
          // Handle base64 images
          const matches = img.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            mailOptions.attachments.push({
              filename: `image_${idx + 1}.${matches[1]}`,
              content: matches[2],
              encoding: 'base64',
              cid: `image_${idx + 1}`
            });
          }
        } else if (img.startsWith('http')) {
          // Handle URLs
          mailOptions.attachments.push({
            filename: `image_${idx + 1}.jpg`,
            path: img,
            cid: `image_${idx + 1}`
          });
        }
      });
    }

    if (videos && videos.length > 0) {
      mailOptions.attachments = mailOptions.attachments || [];
      videos.forEach((video, idx) => {
        if (video.startsWith('data:video')) {
          const matches = video.match(/^data:video\/([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            mailOptions.attachments.push({
              filename: `video_${idx + 1}.${matches[1]}`,
              content: matches[2],
              encoding: 'base64'
            });
          }
        } else if (video.startsWith('http')) {
          mailOptions.attachments.push({
            filename: `video_${idx + 1}.mp4`,
            path: video
          });
        }
      });
    }

    console.log(`[Broadcast] Sending email to ${toEmail}...`);
    
    const info = await emailTransporter.sendMail(mailOptions);
    
    console.log(`[Broadcast] ✅ Email sent to ${toEmail}`);
    console.log(`[Broadcast] Message ID: ${info.messageId}`);
    
    // Log the broadcast activity
    try {
      const broadcastActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'broadcast_sent',
        data: {
          toEmail: toEmail,
          subject: subject,
          hasImages: images && images.length > 0,
          hasVideos: videos && videos.length > 0,
          messageLength: message.length
        },
        adminUser: req.user.username,
        adminId: req.user._id,
        timestamp: new Date()
      });
      await broadcastActivity.save();
    } catch (logError) {
      console.error('[Broadcast] Failed to log broadcast activity:', logError);
    }
    
    res.json({
      success: true,
      message: 'Broadcast email sent successfully',
      messageId: info.messageId,
      to: toEmail
    });
    
  } catch (error) {
    console.error('[Broadcast] Error sending to:', req.body.toEmail, error);
    
    let errorMessage = 'Failed to send broadcast email';
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Please check email credentials.';
    } else if (error.code === 'ESOCKET') {
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (error.response) {
      errorMessage = `Email service error: ${error.response}`;
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: error.message,
      code: error.code
    });
  }
});


// Test broadcast endpoint (to test single email)
router.post('/admin/test-email', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { toEmail, toName } = req.body;
    
    if (!toEmail) {
      return res.status(400).json({ message: 'Email address is required' });
    }
    
    console.log('[Test Email] Sending test email to:', toEmail);
    
    // Wait for email initialization if not ready
    if (!isEmailInitialized) {
      try {
        await initializeEmailTransporter();
      } catch (error) {
        return res.status(500).json({ message: 'Email system not available: ' + error.message });
      }
    }
    
    if (!emailTransporter || !isEmailInitialized) {
      return res.status(500).json({ message: 'Email system not available' });
    }
    
    const mailOptions = {
      from: {
        name: '6tyNine Test',
        address: GMAIL_CONFIG.user
      },
      to: toEmail,
      subject: 'Test Email from 6tyNine Admin Panel',
      html: `
        <h2>Test Email</h2>
        <p>Hello ${toName || 'there'},</p>
        <p>This is a test email from the 6tyNine admin panel.</p>
        <p>If you received this, your email system is working correctly!</p>
        <hr>
        <p>Best regards,<br>6tyNine Team</p>
      `,
      text: `Test Email\n\nHello ${toName || 'there'},\n\nThis is a test email from the 6tyNine admin panel.\nIf you received this, your email system is working correctly!\n\nBest regards,\n6tyNine Team`
    };
    
    const info = await emailTransporter.sendMail(mailOptions);
    
    res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('[Test Email] Error:', error);
    res.status(500).json({ message: 'Failed to send test email: ' + error.message });
  }
});


// Add these endpoints to your backend auth.js file

// Check if email exists (using DNS/MX records)
router.post('/api/auth/admin/check-email-exists', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ exists: false, reason: 'Email is required' });
    }
    
    console.log(`[Email Check] Verifying: ${email}`);
    
    // Parse domain from email
    const domain = email.split('@')[1];
    
    if (!domain) {
      return res.json({ exists: false, reason: 'Invalid email format' });
    }
    
    // Check if it's a Gmail domain
    if (!domain.toLowerCase().includes('gmail')) {
      return res.json({ exists: false, reason: 'Not a Gmail address' });
    }
    
    // Method 1: Try to perform DNS MX lookup
    const dns = require('dns');
    const util = require('util');
    const resolveMx = util.promisify(dns.resolveMx);
    
    try {
      const mxRecords = await resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        console.log(`[Email Check] MX records found for ${domain}: ${mxRecords.length} records`);
        return res.json({ exists: true, reason: 'Domain has valid MX records' });
      }
    } catch (dnsError) {
      console.log(`[Email Check] DNS lookup failed for ${domain}:`, dnsError.message);
    }
    
    // Method 2: Check if domain is Gmail (known to exist)
    if (domain.toLowerCase() === 'gmail.com') {
      return res.json({ exists: true, reason: 'Gmail domain is valid' });
    }
    
    return res.json({ exists: false, reason: 'Domain does not have valid mail servers' });
    
  } catch (error) {
    console.error('[Email Check] Error:', error);
    res.json({ exists: true, reason: 'Verification error - will attempt to send' });
  }
});









// Email verification helper function
const verifyEmailExists = async (email) => {
  try {
    if (!email) return { valid: false, reason: 'Email is required' };
    
    // Basic format validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!emailRegex.test(email)) {
      return { valid: false, reason: 'Invalid email format - must be @gmail.com' };
    }
    
    // Parse domain
    const domain = email.split('@')[1];
    
    // For Gmail, we can be confident in the domain
    if (domain && domain.toLowerCase() === 'gmail.com') {
      // Gmail domain is valid, but the specific email might not exist
      // We'll do a deeper check using SMTP
      return await verifyEmailViaSMTP(email);
    }
    
    return { valid: false, reason: 'Only Gmail addresses are supported' };
    
  } catch (error) {
    console.error(`[Email Verify] Error for ${email}:`, error);
    return { valid: false, reason: 'Verification error' };
  }
};

// SMTP-based email verification (more reliable)
const verifyEmailViaSMTP = async (email) => {
  return new Promise((resolve) => {
    const net = require('net');
    const dns = require('dns');
    const domain = email.split('@')[1];
    
    // Timeout for the entire operation
    const timeout = setTimeout(() => {
      console.log(`[SMTP Check] Timeout for ${email}`);
      resolve({ valid: true, reason: 'Timeout - will attempt to send' }); // Default to true on timeout
    }, 5000);
    
    // Get MX records
    dns.resolveMx(domain, (err, mxRecords) => {
      if (err || !mxRecords || mxRecords.length === 0) {
        clearTimeout(timeout);
        console.log(`[SMTP Check] No MX records for ${domain}`);
        resolve({ valid: false, reason: 'No mail servers found for domain' });
        return;
      }
      
      // Sort by priority and get the highest priority MX server
      mxRecords.sort((a, b) => a.priority - b.priority);
      const mxServer = mxRecords[0].exchange;
      
      console.log(`[SMTP Check] Connecting to ${mxServer} for ${email}`);
      
      // Create socket connection
      const socket = new net.Socket();
      let data = '';
      let stage = 'connect';
      let heloCount = 0;
      
      socket.setTimeout(8000);
      
      socket.on('connect', () => {
        console.log(`[SMTP Check] Connected to ${mxServer}`);
      });
      
      socket.on('data', (chunk) => {
        data += chunk.toString();
        
        if (stage === 'connect' && data.includes('220')) {
          stage = 'helo';
          socket.write('HELO verify.6tynine.com\r\n');
          data = '';
        } 
        else if (stage === 'helo' && data.includes('250')) {
          stage = 'mail';
          socket.write(`MAIL FROM:<verify@6tynine.com>\r\n`);
          data = '';
        }
        else if (stage === 'mail' && data.includes('250')) {
          stage = 'rcpt';
          socket.write(`RCPT TO:<${email}>\r\n`);
          data = '';
        }
        else if (stage === 'rcpt') {
          clearTimeout(timeout);
          
          if (data.includes('250') || data.includes('251')) {
            console.log(`[SMTP Check] Email ${email} appears to be valid`);
            resolve({ valid: true, reason: 'Email verified via SMTP' });
          } else if (data.includes('550') || data.includes('551') || data.includes('553')) {
            console.log(`[SMTP Check] Email ${email} rejected - likely does not exist`);
            resolve({ valid: false, reason: 'Email address does not exist' });
          } else {
            console.log(`[SMTP Check] Email ${email} - ambiguous response, will attempt to send`);
            resolve({ valid: true, reason: 'Ambiguous response - will attempt to send' });
          }
          
          socket.write('QUIT\r\n');
          socket.destroy();
        }
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        console.log(`[SMTP Check] Socket error for ${email}:`, err.message);
        resolve({ valid: true, reason: 'Connection error - will attempt to send' });
      });
      
      socket.on('timeout', () => {
        clearTimeout(timeout);
        console.log(`[SMTP Check] Socket timeout for ${email}`);
        resolve({ valid: true, reason: 'Timeout - will attempt to send' });
        socket.destroy();
      });
      
      socket.connect(25, mxServer);
    });
  });
};

// Batch email verification
const verifyEmailsBatch = async (emails, concurrency = 5) => {
  const results = [];
  const chunks = [];
  
  // Split into chunks for concurrency
  for (let i = 0; i < emails.length; i += concurrency) {
    chunks.push(emails.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (emailObj) => {
        const verification = await verifyEmailExists(emailObj.email);
        return {
          ...emailObj,
          verification,
          isValid: verification.valid
        };
      })
    );
    results.push(...chunkResults);
    
    // Small delay between chunks
    if (chunks.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

// Admin: Verify email addresses before broadcast
router.post('/admin/verify-emails', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'Emails array is required' });
    }
    
    console.log(`[Verify Emails] Starting verification for ${emails.length} emails`);
    
    // Limit to reasonable number
    const emailsToVerify = emails.slice(0, 500);
    
    // Basic format validation first
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    const formattedEmails = emailsToVerify.map(emailObj => ({
      ...emailObj,
      email: emailObj.email.toLowerCase().trim()
    }));
    
    // Filter by format first
    const validFormat = [];
    const invalidFormat = [];
    
    for (const emailObj of formattedEmails) {
      if (emailRegex.test(emailObj.email)) {
        validFormat.push(emailObj);
      } else {
        invalidFormat.push({
          ...emailObj,
          reason: 'Invalid email format (must be @gmail.com)'
        });
      }
    }
    
    console.log(`[Verify Emails] Format check: ${validFormat.length} valid, ${invalidFormat.length} invalid`);
    
    // For Gmail, we can do additional checks
    const verifiedResults = [];
    const failedResults = [];
    
    // Verify each email (with concurrency limit)
    const concurrency = 3;
    for (let i = 0; i < validFormat.length; i += concurrency) {
      const batch = validFormat.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (emailObj) => {
          // For Gmail, we can't reliably check if account exists without sending an email
          // So we'll mark all properly formatted Gmail addresses as valid
          // The actual existence will be determined when sending
          return {
            ...emailObj,
            verified: true,
            reason: 'Valid Gmail format'
          };
        })
      );
      verifiedResults.push(...batchResults);
      
      // Small delay between batches
      if (i + concurrency < validFormat.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    res.json({
      valid: verifiedResults,
      invalid: invalidFormat,
      total: emails.length,
      validCount: verifiedResults.length,
      invalidCount: invalidFormat.length
    });
    
  } catch (error) {
    console.error('[Verify Emails] Error:', error);
    res.status(500).json({ message: 'Server error verifying emails: ' + error.message });
  }
});

// =============================================
// FOLLOWING/USERS ROUTES - FIXED
// =============================================

// Get users that a user is following
router.get('/users/:username/following', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log(`[Following] Fetching following list for: ${username}`);
    
    const user = await User.findOne({ username }).select('following').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return the following array - ensure it's always an array
    const followingList = user.following || [];
    
    console.log(`[Following] User ${username} is following ${followingList.length} users`);
    
    res.json(followingList);
  } catch (error) {
    console.error('[Following] Error:', error);
    res.status(500).json({ message: 'Server error fetching following list: ' + error.message });
  }
});

// Get users that are following a user (followers)
router.get('/users/:username/followers', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log(`[Followers] Fetching followers list for: ${username}`);
    
    const user = await User.findOne({ username }).select('followers').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const followersList = user.followers || [];
    
    console.log(`[Followers] User ${username} has ${followersList.length} followers`);
    
    res.json(followersList);
  } catch (error) {
    console.error('[Followers] Error:', error);
    res.status(500).json({ message: 'Server error fetching followers list: ' + error.message });
  }
});

// Follow a user
router.post('/users/:username/follow', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const currentUsername = req.user.username;
    
    if (currentUsername === username) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    
    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentUser = await User.findOne({ username: currentUsername });
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }
    
    // Check if already following
    if (currentUser.following && currentUser.following.includes(username)) {
      return res.status(400).json({ message: 'Already following this user' });
    }
    
    // Add to following/followers
    if (!currentUser.following) currentUser.following = [];
    if (!targetUser.followers) targetUser.followers = [];
    
    currentUser.following.push(username);
    targetUser.followers.push(currentUsername);
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    // Send notification
    try {
      await sendNotificationToUser(
        targetUser.username,
        'New Follower!',
        `${currentUsername} started following you`,
        { type: 'new_follower', follower: currentUsername }
      );
    } catch (notifError) {
      console.log('[FCM] Follow notification failed (non-critical):', notifError);
    }
    
    res.json({ 
      message: `Successfully followed ${username}`,
      following: currentUser.following,
      followers: targetUser.followers
    });
  } catch (error) {
    console.error('[Follow] Error:', error);
    res.status(500).json({ message: 'Server error following user: ' + error.message });
  }
});

// Unfollow a user
router.post('/users/:username/unfollow', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const currentUsername = req.user.username;
    
    if (currentUsername === username) {
      return res.status(400).json({ message: 'Cannot unfollow yourself' });
    }
    
    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentUser = await User.findOne({ username: currentUsername });
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }
    
    // Remove from following/followers
    if (currentUser.following) {
      currentUser.following = currentUser.following.filter(f => f !== username);
    }
    if (targetUser.followers) {
      targetUser.followers = targetUser.followers.filter(f => f !== currentUsername);
    }
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    res.json({ 
      message: `Successfully unfollowed ${username}`,
      following: currentUser.following,
      followers: targetUser.followers
    });
  } catch (error) {
    console.error('[Unfollow] Error:', error);
    res.status(500).json({ message: 'Server error unfollowing user: ' + error.message });
  }
});

//back



// =============================================
// ADMIN: Get user subscriptions (incoming and outgoing)
// =============================================
router.get('/admin/users/:username/subscriptions', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log(`[Admin Subscriptions] Fetching subscriptions for user: ${username}`);
    
    // Find the user
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get incoming subscriptions (people who subscribed to this user)
    const incomingSubscriptions = await Subscription.find({
      targetUserId: username,
      status: 'active'
    }).lean();
    
    // Get subscribers list (usernames only)
    const subscribers = incomingSubscriptions.map(sub => ({
      username: sub.subscriberId,
      planCode: sub.planCode,
      amount: sub.amount,
      status: sub.status,
      createdAt: sub.createdAt,
      expiresAt: sub.expiresAt
    }));
    
    // Get outgoing subscriptions (who this user subscribed to)
    const outgoingSubscriptions = await Subscription.find({
      subscriberId: username,
      status: 'active'
    }).lean();
    
    // Calculate total earnings from subscriptions
    const totalEarnings = incomingSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);
    
    console.log(`[Admin Subscriptions] User ${username}: ${incomingSubscriptions.length} subscribers, ${outgoingSubscriptions.length} subscriptions, earnings: ${totalEarnings}`);
    
    res.json({
      subscriptions: incomingSubscriptions,
      subscribers: subscribers,
      outgoingSubscriptions: outgoingSubscriptions,
      totalEarnings: totalEarnings,
      subscriberCount: incomingSubscriptions.length,
      subscriptionCount: outgoingSubscriptions.length
    });
    
  } catch (error) {
    console.error('[Admin Subscriptions] Error:', error);
    res.status(500).json({ message: 'Server error fetching subscriptions: ' + error.message });
  }
});

// Alternative endpoint for subscriptions
router.get('/admin/users/:username/subscriptions-list', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log(`[Admin Subscriptions List] Fetching for: ${username}`);
    
    // Get all subscriptions where this user is the target (subscribers)
    const subscribers = await Subscription.find({
      targetUserId: username
    }).lean();
    
    // Get all subscriptions where this user is the subscriber
    const subscriptions = await Subscription.find({
      subscriberId: username
    }).lean();
    
    res.json({
      subscribers: subscribers.map(s => ({
        username: s.subscriberId,
        planCode: s.planCode,
        amount: s.amount,
        status: s.status,
        startDate: s.createdAt,
        expiryDate: s.expiresAt
      })),
      subscriptions: subscriptions.map(s => ({
        username: s.targetUserId,
        planCode: s.planCode,
        amount: s.amount,
        status: s.status,
        startDate: s.createdAt,
        expiryDate: s.expiresAt
      })),
      subscriberCount: subscribers.length,
      subscriptionCount: subscriptions.length,
      totalEarnings: subscribers.reduce((sum, s) => sum + (s.amount || 0), 0)
    });
    
  } catch (error) {
    console.error('[Admin Subscriptions List] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Admin stats endpoint - FIXED
// REPLACE your existing /admin/stats endpoint with this
router.get('/admin/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    console.log('[Admin Stats] Fetching dashboard statistics...');
    
    // Simple counts that won't fail
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: { $ne: false } });
    const pendingPayouts = await PayoutRequest.countDocuments({ status: 'pending' });
    const totalPosts = await Post.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });
    
    // Simple revenue calculation
    let totalRevenue = 0;
    try {
      const revenueResult = await Transaction.aggregate([
        { $match: { type: 'earning', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
    } catch (err) {
      console.error('[Admin Stats] Revenue calc error:', err);
    }
    
    // Subscription earnings
    let totalSubscriptionEarnings = 0;
    let totalSubscribers = 0;
    try {
      const subscriptions = await Subscription.find({ status: 'active' }).lean();
      totalSubscriptionEarnings = subscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      totalSubscribers = subscriptions.length;
    } catch (err) {
      console.error('[Admin Stats] Subscription error:', err);
    }
    
    const stats = {
      totalUsers,
      activeUsers,
      pendingPayouts,
      totalPosts,
      newUsersToday,
      totalRevenue,
      totalSubscriptionEarnings,
      totalSubscribers,
      timestamp: new Date().toISOString()
    };
    
    console.log('[Admin Stats] Returning:', stats);
    res.json(stats);
    
  } catch (error) {
    console.error('[Admin Stats] Fatal error:', error);
    // Return zeros instead of failing
    res.json({
      totalUsers: 0,
      activeUsers: 0,
      pendingPayouts: 0,
      totalPosts: 0,
      newUsersToday: 0,
      totalRevenue: 0,
      totalSubscriptionEarnings: 0,
      totalSubscribers: 0,
      error: error.message
    });
  }
});



// Add this to auth.js - DEBUG ENDPOINT
router.get('/admin/debug', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    // Check database connection
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    // Test database query
    let userCount = 0;
    let testUser = null;
    try {
      userCount = await User.countDocuments();
      testUser = await User.findOne().select('username email').lean();
    } catch (dbError) {
      console.error('[Debug] DB Query error:', dbError);
    }
    
    res.json({
      status: 'ok',
      database: {
        state: dbStates[dbState] || 'unknown',
        connected: dbState === 1,
        userCount: userCount,
        sampleUser: testUser
      },
      adminUser: {
        email: req.user.email,
        username: req.user.username,
        isAdmin: req.user.isAdmin
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Debug] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TEMPORARY DEBUG ENDPOINT - Remove after testing
router.get('/debug/users-count', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const sampleUsers = await User.find({}).limit(3).select('username email isAdmin').lean();
    
    res.json({
      userCount,
      sampleUsers,
      hasAdmin: sampleUsers.some(u => u.isAdmin === true),
      dbConnected: mongoose.connection.readyState === 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FIXED: Admin stats endpoint
router.get('/admin/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    console.log('[Admin Stats] Fetching dashboard statistics...');
    
    // Get counts safely with error handling
    let totalUsers = 0;
    let activeUsers = 0;
    let pendingPayouts = 0;
    let totalPosts = 0;
    let newUsersToday = 0;
    let totalRevenue = 0;
    
    try {
      totalUsers = await User.countDocuments() || 0;
      activeUsers = await User.countDocuments({ isActive: { $ne: false } }) || 0;
      pendingPayouts = await PayoutRequest.countDocuments({ status: 'pending' }) || 0;
      totalPosts = await Post.countDocuments() || 0;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      newUsersToday = await User.countDocuments({ createdAt: { $gte: today } }) || 0;
      
      // Calculate revenue
      const revenueResult = await Transaction.aggregate([
        { $match: { type: 'earning', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
      
    } catch (dbError) {
      console.error('[Admin Stats] DB query error:', dbError);
      // Continue with zeros
    }
    
    // Calculate subscription earnings
    let totalSubscriptionEarnings = 0;
    let totalSubscribers = 0;
    
    try {
      const subscriptions = await Subscription.find({ status: 'active' }).lean();
      totalSubscriptionEarnings = subscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      totalSubscribers = subscriptions.length;
    } catch (subError) {
      console.error('[Admin Stats] Subscription error:', subError);
    }
    
    const response = {
      totalUsers,
      activeUsers,
      pendingPayouts,
      totalPosts,
      newUsersToday,
      totalRevenue,
      totalSubscriptionEarnings,
      totalSubscribers,
      timestamp: new Date().toISOString()
    };
    
    console.log('[Admin Stats] Returning:', response);
    res.json(response);
    
  } catch (error) {
    console.error('[Admin Stats] Fatal error:', error);
    // Return default values instead of failing
    res.status(200).json({
      totalUsers: 0,
      activeUsers: 0,
      pendingPayouts: 0,
      totalPosts: 0,
      newUsersToday: 0,
      totalRevenue: 0,
      totalSubscriptionEarnings: 0,
      totalSubscribers: 0,
      error: error.message
    });
  }
});


// FIXED: Admin users endpoint with proper error handling
// REPLACE your existing /admin/users endpoint with this
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

    // Simple query - no complex aggregation
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments(query);

    // Simple enhancement without heavy aggregation
    const enhancedUsers = [];
    for (const user of users) {
      try {
        // Simple post count
        const postCount = await Post.countDocuments({ username: user.username });
        
        enhancedUsers.push({
          ...user,
          postCount: postCount || 0,
          subscriberCount: user.subscribers || 0,
          followerCount: user.followers ? user.followers.length : 0,
          totalEarnings: 0, // Skip complex aggregation for now
          userType: user.userType || 'content_creator',
          phoneNumber: user.phoneNumber || 'Not provided',
          bankName: user.bankName || 'Not provided',
          accountNumber: user.accountNumber || 'Not provided',
          email: user.email || 'Not provided',
          name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not provided',
          isActive: user.isActive !== false,
          isVerified: user.isVerified || false,
        });
      } catch (err) {
        console.error(`Error enhancing user ${user.username}:`, err);
        enhancedUsers.push({
          ...user,
          postCount: 0,
          subscriberCount: 0,
          followerCount: 0,
          totalEarnings: 0,
          userType: 'content_creator',
        });
      }
    }

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
    // Return empty array instead of 500
    res.status(200).json({
      users: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalUsers: 0,
        hasNext: false,
        hasPrev: false
      },
      error: error.message
    });
  }
});


// Add to auth.js
router.get('/debug/db-info', async (req, res) => {
  try {
    const dbName = mongoose.connection.name;
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    res.json({
      databaseName: dbName,
      connectionString: process.env.MONGO_URI ? 'Set (hidden)' : 'NOT SET',
      readyState: mongoose.connection.readyState,
      collections: collectionNames,
      userCount: await User.countDocuments(),
      postCount: await Post.countDocuments()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});






// =============================================
// GOOGLE OAUTH VERIFICATION ENDPOINT
// =============================================





// =============================================
// USERNAME/EMAIL CHECK ENDPOINTS
// =============================================

// Check username availability
router.get('/api/auth/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 3) {
      return res.json({ available: false, message: 'Username must be at least 3 characters' });
    }
    
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    }).lean();
    
    const available = !existingUser;
    
    res.json({
      available,
      message: available ? 'Username is available' : 'Username is already taken'
    });
  } catch (error) {
    console.error('[Check Username] Error:', error);
    res.status(500).json({ available: false, message: 'Error checking username' });
  }
});


// Check email availability
router.get('/api/auth/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
      return res.json({ available: false, message: 'Invalid email format' });
    }
    
    const existingUser = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    }).lean();
    
    const available = !existingUser;
    
    res.json({
      available,
      message: available ? 'Email is available' : 'Email is already registered'
    });
  } catch (error) {
    console.error('[Check Email] Error:', error);
    res.status(500).json({ available: false, message: 'Error checking email' });
  }
});


// ========== BOOST ROUTES ==========

// Create a boost for a post (Wallet or Card payment)
// =============================================
// BOOST ROUTES - MONGODB VERSION
// =============================================

// Create a boost for a post (Wallet or Card payment)
// =============================================
// BOOST ROUTES - MONGODB VERSION (FIXED)
// =============================================

// Create a boost for a post
router.post('/boosts/create', authenticateToken, async (req, res) => {
  try {
    const { 
      postId, 
      durationDays, 
      targetAudience, 
      price, 
      paymentMethod, 
      reference, 
      paymentGateway 
    } = req.body;
    
    const userId = req.user._id;
    const username = req.user.username;

    console.log('[Boost] Create request:', { postId, durationDays, targetAudience, price, paymentMethod, username });
    
    // Validate post ownership
    let post = null;
    let postIdNumber = Number(postId);
    
    // Try to find as number first
    if (!isNaN(postIdNumber)) {
      post = await Post.findOne({ id: postIdNumber }).lean();
    }
    
    // Try as string if not found
    if (!post) {
      post = await Post.findOne({ id: postId }).lean();
    }
    
    // Try by _id
    if (!post && mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId).lean();
    }
    
    // If not found in posts collection, search in user's posts
    let isOwner = false;
    if (!post) {
      const userDoc = await User.findOne({ username }).select('posts').lean();
      if (userDoc && userDoc.posts) {
        const userPost = userDoc.posts.find(p => 
          p.id === postIdNumber || p.id?.toString() === postId
        );
        if (userPost) {
          isOwner = true;
          post = userPost;
        }
      }
    } else {
      isOwner = post.username === username;
    }
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }
    
    if (!isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only boost your own posts' 
      });
    }
    
    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    // Check if post is already boosted
    const existingBoost = await Boost.findOne({
      postId: post.id || post._id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    
    if (existingBoost) {
      return res.status(400).json({
        success: false,
        message: 'This post is already boosted'
      });
    }
    
    // Process payment deduction for wallet payments
    if (paymentMethod === 'wallet') {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      const currentBalance = user.balance || 0;
      
      if (currentBalance < price) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Need ₦${price} but have ₦${currentBalance}`
        });
      }
      
      // Deduct from wallet
      user.balance = currentBalance - price;
      await user.save();
      
      // Create transaction record
      const transaction = new Transaction({
        id: crypto.randomBytes(16).toString('hex'),
        userId: username,
        type: 'wallet_deduction',
        amount: price,
        description: `Boost post for ${durationDays} days`,
        status: 'completed',
        createdAt: new Date(),
        relatedId: `BOOST_${Date.now()}`
      });
      await transaction.save();
    }
    
    // Calculate boost priority
    const boostPriority = durationDays === 1 ? 100 : durationDays === 7 ? 70 : durationDays === 30 ? 50 : 30;
    
    // Create boost record
    const boost = new Boost({
      id: crypto.randomBytes(16).toString('hex'),
      postId: post.id || post._id,
      userId: userId,
      username: username,
      durationDays: durationDays,
      targetAudience: targetAudience,
      price: price,
      paymentMethod: paymentMethod,
      paymentGateway: paymentGateway || null,
      transactionReference: reference || null,
      status: 'active',
      createdAt: new Date(),
      expiresAt: expiresAt,
      priority: boostPriority
    });
    
    await boost.save();
    
    // Update post with boost flag
    const updateData = { 
      isBoosted: true, 
      boostExpiresAt: expiresAt,
      boostPriority: boostPriority
    };
    
    // Try to update in posts collection
    const updateResult = await Post.updateOne(
      { $or: [{ id: Number(postId) }, { id: postId }] },
      { $set: updateData }
    );
    
    // Also update in user's posts array
    const userDoc = await User.findOne({ username });
    if (userDoc && userDoc.posts) {
      const postIndex = userDoc.posts.findIndex(p => 
        p.id === Number(postId) || p.id?.toString() === postId
      );
      if (postIndex !== -1) {
        userDoc.posts[postIndex].isBoosted = true;
        userDoc.posts[postIndex].boostExpiresAt = expiresAt;
        userDoc.posts[postIndex].boostPriority = boostPriority;
        await userDoc.save();
      }
    }
    
    console.log('[Boost] Created successfully:', boost.id);
    
    res.json({
      success: true,
      message: `Post boosted for ${durationDays} days`,
      boost: {
        id: boost.id,
        postId: boost.postId,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        expiresAt: boost.expiresAt,
        status: boost.status
      }
    });
    
  } catch (error) {
    console.error('[Boost] Create error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create boost: ' + error.message
    });
  }
});

// Get active boosts for current user
router.get('/boosts/active', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const username = req.user.username;
    
    const boosts = await Boost.find({
      $or: [
        { userId: userId },
        { username: username }
      ],
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ expiresAt: 1 });
    
    const boostsWithDetails = await Promise.all(boosts.map(async (boost) => {
      let post = await Post.findOne({ 
        $or: [
          { id: Number(boost.postId) },
          { id: boost.postId },
          { _id: boost.postId }
        ]
      }).lean();
      
      if (!post) {
        const user = await User.findOne({ username }).select('posts').lean();
        if (user && user.posts) {
          post = user.posts.find(p => 
            p.id === Number(boost.postId) || p.id?.toString() === boost.postId
          );
        }
      }
      
      const now = new Date();
      const expiresAt = new Date(boost.expiresAt);
      const createdAt = new Date(boost.createdAt);
      const totalDuration = expiresAt - createdAt;
      const remaining = expiresAt - now;
      const remainingPercent = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
      
      return {
        id: boost.id,
        postId: boost.postId,
        postText: post?.text || '',
        images: post?.images || [],
        videos: post?.videos || [],
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        price: boost.price,
        paymentMethod: boost.paymentMethod,
        expiresAt: boost.expiresAt,
        remainingPercent: Math.round(remainingPercent),
        status: boost.status
      };
    }));
    
    res.json({ success: true, boosts: boostsWithDetails });
    
  } catch (error) {
    console.error('[Boost] Get active error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch boosts' });
  }
});

// Get boost history for current user
router.get('/boosts/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const username = req.user.username;
    
    const boosts = await Boost.find({
      $or: [
        { userId: userId },
        { username: username }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50);
    
    const history = boosts.map(boost => ({
      id: boost.id,
      postId: boost.postId,
      durationDays: boost.durationDays,
      targetAudience: boost.targetAudience,
      price: boost.price,
      status: boost.status,
      createdAt: boost.createdAt,
      expiresAt: boost.expiresAt
    }));
    
    res.json({ success: true, history });
    
  } catch (error) {
    console.error('[Boost] History error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

// Check if a specific post is boosted
router.get('/boosts/check/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    
    const boost = await Boost.findOne({
      postId: postId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    
    res.json({
      success: true,
      isBoosted: !!boost,
      boostInfo: boost || null
    });
    
  } catch (error) {
    console.error('[Boost] Check error:', error);
    res.status(500).json({ success: false, message: 'Failed to check boost status' });
  }
});

// Expire old boosts (scheduled job endpoint)
router.post('/boosts/expire', async (req, res) => {
  try {
    const expiredBoosts = await Boost.find({
      status: 'active',
      expiresAt: { $lt: new Date() }
    });
    
    if (expiredBoosts.length === 0) {
      return res.json({ success: true, message: 'No expired boosts found', expiredCount: 0 });
    }
    
    await Boost.updateMany(
      { status: 'active', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired' } }
    );
    
    const uniquePostIds = [...new Set(expiredBoosts.map(b => b.postId))];
    
    for (const postId of uniquePostIds) {
      const remainingBoosts = await Boost.findOne({
        postId: postId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      });
      
      if (!remainingBoosts) {
        await Post.updateOne(
          { $or: [{ id: Number(postId) }, { id: postId }, { _id: postId }] },
          { $set: { isBoosted: false, boostExpiresAt: null, boostPriority: 0 } }
        );
        
        await User.updateMany(
          { 'posts.id': Number(postId) },
          { 
            $set: { 
              'posts.$.isBoosted': false,
              'posts.$.boostExpiresAt': null,
              'posts.$.boostPriority': 0
            } 
          }
        );
      }
    }
    
    res.json({ 
      success: true, 
      message: `Expired ${expiredBoosts.length} boosts`,
      expiredCount: expiredBoosts.length
    });
    
  } catch (error) {
    console.error('[Boost] Expire error:', error);
    res.status(500).json({ success: false, message: 'Failed to expire boosts' });
  }
});

// Get wallet balance endpoint
// Debug endpoint - Add this near your other debug routes
router.get('/debug/boost-test', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    
    // Test 1: Find a post by the user
    const userPosts = await Post.find({ username }).limit(5).lean();
    
    // Test 2: Try to create a test boost
    let testBoost = null;
    let testBoostError = null;
    
    if (userPosts.length > 0) {
      const testPost = userPosts[0];
      try {
        testBoost = new Boost({
          id: crypto.randomBytes(16).toString('hex'),
          postId: testPost.id.toString(),
          userId: req.user._id,
          username: username,
          durationDays: 1,
          targetAudience: 'global',
          price: 100,
          paymentMethod: 'test',
          status: 'expired',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() - 86400000) // already expired
        });
        await testBoost.save();
        console.log('[Debug] Test boost created successfully');
      } catch (err) {
        testBoostError = err.message;
        console.error('[Debug] Test boost creation failed:', err);
      }
    }
    
    res.json({
      user: username,
      userPostsCount: userPosts.length,
      samplePost: userPosts[0] ? {
        id: userPosts[0].id,
        title: userPosts[0].text?.substring(0, 50)
      } : null,
      testBoostCreated: !!testBoost,
      testBoostError,
      boostModelExists: typeof Boost !== 'undefined'
    });
    
  } catch (error) {
    console.error('[Debug] Boost test error:', error);
    res.status(500).json({ error: error.message });
  }
});


// =============================================
// ADMIN BOOST MANAGEMENT ROUTES
// =============================================

// Admin: Get all boosts (active and expired)
// =============================================
// FIXED ADMIN BOOSTS ENDPOINT - HANDLES NO BOOSTS
// =============================================

router.get('/admin/boosts/all', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Get boosts with error handling
    let boosts = [];
    let totalBoosts = 0;
    
    try {
      boosts = await Boost.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      totalBoosts = await Boost.countDocuments(query);
    } catch (boostError) {
      console.log('[Admin Boosts] No boosts found or collection empty:', boostError.message);
      // Return empty arrays if no boosts exist
      return res.json({
        boosts: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 1,
          totalBoosts: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }
    
    // Enhance boosts with post preview data
    const enhancedBoosts = await Promise.all(boosts.map(async (boost) => {
      let post = null;
      try {
        post = await Post.findOne({ 
          $or: [
            { id: Number(boost.postId) },
            { id: boost.postId },
            { _id: boost.postId }
          ]
        }).lean();
      } catch (postError) {
        console.log(`[Admin Boosts] Could not find post for boost ${boost.id}`);
      }
      
      const now = new Date();
      const expiresAt = new Date(boost.expiresAt);
      const createdAt = new Date(boost.createdAt);
      const totalDuration = expiresAt - createdAt;
      const remaining = expiresAt - now;
      const remainingPercent = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
      
      return {
        id: boost.id,
        postId: boost.postId,
        username: boost.username,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        price: boost.price || 0,
        paymentMethod: boost.paymentMethod || 'unknown',
        status: boost.status,
        createdAt: boost.createdAt,
        expiresAt: boost.expiresAt,
        remainingPercent: Math.round(remainingPercent),
        daysRemaining: Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24))),
        postPreview: post ? {
          id: post.id,
          text: post.text?.substring(0, 100) || '',
          images: post.images || [],
          videos: post.videos || []
        } : null
      };
    }));
    
    console.log(`[Admin Boosts] Found ${enhancedBoosts.length} boosts, total: ${totalBoosts}`);
    
    res.json({
      boosts: enhancedBoosts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(totalBoosts / limitNum)),
        totalBoosts,
        hasNext: pageNum < Math.ceil(totalBoosts / limitNum),
        hasPrev: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error('[Admin Boosts] Error:', error);
    // Return empty array instead of 500 error
    res.json({
      boosts: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalBoosts: 0,
        hasNext: false,
        hasPrev: false
      },
      error: error.message
    });
  }
});

// Admin: Get user's boosts
router.get('/admin/users/:username/boosts', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    const boosts = await Boost.find({ username })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ boosts });
    
  } catch (error) {
    console.error('[Admin User Boosts] Error:', error);
    res.status(500).json({ message: 'Server error fetching user boosts: ' + error.message });
  }
});

// Admin: Boost any post (for any user)
router.post('/admin/boosts/create', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { 
      postId, 
      username, 
      durationDays, 
      targetAudience, 
      price, 
      paymentMethod 
    } = req.body;
    
    console.log('[Admin Boost] Creating boost:', { postId, username, durationDays, targetAudience });
    
    // Validate required fields
    if (!postId || !username || !durationDays || !targetAudience) {
      return res.status(400).json({ 
        success: false, 
        message: 'Post ID, username, duration, and target audience are required' 
      });
    }
    
    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Find the post
    let post = null;
    let postIdNumber = Number(postId);
    
    // Try to find as number
    if (!isNaN(postIdNumber)) {
      post = await Post.findOne({ id: postIdNumber }).lean();
    }
    
    // Try as string
    if (!post) {
      post = await Post.findOne({ id: postId }).lean();
    }
    
    // Try by _id
    if (!post && mongoose.Types.ObjectId.isValid(postId)) {
      post = await Post.findById(postId).lean();
    }
    
    // Search in user's posts if not found
    if (!post) {
      const userDoc = await User.findOne({ username }).select('posts').lean();
      if (userDoc && userDoc.posts) {
        post = userDoc.posts.find(p => 
          p.id === postIdNumber || p.id?.toString() === postId
        );
        if (post) {
          post.username = username;
        }
      }
    }
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    // Check if post is already boosted
    const existingBoost = await Boost.findOne({
      postId: post.id || post._id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    
    if (existingBoost) {
      return res.status(400).json({
        success: false,
        message: 'This post is already boosted'
      });
    }
    
    // Calculate boost priority
    const boostPriority = durationDays === 1 ? 100 : durationDays === 7 ? 70 : durationDays === 30 ? 50 : 30;
    
    // Create boost record (admin boost is free, price = 0)
    const boost = new Boost({
      id: crypto.randomBytes(16).toString('hex'),
      postId: post.id || post._id,
      userId: user._id,
      username: username,
      durationDays: durationDays,
      targetAudience: targetAudience,
      price: price || 0, // Admin boosts can be free or custom price
      paymentMethod: paymentMethod || 'admin',
      paymentGateway: 'admin',
      transactionReference: `ADMIN_BOOST_${Date.now()}`,
      status: 'active',
      createdAt: new Date(),
      expiresAt: expiresAt,
      priority: boostPriority
    });
    
    await boost.save();
    
    // Update post with boost flag
    const updateData = { 
      isBoosted: true, 
      boostExpiresAt: expiresAt,
      boostPriority: boostPriority
    };
    
    // Try to update in posts collection
    await Post.updateOne(
      { $or: [{ id: Number(postId) }, { id: postId }, { _id: postId }] },
      { $set: updateData }
    );
    
    // Also update in user's posts array
    const userDoc = await User.findOne({ username });
    if (userDoc && userDoc.posts) {
      const postIndex = userDoc.posts.findIndex(p => 
        p.id === Number(postId) || p.id?.toString() === postId
      );
      if (postIndex !== -1) {
        userDoc.posts[postIndex].isBoosted = true;
        userDoc.posts[postIndex].boostExpiresAt = expiresAt;
        userDoc.posts[postIndex].boostPriority = boostPriority;
        await userDoc.save();
      }
    }
    
    console.log('[Admin Boost] Created successfully:', boost.id);
    
    // Send notification to user
    try {
      await sendNotificationToUser(
        username,
        'Your Post Has Been Boosted!',
        `An admin has boosted your post for ${durationDays} days! Your post will get extra visibility.`,
        { type: 'admin_boost', postId: postId, durationDays: durationDays.toString() }
      );
    } catch (notifError) {
      console.log('[Admin Boost] Notification failed (non-critical):', notifError);
    }
    
    res.json({
      success: true,
      message: `Post boosted for ${durationDays} days`,
      boost: {
        id: boost.id,
        postId: boost.postId,
        username: boost.username,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        expiresAt: boost.expiresAt,
        status: boost.status
      }
    });
    
  } catch (error) {
    console.error('[Admin Boost Create] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create boost: ' + error.message 
    });
  }
});

// Admin: Remove boost (unboost)
router.post('/admin/boosts/:boostId/unboost', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { boostId } = req.params;
    
    console.log('[Admin Unboost] Removing boost:', boostId);
    
    const boost = await Boost.findOne({ id: boostId });
    if (!boost) {
      return res.status(404).json({ success: false, message: 'Boost not found' });
    }
    
    // Update boost status to cancelled
    boost.status = 'cancelled';
    boost.cancelledAt = new Date();
    await boost.save();
    
    // Check if there are any other active boosts for this post
    const remainingBoosts = await Boost.findOne({
      postId: boost.postId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    
    if (!remainingBoosts) {
      // Remove boost flags from post
      await Post.updateOne(
        { 
          $or: [
            { id: Number(boost.postId) },
            { id: boost.postId },
            { _id: boost.postId }
          ]
        },
        { $set: { isBoosted: false, boostExpiresAt: null, boostPriority: 0 } }
      );
      
      // Also update in user's posts array
      const userDoc = await User.findOne({ username: boost.username });
      if (userDoc && userDoc.posts) {
        const postIndex = userDoc.posts.findIndex(p => 
          p.id === Number(boost.postId) || p.id?.toString() === boost.postId
        );
        if (postIndex !== -1) {
          userDoc.posts[postIndex].isBoosted = false;
          userDoc.posts[postIndex].boostExpiresAt = null;
          userDoc.posts[postIndex].boostPriority = 0;
          await userDoc.save();
        }
      }
    }
    
    // Send notification to user
    try {
      await sendNotificationToUser(
        boost.username,
        'Your Post Boost Has Been Removed',
        'An admin has removed the boost from your post.',
        { type: 'admin_unboost', postId: boost.postId }
      );
    } catch (notifError) {
      console.log('[Admin Unboost] Notification failed (non-critical):', notifError);
    }
    
    res.json({
      success: true,
      message: 'Boost removed successfully',
      boost: {
        id: boost.id,
        postId: boost.postId,
        username: boost.username,
        status: boost.status
      }
    });
    
  } catch (error) {
    console.error('[Admin Unboost] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove boost: ' + error.message 
    });
  }
});

// Admin: Get boost statistics
router.get('/admin/boosts/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const activeBoosts = await Boost.countDocuments({ status: 'active', expiresAt: { $gt: new Date() } });
    const totalBoosts = await Boost.countDocuments();
    const expiredBoosts = await Boost.countDocuments({ status: 'expired' });
    const cancelledBoosts = await Boost.countDocuments({ status: 'cancelled' });
    
    const totalRevenue = await Boost.aggregate([
      { $match: { paymentMethod: { $ne: 'admin' }, price: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    
    // Boosts by duration
    const boostsByDuration = await Boost.aggregate([
      { $group: { _id: '$durationDays', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Boosts by user
    const boostsByUser = await Boost.aggregate([
      { $group: { _id: '$username', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      activeBoosts,
      totalBoosts,
      expiredBoosts,
      cancelledBoosts,
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
      boostsByDuration,
      boostsByUser
    });
    
  } catch (error) {
    console.error('[Admin Boost Stats] Error:', error);
    res.status(500).json({ message: 'Server error fetching boost stats: ' + error.message });
  }
});

// =============================================
// ADMIN: ADD MONEY TO USER BALANCE
// =============================================

router.post('/admin/users/:username/add-funds', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { amount, reason = 'Admin adjustment' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    console.log(`[Admin Add Funds] Adding ₦${amount} to user: ${username}`);
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add to balance
    const oldBalance = user.balance || 0;
    user.balance = oldBalance + amount;
    await user.save();
    
    // Create transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: 'topup',
      amount: amount,
      description: `Admin funding: ${reason}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: `ADMIN_${Date.now()}`
    });
    await transaction.save();
    
    // Send notification to user
    try {
      await sendNotificationToUser(
        user.username,
        '💰 Funds Added to Your Wallet!',
        `₦${amount.toLocaleString()} has been added to your wallet by admin. New balance: ₦${user.balance.toLocaleString()}`,
        { type: 'admin_funding', amount: amount.toString(), newBalance: user.balance.toString() }
      );
    } catch (notifError) {
      console.log('[Admin Add Funds] Notification failed (non-critical):', notifError);
    }
    
    console.log(`[Admin Add Funds] Success: ${username} balance: ${oldBalance} -> ${user.balance}`);
    
    res.json({
      success: true,
      message: `Successfully added ₦${amount.toLocaleString()} to ${username}'s wallet`,
      user: {
        username: user.username,
        oldBalance,
        newBalance: user.balance,
        amountAdded: amount
      }
    });
    
  } catch (error) {
    console.error('[Admin Add Funds] Error:', error);
    res.status(500).json({ message: 'Server error adding funds: ' + error.message });
  }
});

// =============================================
// ADMIN: GET SINGLE USER DETAILS (with balance)
// =============================================

router.get('/admin/users/:username/detail', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's boost history
    const boosts = await Boost.find({ username }).sort({ createdAt: -1 }).limit(20).lean();
    
    // Get user's active boosts
    const activeBoosts = await Boost.find({
      username,
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).lean();
    
    // Get user's subscription stats
    const subscribers = await Subscription.countDocuments({ targetUserId: username, status: 'active' });
    const subscriptions = await Subscription.countDocuments({ subscriberId: username, status: 'active' });
    
    // Get transaction history
    const transactions = await Transaction.find({ userId: username })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    // Calculate total earnings
    const earnings = await Transaction.aggregate([
      { $match: { userId: username, type: 'earning', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    res.json({
      user: {
        _id: user._id,
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        bankName: user.bankName,
        accountNumber: user.accountNumber,
        balance: user.balance || 0,
        userType: user.userType || 'content_creator',
        isAdmin: user.isAdmin || false,
        isVerified: user.isVerified || false,
        createdAt: user.createdAt,
        bio: user.bio || '',
        location: user.location || '',
        city: user.city || '',
        country: user.country || '',
        state: user.state || '',
        profilePicture: user.profilePicture,
        followers: user.followers ? user.followers.length : 0,
        following: user.following ? user.following.length : 0,
        subscribers: user.subscribers || 0,
        premiumPricing: user.premiumPricing
      },
      stats: {
        totalEarnings: earnings.length > 0 ? earnings[0].total : 0,
        activeBoosts: activeBoosts.length,
        totalBoosts: boosts.length,
        subscriberCount: subscribers,
        subscriptionCount: subscriptions
      },
      recentBoosts: boosts.slice(0, 10),
      recentTransactions: transactions
    });
    
  } catch (error) {
    console.error('[Admin User Detail] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// FAST ADMIN USERS ENDPOINT - SINGLE QUERY
// Add this to auth.js right after your other admin routes
// =============================================

router.get('/admin/users/fast', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 100, search = '' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    // Build search query
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

    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalUsers = await User.countDocuments(query);

    // Get ALL subscriptions in ONE query
    const allUsernames = users.map(u => u.username);
    
    // Get incoming subscriptions (subscriptions TO these users)
    const incomingSubs = await Subscription.find({
      targetUserId: { $in: allUsernames },
      status: 'active'
    }).lean();

    // Get outgoing subscriptions (subscriptions BY these users)
    const outgoingSubs = await Subscription.find({
      subscriberId: { $in: allUsernames },
      status: 'active'
    }).lean();

    // Create maps for fast lookup
    const incomingSubsMap = {};
    const outgoingSubsMap = {};
    
    incomingSubs.forEach(sub => {
      if (!incomingSubsMap[sub.targetUserId]) {
        incomingSubsMap[sub.targetUserId] = [];
      }
      incomingSubsMap[sub.targetUserId].push(sub);
    });
    
    outgoingSubs.forEach(sub => {
      if (!outgoingSubsMap[sub.subscriberId]) {
        outgoingSubsMap[sub.subscriberId] = [];
      }
      outgoingSubsMap[sub.subscriberId].push(sub);
    });

    // Get post counts in one query
    const postCounts = await Post.aggregate([
      { $match: { username: { $in: allUsernames } } },
      { $group: { _id: '$username', count: { $sum: 1 } } }
    ]);
    
    const postCountMap = {};
    postCounts.forEach(pc => {
      postCountMap[pc._id] = pc.count;
    });

    // Build enhanced users
    const enhancedUsers = users.map(user => {
      const userIncomingSubs = incomingSubsMap[user.username] || [];
      const totalEarnings = userIncomingSubs.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      
      return {
        ...user,
        postCount: postCountMap[user.username] || 0,
        subscriberCount: userIncomingSubs.length,
        subscriptionCount: (outgoingSubsMap[user.username] || []).length,
        totalEarnings: totalEarnings,
        incomingSubscriptions: userIncomingSubs,
        outgoingSubscriptions: outgoingSubsMap[user.username] || [],
        userType: user.userType || 'content_creator',
        phoneNumber: user.phoneNumber || 'Not provided',
        bankName: user.bankName || 'Not provided',
        accountNumber: user.accountNumber || 'Not provided',
        email: user.email || 'Not provided',
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Not provided',
        isActive: user.isActive !== false,
        isVerified: user.isVerified || false,
      };
    });

    console.log(`[Fast Admin Users] Returned ${enhancedUsers.length} users (total: ${totalUsers})`);
    
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
    console.error('[Fast Admin Users] Error:', error);
    res.status(500).json({ 
      users: [], 
      pagination: { currentPage: 1, totalPages: 1, totalUsers: 0, hasNext: false, hasPrev: false },
      error: error.message 
    });
  }
});


// =============================================
// FAST ADMIN DASHBOARD STATS - SINGLE QUERY
// =============================================

router.get('/admin/stats/fast', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    console.log('[Fast Stats] Fetching dashboard statistics...');
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Run all queries in parallel for maximum speed
    const [
      totalUsers,
      activeUsers,
      pendingPayouts,
      totalPosts,
      newUsersToday,
      newUsersThisMonth,
      totalRevenue,
      totalSubscriptionEarnings,
      totalSubscribers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: { $ne: false } }),
      PayoutRequest.countDocuments({ status: 'pending' }),
      Post.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      Transaction.aggregate([
        { $match: { type: 'earning', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(r => r.length > 0 ? r[0].total : 0),
      Subscription.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(r => r.length > 0 ? r[0].total : 0),
      Subscription.countDocuments({ status: 'active' })
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      pendingPayouts,
      totalPosts,
      newUsersToday,
      newUsersThisMonth,
      totalRevenue,
      totalSubscriptionEarnings,
      totalSubscribers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Fast Stats] Error:', error);
    res.json({
      totalUsers: 0,
      activeUsers: 0,
      pendingPayouts: 0,
      totalPosts: 0,
      newUsersToday: 0,
      newUsersThisMonth: 0,
      totalRevenue: 0,
      totalSubscriptionEarnings: 0,
      totalSubscribers: 0,
      error: error.message
    });
  }
});



// =============================================
// ADMIN: UPDATE USER
// =============================================

router.put('/admin/users/:username', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const updateData = req.body;
    
    console.log(`[Admin Update User] Updating user: ${username}`);
    console.log('[Admin Update User] Update data:', updateData);
    
    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update allowed fields (prevent updating sensitive fields like password, _id)
    const allowedFields = [
      'email', 'name', 'firstName', 'lastName', 'bio', 'location', 'city', 
      'country', 'state', 'phoneNumber', 'bankName', 'accountNumber', 'balance',
      'userType', 'isVerified', 'isActive', 'numbersVisibility'
    ];
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        if (field === 'balance') {
          user[field] = Number(updateData[field]) || 0;
        } else {
          user[field] = updateData[field];
        }
      }
    }
    
    // Handle profile picture separately
    if (updateData.profilePicture !== undefined) {
      user.profilePicture = updateData.profilePicture;
    }
    
    // Save the user
    await user.save();
    
    // Return the updated user (without password)
    const updatedUser = user.toObject();
    delete updatedUser.password;
    
    console.log(`[Admin Update User] Successfully updated user: ${username}`);
    
    res.json(updatedUser);
    
  } catch (error) {
    console.error('[Admin Update User] Error:', error);
    res.status(500).json({ message: 'Server error updating user: ' + error.message });
  }
});





// =============================================
// WALLET BALANCE ENDPOINT
// =============================================

// Get wallet balance for current user
router.get('/api/auth/wallet/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('balance username').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      balance: user.balance || 0,
      currency: 'NGN',
      username: user.username
    });
  } catch (error) {
    console.error('[Wallet Balance] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch wallet balance: ' + error.message 
    });
  }
});

// =============================================
// ACTIVE BOOSTS ENDPOINT (FIXED VERSION)
// =============================================

// Get active boosts for current user
router.get('/api/auth/boosts/active', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const username = req.user.username;
    
    console.log('[Active Boosts] Fetching for user:', username);
    
    // Find active boosts that haven't expired
    const boosts = await Boost.find({
      $or: [
        { userId: userId },
        { username: username }
      ],
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ expiresAt: 1 }).lean();
    
    console.log('[Active Boosts] Found:', boosts.length);
    
    // Enhance boosts with post preview and remaining days
    const boostsWithDetails = await Promise.all(boosts.map(async (boost) => {
      // Try to find the post
      let post = null;
      try {
        post = await Post.findOne({ 
          $or: [
            { id: Number(boost.postId) },
            { id: boost.postId },
            { _id: boost.postId }
          ]
        }).lean();
      } catch (postError) {
        console.log('[Active Boosts] Post lookup error:', postError.message);
      }
      
      // If not found in posts collection, try user's posts
      if (!post) {
        const user = await User.findOne({ username }).select('posts').lean();
        if (user && user.posts) {
          post = user.posts.find(p => 
            p.id === Number(boost.postId) || p.id?.toString() === boost.postId
          );
        }
      }
      
      // Calculate remaining days and percentage
      const now = new Date();
      const expiresAt = new Date(boost.expiresAt);
      const createdAt = new Date(boost.createdAt);
      const totalDuration = expiresAt - createdAt;
      const remaining = expiresAt - now;
      const daysRemaining = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
      const remainingPercent = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
      
      return {
        id: boost.id,
        postId: boost.postId,
        postPreview: post ? {
          id: post.id,
          text: post.text?.substring(0, 100) || '',
          images: post.images || [],
          videos: post.videos || []
        } : null,
        durationDays: boost.durationDays,
        targetAudience: boost.targetAudience,
        price: boost.price,
        paymentMethod: boost.paymentMethod,
        createdAt: boost.createdAt,
        expiresAt: boost.expiresAt,
        daysRemaining: daysRemaining,
        remainingPercent: Math.round(remainingPercent),
        priority: boost.priority || 0,
        status: boost.status
      };
    }));
    
    res.json({ 
      success: true, 
      boosts: boostsWithDetails,
      activeCount: boostsWithDetails.length
    });
    
  } catch (error) {
    console.error('[Active Boosts] Error:', error);
    // Return empty array instead of 500 error
    res.status(200).json({ 
      success: true, 
      boosts: [], 
      activeCount: 0,
      message: 'No active boosts found'
    });
  }
});

// =============================================
// BOOST HISTORY ENDPOINT
// =============================================

router.get('/api/auth/boosts/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const username = req.user.username;
    
    console.log('[Boost History] Fetching for user:', username);
    
    const boosts = await Boost.find({
      $or: [
        { userId: userId },
        { username: username }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
    
    const history = boosts.map(boost => ({
      id: boost.id,
      postId: boost.postId,
      durationDays: boost.durationDays,
      targetAudience: boost.targetAudience,
      price: boost.price,
      status: boost.status,
      createdAt: boost.createdAt,
      expiresAt: boost.expiresAt
    }));
    
    res.json({ success: true, history });
    
  } catch (error) {
    console.error('[Boost History] Error:', error);
    res.status(200).json({ success: true, history: [] });
  }
});


// =============================================
// FORGOT PASSWORD & RESET PASSWORD ROUTES
// =============================================

// Generate a random reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Forgot Password - Send reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    console.log('[Forgot Password] Request for email:', email);
    
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // For security, don't reveal if email exists or not
      console.log('[Forgot Password] No user found for email:', email);
      return res.json({ 
        message: 'If an account exists with that email, you will receive a password reset link.' 
      });
    }
    
    // Generate reset token
    const resetToken = generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    
    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();
    
    // Construct reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
    
    // Wait for email initialization if not ready
    if (!isEmailInitialized) {
      console.log('[Forgot Password] Email not initialized, attempting to initialize...');
      try {
        await initializeEmailTransporter();
      } catch (error) {
        console.error('[Forgot Password] Failed to initialize email:', error);
        // Still return success for security
        return res.json({ 
          message: 'If an account exists with that email, you will receive a password reset link.' 
        });
      }
    }
    
    if (!emailTransporter || !isEmailInitialized) {
      console.error('[Forgot Password] Email transporter not available');
      return res.json({ 
        message: 'If an account exists with that email, you will receive a password reset link.' 
      });
    }
    
    // Email content
    const mailOptions = {
      from: {
        name: '6tyNine Password Reset',
        address: GMAIL_CONFIG.user
      },
      to: user.email,
      subject: 'Reset Your 6tyNine Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: linear-gradient(135deg, #FF6B00, #FF8C00); color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; }
                .content { padding: 30px; }
                .button { display: inline-block; background: #FF6B00; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; background: #fafafa; }
                .warning { background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #856404; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Reset Your Password</h1>
                </div>
                <div class="content">
                    <p>Hello <strong>${user.name || user.username}</strong>,</p>
                    <p>We received a request to reset your password for your 6tyNine account.</p>
                    <div style="text-align: center;">
                        <a href="${resetUrl}" class="button">Reset Password</a>
                    </div>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; font-size: 12px; color: #666;">${resetUrl}</p>
                    <div class="warning">
                        <strong>⚠️ This link will expire in 1 hour.</strong><br>
                        If you didn't request this, please ignore this email and your password will remain unchanged.
                    </div>
                    <hr>
                    <p style="font-size: 14px; color: #666;">
                        For security, this link can only be used once. If you need to reset your password again, please submit a new request.
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} 6tyNine. All rights reserved.</p>
                    <p>Questions? Contact us at support@6tynine.com</p>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `Reset Your 6tyNine Password\n\nHello ${user.name || user.username},\n\nWe received a request to reset your password.\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\n- 6tyNine Team`
    };
    
    console.log('[Forgot Password] Sending reset email to:', user.email);
    
    await emailTransporter.sendMail(mailOptions);
    
    console.log('[Forgot Password] Reset email sent successfully to:', user.email);
    
    res.json({ 
      message: 'If an account exists with that email, you will receive a password reset link.' 
    });
    
  } catch (error) {
    console.error('[Forgot Password] Error:', error);
    // Always return the same message for security
    res.json({ 
      message: 'If an account exists with that email, you will receive a password reset link.' 
    });
  }
});

// Reset Password - Verify token and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    
    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: 'Token, email, and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    console.log('[Reset Password] Attempting to reset password for email:', email);
    
    // Find user with valid reset token
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token. Please request a new password reset.' 
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save();
    
    console.log('[Reset Password] Password reset successful for:', user.email);
    
    // Send confirmation email
    if (isEmailInitialized && emailTransporter) {
      try {
        const confirmationMail = {
          from: {
            name: '6tyNine Security',
            address: GMAIL_CONFIG.user
          },
          to: user.email,
          subject: 'Your Password Has Been Reset',
          html: `
            <h2>Password Reset Confirmation</h2>
            <p>Hello ${user.name || user.username},</p>
            <p>Your 6tyNine account password has been successfully reset.</p>
            <p>If you did not perform this action, please contact support immediately.</p>
            <hr>
            <p>Best regards,<br>6tyNine Team</p>
          `,
          text: `Password Reset Confirmation\n\nHello ${user.name || user.username},\n\nYour 6tyNine account password has been successfully reset.\n\nIf you did not perform this action, please contact support immediately.\n\n- 6tyNine Team`
        };
        await emailTransporter.sendMail(confirmationMail);
        console.log('[Reset Password] Confirmation email sent to:', user.email);
      } catch (emailError) {
        console.error('[Reset Password] Failed to send confirmation email:', emailError);
      }
    }
    
    res.json({ 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
    
  } catch (error) {
    console.error('[Reset Password] Error:', error);
    res.status(500).json({ message: 'Server error resetting password: ' + error.message });
  }
});

// Verify reset token (optional - for frontend validation)
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({ valid: false, message: 'Token and email are required' });
    }
    
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.json({ valid: false, message: 'Invalid or expired token' });
    }
    
    res.json({ valid: true, message: 'Token is valid' });
    
  } catch (error) {
    console.error('[Verify Reset Token] Error:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});









// =============================================
// COIN CONVERSION ROUTES
// =============================================

// Convert coins to Naira
router.post('/wallet/convert-coins', authenticateToken, async (req, res) => {
  try {
    const { coins } = req.body;
    const COIN_VALUE = 500; // 1 coin = 500 Naira
    
    if (!coins || coins <= 0) {
      return res.status(400).json({ message: 'Valid coin amount is required' });
    }
    
    if (coins < 1) {
      return res.status(400).json({ message: 'Minimum conversion is 1 coin' });
    }
    
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentCoins = user.coinBalance || 0;
    
    if (coins > currentCoins) {
      return res.status(400).json({ 
        message: `Insufficient coins. You have ${currentCoins} coin${currentCoins !== 1 ? 's' : ''}` 
      });
    }
    
    // Calculate Naira amount
    const nairaAmount = coins * COIN_VALUE;
    
    // Update balances
    user.coinBalance = currentCoins - coins;
    user.balance = (user.balance || 0) + nairaAmount;
    
    await user.save();
    
    // Create transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: 'coin_conversion',
      amount: nairaAmount,
      description: `Converted ${coins} coin${coins > 1 ? 's' : ''} to ₦${nairaAmount.toLocaleString()}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: `COIN_CONV_${Date.now()}`
    });
    await transaction.save();
    
    console.log(`[Coin Conversion] ${user.username} converted ${coins} coins to ₦${nairaAmount}`);
    
    // Send notification
    try {
      await sendNotificationToUser(
        user.username,
        'Coin Conversion Successful',
        `You converted ${coins} coin${coins > 1 ? 's' : ''} to ₦${nairaAmount.toLocaleString()}`,
        { type: 'coin_conversion', coins: coins.toString(), nairaAmount: nairaAmount.toString() }
      );
    } catch (notifError) {
      console.log('[FCM] Coin conversion notification failed (non-critical):', notifError);
    }
    
    res.json({
      message: `Successfully converted ${coins} coin${coins > 1 ? 's' : ''} to ₦${nairaAmount.toLocaleString()}`,
      nairaAmount,
      newBalance: user.balance,
      newCoinBalance: user.coinBalance
    });
    
  } catch (error) {
    console.error('[Coin Conversion] Error:', error);
    res.status(500).json({ message: 'Server error converting coins: ' + error.message });
  }
});

// Get coin balance
router.get('/wallet/coin-balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('coinBalance username').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      coinBalance: user.coinBalance || 0,
      username: user.username,
      coinValue: 500
    });
  } catch (error) {
    console.error('[Coin Balance] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch coin balance: ' + error.message 
    });
  }
});

// Update wallet top-up route to handle coin conversion
// Replace your existing /wallet/topup route with this:
// Wallet Top-up Route - FIXED VERSION matching Profile.jsx with activity logging
// Wallet Top-up Route - COMPLETE with successful AND failed payment tracking
// Wallet Top-up Route - COMPLETE with guaranteed activity logging
// Wallet Top-up Route - COMPLETE WITH ACTIVITY LOGGING
// Wallet Top-up Route - COMPLETE WITH ACTIVITY LOGGING AND KORA FIX
router.post('/wallet/topup', authenticateToken, async (req, res) => {
  const { amount, reference, convertToCoins = false } = req.body;
  
  console.log('[Wallet Topup] ========== START ==========');
  console.log('[Wallet Topup] Request received:', { amount, reference, convertToCoins });
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Valid amount is required' });
  }
  
  const COIN_VALUE = 500;
  
  if (convertToCoins && amount < COIN_VALUE) {
    return res.status(400).json({ message: `Minimum coin purchase is ₦${COIN_VALUE} (1 coin)` });
  }
  
  if (!convertToCoins && amount < 100) {
    return res.status(400).json({ message: 'Minimum top-up amount is ₦100' });
  }
  
  if (!reference) {
    return res.status(400).json({ message: 'Payment reference is required' });
  }

  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('[Wallet Topup] User found:', user.username);
    console.log('[Wallet Topup] Verifying payment for reference:', reference);
    console.log('[Wallet Topup] Amount expected:', amount);

    // Kora verification
    const koraSecretKey = process.env.KORA_SECRET_KEY;
    const koraApiUrl = 'https://api.korapay.com';
    
    let isSuccessful = false;
    let verifiedAmount = 0;
    let paymentStatus = 'failed';
    let failureReason = '';
    let verifyData = null;
    
    try {
      const verifyResponse = await fetch(`${koraApiUrl}/merchant/api/v1/charges/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${koraSecretKey}`,
          'Content-Type': 'application/json',
        },
      });

      verifyData = await verifyResponse.json();
      console.log('[Wallet Topup] Verification response:', JSON.stringify(verifyData, null, 2));
      
      // FIXED: Check multiple possible success indicators from Kora
      if (verifyData.status === 'success' && verifyData.data) {
        const chargeData = verifyData.data;
        
        // Check all possible success indicators
        const isChargeSuccess = 
          chargeData.status === 'success' || 
          chargeData.state === 'success' || 
          chargeData.state === 'completed' ||
          chargeData.status === 'completed';
        
        if (isChargeSuccess) {
          isSuccessful = true;
          paymentStatus = 'success';
          // Get amount from various possible fields
          verifiedAmount = chargeData.amount || chargeData.amount_settled || chargeData.amount_paid || amount;
          console.log('[Wallet Topup] ✅ Payment verified as SUCCESS, amount:', verifiedAmount);
        } else {
          failureReason = chargeData.message || chargeData.status || chargeData.state || 'Payment not successful';
          console.log('[Wallet Topup] ❌ Payment verification returned NOT success:', failureReason);
        }
      } else if (verifyData.data && verifyData.data.reference === reference) {
        // Alternative check
        const chargeData = verifyData.data;
        const isChargeSuccess = 
          chargeData.status === 'success' || 
          chargeData.state === 'success' || 
          chargeData.state === 'completed';
        
        if (isChargeSuccess) {
          isSuccessful = true;
          paymentStatus = 'success';
          verifiedAmount = chargeData.amount || chargeData.amount_settled || amount;
          console.log('[Wallet Topup] ✅ Payment verified via alternative check');
        } else {
          failureReason = chargeData.message || 'Payment verification failed';
        }
      } else {
        failureReason = verifyData?.message || 'Payment verification failed';
        console.log('[Wallet Topup] ❌ Payment verification response not success:', failureReason);
      }
    } catch (error) {
      failureReason = `Network error: ${error.message}`;
      console.error('[Wallet Topup] ❌ Verification request failed:', error);
    }

    // ========== LOG PAYMENT ATTEMPT (ALWAYS) ==========
    try {
      const paymentActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'payment_received',
        data: {
          username: user.username,
          userId: user._id.toString(),
          amount: amount,
          expectedAmount: amount,
          verifiedAmount: verifiedAmount || 0,
          currency: 'NGN',
          method: 'kora',
          reference: reference,
          convertToCoins: convertToCoins,
          status: paymentStatus,
          failureReason: failureReason || null,
          timestamp: new Date().toISOString(),
          isSuccessful: isSuccessful
        },
        adminUser: user.username,
        adminId: user._id,
        timestamp: new Date()
      });
      await paymentActivity.save();
      console.log('[Activity] ✅ Payment attempt LOGGED:', user.username, amount, paymentStatus);
    } catch (activityError) {
      console.error('[Activity] ❌ Failed to log payment attempt:', activityError);
    }

    if (!isSuccessful) {
      console.error('[Wallet Topup] Payment verification failed:', failureReason);
      
      // Create failed transaction record
      try {
        const failedTransaction = new Transaction({
          id: crypto.randomBytes(16).toString('hex'),
          userId: user.username,
          type: 'topup',
          amount: amount,
          description: `FAILED top-up of ₦${amount.toLocaleString()} via Kora. Reason: ${failureReason}`,
          status: 'failed',
          createdAt: new Date(),
          relatedId: reference,
        });
        await failedTransaction.save();
        console.log('[Wallet Topup] Failed transaction record created');
      } catch (transError) {
        console.error('[Wallet Topup] Failed to create transaction record:', transError);
      }
      
      return res.status(400).json({ 
        message: `Payment verification failed: ${failureReason}`,
        status: 'failed',
        reference: reference
      });
    }

    // Convert amount if needed (handle kobo to naira)
    let finalAmount = amount;
    if (verifiedAmount > 10000 && verifiedAmount < 1000000 && verifiedAmount !== amount) {
      const koboToNaira = verifiedAmount / 100;
      if (Math.abs(koboToNaira - amount) < 1) {
        finalAmount = amount;
      } else if (Math.abs(verifiedAmount - amount) < 1) {
        finalAmount = amount;
      } else {
        console.error('[Wallet Topup] Amount mismatch:', { verifiedAmount, expected: amount });
        
        // Log amount mismatch as failed
        try {
          const mismatchActivity = new AdminActivity({
            id: crypto.randomBytes(16).toString('hex'),
            type: 'payment_received',
            data: {
              username: user.username,
              amount: amount,
              verifiedAmount: verifiedAmount,
              mismatch: true,
              status: 'failed',
              failureReason: 'Amount mismatch between expected and verified'
            },
            adminUser: user.username,
            adminId: user._id,
            timestamp: new Date()
          });
          await mismatchActivity.save();
        } catch (logError) {
          console.error('[Activity] Failed to log mismatch:', logError);
        }
        
        return res.status(400).json({ message: 'Amount mismatch between payment and verification' });
      }
    }

    let responseMessage = '';
    let coinsAdded = 0;
    let transactionType = '';
    let transactionDescription = '';
    let oldBalance = 0;
    let newBalance = 0;
    
    if (convertToCoins) {
      // Convert to coins
      coinsAdded = Math.floor(finalAmount / COIN_VALUE);
      oldBalance = user.coinBalance || 0;
      user.coinBalance = oldBalance + coinsAdded;
      newBalance = user.coinBalance;
      responseMessage = `Added ${coinsAdded} coin${coinsAdded > 1 ? 's' : ''} to your coin balance`;
      transactionType = 'coin_purchase';
      transactionDescription = `Purchased ${coinsAdded} coins with ₦${finalAmount.toLocaleString()} via Kora`;
      console.log(`[Wallet Topup] Added ${coinsAdded} coins to ${user.username} (${oldBalance} -> ${newBalance})`);
    } else {
      // Add to Naira balance
      oldBalance = user.balance || 0;
      user.balance = oldBalance + finalAmount;
      newBalance = user.balance;
      responseMessage = `Added ₦${finalAmount.toLocaleString()} to your wallet`;
      transactionType = 'topup';
      transactionDescription = `Wallet top-up of ₦${finalAmount.toLocaleString()} via Kora`;
      console.log(`[Wallet Topup] Added ₦${finalAmount} to ${user.username}'s balance (${oldBalance} -> ${newBalance})`);
    }
    
    await user.save();

    // Create successful transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: transactionType,
      amount: convertToCoins ? coinsAdded : finalAmount,
      description: transactionDescription,
      status: 'completed',
      createdAt: new Date(),
      relatedId: reference,
    });
    await transaction.save();
    console.log('[Wallet Topup] Transaction record created');

    // ========== LOG SUCCESSFUL PAYMENT ==========
    try {
      const successActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'payment_received',
        data: {
          username: user.username,
          userId: user._id.toString(),
          amount: finalAmount,
          originalAmount: amount,
          verifiedAmount: verifiedAmount,
          currency: 'NGN',
          method: 'kora',
          reference: reference,
          convertToCoins: convertToCoins,
          coinsAdded: convertToCoins ? coinsAdded : null,
          oldBalance: oldBalance,
          newBalance: newBalance,
          balanceType: convertToCoins ? 'coins' : 'naira',
          status: 'success',
          timestamp: new Date().toISOString()
        },
        adminUser: user.username,
        adminId: user._id,
        timestamp: new Date()
      });
      await successActivity.save();
      console.log('[Activity] ✅ Successful payment LOGGED:', user.username, finalAmount);
    } catch (activityError) {
      console.error('[Activity] ❌ Failed to log successful payment:', activityError);
    }
   
    // Send notification
    try {
      await sendNotificationToUser(
        user.username,
        convertToCoins ? 'Coin Purchase Successful' : 'Wallet Top-up Successful',
        responseMessage,
        { 
          type: convertToCoins ? 'coin_purchase' : 'wallet_topup', 
          amount: convertToCoins ? coinsAdded.toString() : finalAmount.toString()
        }
      );
    } catch (notifError) {
      console.log('[Wallet Topup] Notification failed (non-critical):', notifError);
    }
   
    console.log('[Wallet Topup] ========== END (SUCCESS) ==========');
    
    res.status(201).json({
      message: convertToCoins ? 'Coins purchased successfully' : 'Wallet topped up successfully',
      newBalance: user.balance,
      newCoinBalance: user.coinBalance,
      amount: convertToCoins ? coinsAdded : finalAmount,
      currency: 'NGN',
      coinsAdded: convertToCoins ? coinsAdded : null,
      status: 'success'
    });
    
  } catch (error) {
    console.error('[Wallet Topup] Server Error:', error);
    console.error('[Wallet Topup] ========== END (ERROR) ==========');
    
    // Log server error as failed payment
    try {
      const user = await User.findOne({ email: req.user.email });
      if (user) {
        const errorActivity = new AdminActivity({
          id: crypto.randomBytes(16).toString('hex'),
          type: 'payment_received',
          data: {
            username: user.username,
            amount: req.body.amount,
            reference: req.body.reference,
            status: 'failed',
            failureReason: `Server error: ${error.message}`,
            timestamp: new Date().toISOString()
          },
          adminUser: user.username,
          adminId: user._id,
          timestamp: new Date()
        });
        await errorActivity.save();
      }
    } catch (logError) {
      console.error('[Activity] Failed to log error payment:', logError);
    }
    
    res.status(500).json({ message: 'Server error during top-up: ' + error.message });
  }
});




// DEBUG: Test gift coin update
router.post('/debug/test-gift', authenticateToken, async (req, res) => {
  try {
    const { recipientUsername, amount } = req.body;
    const senderUsername = req.user.username;
    
    console.log('[DEBUG] Testing direct coin update');
    
    const sender = await User.findOne({ username: senderUsername });
    const recipient = await User.findOne({ username: recipientUsername });
    
    if (!sender || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const oldSenderCoins = sender.coinBalance || 0;
    const oldRecipientCoins = recipient.coinBalance || 0;
    
    // Direct update
    sender.coinBalance = oldSenderCoins - amount;
    recipient.coinBalance = oldRecipientCoins + amount;
    
    await sender.save();
    await recipient.save();
    
    // Verify
    const verifySender = await User.findOne({ username: senderUsername });
    const verifyRecipient = await User.findOne({ username: recipientUsername });
    
    res.json({
      success: true,
      sender: {
        username: senderUsername,
        oldBalance: oldSenderCoins,
        newBalance: verifySender.coinBalance,
        changed: oldSenderCoins - verifySender.coinBalance
      },
      recipient: {
        username: recipientUsername,
        oldBalance: oldRecipientCoins,
        newBalance: verifyRecipient.coinBalance,
        changed: verifyRecipient.coinBalance - oldRecipientCoins
      }
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// COIN MANAGEMENT ROUTES
// =============================================

// 1. Buy coins using wallet balance
router.post('/wallet/buy-coins', authenticateToken, async (req, res) => {
  try {
    const { nairaAmount, coins } = req.body;
    const COIN_VALUE = 500;
    
    // Calculate coins based on naira amount if not provided
    let coinsToBuy = coins;
    let nairaSpent = nairaAmount;
    
    if (!coinsToBuy && nairaAmount) {
      coinsToBuy = Math.floor(nairaAmount / COIN_VALUE);
      nairaSpent = coinsToBuy * COIN_VALUE;
    }
    
    if (!coinsToBuy || coinsToBuy <= 0) {
      return res.status(400).json({ message: 'Valid coin amount is required' });
    }
    
    if (nairaSpent < COIN_VALUE) {
      return res.status(400).json({ message: `Minimum coin purchase is ₦${COIN_VALUE} (1 coin)` });
    }
    
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentBalance = user.balance || 0;
    
    if (nairaSpent > currentBalance) {
      return res.status(400).json({ 
        message: `Insufficient wallet balance. You have ₦${currentBalance.toLocaleString()}` 
      });
    }
    
    // Deduct from wallet, add to coins
    user.balance = currentBalance - nairaSpent;
    user.coinBalance = (user.coinBalance || 0) + coinsToBuy;
    
    await user.save();
    
    // Create transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: 'coin_purchase',
      amount: coinsToBuy,
      description: `Bought ${coinsToBuy} coin${coinsToBuy > 1 ? 's' : ''} for ₦${nairaSpent.toLocaleString()}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: `COIN_BUY_${Date.now()}`
    });
    await transaction.save();
    
    console.log(`[Buy Coins] ${user.username} bought ${coinsToBuy} coins for ₦${nairaSpent}`);
    
    // Send notification
    try {
      await sendNotificationToUser(
        user.username,
        'Coin Purchase Successful',
        `You bought ${coinsToBuy} coin${coinsToBuy > 1 ? 's' : ''} for ₦${nairaSpent.toLocaleString()}`,
        { type: 'coin_purchase', coins: coinsToBuy.toString(), nairaSpent: nairaSpent.toString() }
      );
    } catch (notifError) {
      console.log('[FCM] Coin purchase notification failed:', notifError);
    }
    
    res.json({
      message: `Successfully bought ${coinsToBuy} coin${coinsToBuy > 1 ? 's' : ''}`,
      coinsBought: coinsToBuy,
      nairaSpent: nairaSpent,
      newBalance: user.balance,
      newCoinBalance: user.coinBalance
    });
    
  } catch (error) {
    console.error('[Buy Coins] Error:', error);
    res.status(500).json({ message: 'Server error buying coins: ' + error.message });
  }
});

// 2. Sell coins for wallet money
router.post('/wallet/sell-coins', authenticateToken, async (req, res) => {
  try {
    const { coins } = req.body;
    const COIN_VALUE = 500;
    
    if (!coins || coins <= 0) {
      return res.status(400).json({ message: 'Valid coin amount is required' });
    }
    
    if (coins < 1) {
      return res.status(400).json({ message: 'Minimum sale is 1 coin' });
    }
    
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentCoins = user.coinBalance || 0;
    
    if (coins > currentCoins) {
      return res.status(400).json({ 
        message: `Insufficient coins. You have ${currentCoins} coin${currentCoins !== 1 ? 's' : ''}` 
      });
    }
    
    const nairaReceived = coins * COIN_VALUE;
    
    // Deduct coins, add to wallet
    user.coinBalance = currentCoins - coins;
    user.balance = (user.balance || 0) + nairaReceived;
    
    await user.save();
    
    // Create transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: 'coin_sale',
      amount: nairaReceived,
      description: `Sold ${coins} coin${coins > 1 ? 's' : ''} for ₦${nairaReceived.toLocaleString()}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: `COIN_SELL_${Date.now()}`
    });
    await transaction.save();
    
    console.log(`[Sell Coins] ${user.username} sold ${coins} coins for ₦${nairaReceived}`);
    
    // Send notification
    try {
      await sendNotificationToUser(
        user.username,
        'Coin Sale Successful',
        `You sold ${coins} coin${coins > 1 ? 's' : ''} for ₦${nairaReceived.toLocaleString()}`,
        { type: 'coin_sale', coins: coins.toString(), nairaReceived: nairaReceived.toString() }
      );
    } catch (notifError) {
      console.log('[FCM] Coin sale notification failed:', notifError);
    }
    
    res.json({
      message: `Successfully sold ${coins} coin${coins > 1 ? 's' : ''}`,
      coinsSold: coins,
      nairaReceived: nairaReceived,
      newBalance: user.balance,
      newCoinBalance: user.coinBalance
    });
    
  } catch (error) {
    console.error('[Sell Coins] Error:', error);
    res.status(500).json({ message: 'Server error selling coins: ' + error.message });
  }
});

// 3. Get wallet and coin balances (already exists, but ensure it includes coinBalance)
router.get('/wallet/balances', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('balance coinBalance username').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      balance: user.balance || 0,
      coinBalance: user.coinBalance || 0,
      coinValue: 500,
      username: user.username
    });
  } catch (error) {
    console.error('[Wallet Balances] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch balances: ' + error.message 
    });
  }
});

// =============================================
// GIFT SYSTEM ROUTES
// =============================================

// Gift Schema
// =============================================
// GIFT SYSTEM ROUTES
// =============================================



// Send a gift to a post
// =============================================
// COMPLETE GIFT ROUTE - POST /posts/:postId/gift
// =============================================

// =============================================
// COMPLETE FIXED GIFT ROUTE - REPLACE YOUR EXISTING ONE
// =============================================

// =============================================
// COMPLETE WORKING GIFT ROUTE
// =============================================

// =============================================
// COMPLETE WORKING GIFT ROUTE - FIXED COIN BALANCE
// =============================================

// =============================================
// COMPLETE FIXED GIFT ROUTE - WITH PROPER BALANCE UPDATE
// =============================================

// =============================================
// COMPLETE FIXED GIFT ROUTE - CORRECT COIN BALANCE UPDATE
// =============================================

// =============================================
// FIXED GIFT ROUTE - PROPERLY ADDS COINS TO RECIPIENT
// =============================================

// =============================================
// COMPLETELY FIXED GIFT ROUTE - ADDS COINS TO RECIPIENT
// =============================================

// =============================================
// MINIMAL WORKING GIFT ROUTE - GUARANTEED TO WORK
// =============================================

// =============================================
// COMPLETE WORKING GIFT ROUTE - FIXED VERSION
// =============================================
// =============================================
// COMPLETELY REWRITTEN GIFT ROUTE - FIXES COIN BALANCE
// =============================================

// =============================================
// COMPLETELY FIXED GIFT ROUTE - UPDATES RECIPIENT COIN BALANCE
// =============================================

// =============================================
// COMPLETELY FIXED GIFT ROUTE - PROPERLY UPDATES RECIPIENT COIN BALANCE
// =============================================

// =============================================
// COMPLETELY FIXED GIFT ROUTE - HANDLES NUMERIC POST IDS
// =============================================

// =============================================
// COMPLETELY FIXED GIFT ROUTE - PROPER COIN DISTRIBUTION
// =============================================

// Send a gift to a post
router.post('/posts/:postId/gift', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { giftId, giftName, giftIcon, price } = req.body;
    const senderUsername = req.user.username;
    
    console.log(`\n========== GIFT TRANSACTION ==========`);
    console.log(`Sender: ${senderUsername}`);
    console.log(`Gift: ${giftIcon} ${giftName} (${price} coins)`);
    console.log(`Post ID: ${postId}`);
    
    // Validate input
    if (!giftId || !giftName || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required gift information' 
      });
    }
    
    // Validate minimum gift amount (2 coins minimum to ensure recipient gets coins)
    if (price < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Minimum gift amount is 2 coins' 
      });
    }
    
    // Find post owner using numeric ID
    const numericPostId = parseInt(postId);
    let recipientUsername = null;
    let foundPost = null;
    
    // Try to find in posts collection
    let post = await Post.findOne({ id: numericPostId }).lean();
    
    if (post) {
      recipientUsername = post.username;
      foundPost = post;
      console.log(`[Gift] Found post in posts collection: ${recipientUsername}`);
    } else {
      // Search in users' posts
      const users = await User.find({}).select('username posts').lean();
      for (const user of users) {
        if (user.posts && Array.isArray(user.posts)) {
          const found = user.posts.find(p => p.id === numericPostId);
          if (found) {
            recipientUsername = user.username;
            foundPost = found;
            console.log(`[Gift] Found post in user ${recipientUsername}'s posts`);
            break;
          }
        }
      }
    }
    
    if (!recipientUsername) {
      console.error(`[Gift] Post not found with ID: ${postId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }
    
    if (senderUsername === recipientUsername) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot send gift to yourself' 
      });
    }
    
    // Get both users
    const sender = await User.findOne({ username: senderUsername });
    const recipient = await User.findOne({ username: recipientUsername });
    
    if (!sender || !recipient) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Initialize coinBalance if undefined
    sender.coinBalance = sender.coinBalance || 0;
    recipient.coinBalance = recipient.coinBalance || 0;
    
    console.log(`\n--- BEFORE UPDATE ---`);
    console.log(`Sender ${senderUsername} coinBalance: ${sender.coinBalance}`);
    console.log(`Recipient ${recipientUsername} coinBalance: ${recipient.coinBalance}`);
    
    // Check sufficient coins
    if (sender.coinBalance < price) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient coins. Need ${price}, have ${sender.coinBalance}`,
        currentBalance: sender.coinBalance,
        needed: price
      });
    }
    
    // Calculate shares with proper rounding
    let recipientShare = Math.floor(price * 0.7);
    let platformShare = price - recipientShare;
    
    // For small gifts (2-3 coins), ensure recipient gets something
    if (recipientShare === 0 && price > 0) {
      recipientShare = 1;
      platformShare = price - recipientShare;
    }
    
    console.log(`\n--- CALCULATIONS ---`);
    console.log(`Price: ${price} coins`);
    console.log(`Recipient gets: ${recipientShare} coins (${Math.round(recipientShare/price*100)}%)`);
    console.log(`Platform fee: ${platformShare} coins (${Math.round(platformShare/price*100)}%)`);
    
    // Use atomic operations for balance updates
    const updatedSender = await User.findOneAndUpdate(
      { username: senderUsername },
      { $inc: { coinBalance: -price } },
      { new: true }
    );
    
    const updatedRecipient = await User.findOneAndUpdate(
      { username: recipientUsername },
      { $inc: { coinBalance: recipientShare } },
      { new: true }
    );
    
    if (!updatedSender || !updatedRecipient) {
      throw new Error('Failed to update user balances');
    }
    
    console.log(`\n--- AFTER UPDATE ---`);
    console.log(`Sender ${senderUsername} new coinBalance: ${updatedSender.coinBalance}`);
    console.log(`Recipient ${recipientUsername} new coinBalance: ${updatedRecipient.coinBalance}`);
    
    // Create gift record
    const gift = new Gift({
      id: crypto.randomBytes(16).toString('hex'),
      postId: numericPostId.toString(),
      senderId: sender._id.toString(),
      senderUsername: senderUsername,
      recipientId: recipient._id.toString(),
      recipientUsername: recipientUsername,
      giftId: giftId,
      giftName: giftName,
      giftIcon: giftIcon,
      price: price,
      timestamp: new Date()
    });
    
    await gift.save();
    console.log(`[Gift] Gift record created: ${gift.id}`);
    
    // Create transaction records
    const senderTransaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: senderUsername,
      type: 'coin_deduction',
      amount: price,
      description: `Sent ${giftIcon} ${giftName} to @${recipientUsername}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: gift.id
    });
    await senderTransaction.save();
    
    const recipientTransaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: recipientUsername,
      type: 'earning',
      amount: recipientShare,
      description: `Received ${giftIcon} ${giftName} from @${senderUsername}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: gift.id
    });
    await recipientTransaction.save();
    
    // ========== ADD ACTIVITY LOGGING FOR GIFT ==========
    try {
      const giftActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'gift_sent',
        data: {
          sender: senderUsername,
          recipient: recipientUsername,
          giftName: giftName,
          giftIcon: giftIcon,
          price: price,
          postId: postId,
          recipientShare: recipientShare
        },
        adminUser: senderUsername,
        adminId: sender._id,
        timestamp: new Date()
      });
      await giftActivity.save();
      console.log('[Activity] Gift sent activity logged');
    } catch (activityError) {
      console.error('[Activity] Failed to log gift:', activityError);
    }
    
    // Send notifications
    try {
      await sendNotificationToUser(
        recipientUsername,
        `🎁 You received a ${giftIcon} ${giftName}!`,
        `${senderUsername} sent you a gift worth ${price} coins! You earned ${recipientShare} coins.`,
        { 
          type: 'gift_received', 
          sender: senderUsername, 
          giftName: giftName,
          giftIcon: giftIcon,
          price: price.toString(),
          recipientShare: recipientShare.toString()
        }
      );
    } catch (notifError) {
      console.log('[Gift] Recipient notification failed (non-critical):', notifError.message);
    }
    
    try {
      await sendNotificationToUser(
        senderUsername,
        `🎁 Gift sent successfully!`,
        `You sent a ${giftIcon} ${giftName} to @${recipientUsername} for ${price} coins`,
        { 
          type: 'gift_sent', 
          recipient: recipientUsername, 
          giftName: giftName,
          giftIcon: giftIcon,
          price: price.toString()
        }
      );
    } catch (notifError) {
      console.log('[Gift] Sender notification failed (non-critical):', notifError.message);
    }
    
    console.log(`\n========== GIFT SUCCESS ==========\n`);
    
    res.status(201).json({
      success: true,
      message: 'Gift sent successfully',
      gift: {
        id: gift.id,
        giftId: gift.giftId,
        giftName: gift.giftName,
        giftIcon: gift.giftIcon,
        price: gift.price,
        senderUsername: gift.senderUsername,
        recipientUsername: gift.recipientUsername,
        recipientShare: recipientShare
      },
      sender: {
        username: senderUsername,
        newCoinBalance: updatedSender.coinBalance,
        spent: price
      },
      recipient: {
        username: recipientUsername,
        newCoinBalance: updatedRecipient.coinBalance,
        earned: recipientShare
      }
    });
    
  } catch (error) {
    console.error('========== GIFT FAILED ==========');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});



// Get gifts sent by a user
router.get('/users/:username/gifts/sent', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Check if requesting own gifts or admin
    const isProfileOwner = req.user.username === username;
    const isAdmin = req.user.isAdmin;
    
    if (!isProfileOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to view these gifts' });
    }
    
    const gifts = await Gift.find({ senderUsername: username })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    
    const totalSpent = gifts.reduce((sum, gift) => sum + gift.price, 0);
    
    res.json({
      success: true,
      gifts: gifts,
      totalSpent: totalSpent,
      count: gifts.length
    });
    
  } catch (error) {
    console.error('[Get Sent Gifts] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get gifts received by a user
router.get('/users/:username/gifts/received', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Check if requesting own gifts or admin
    const isProfileOwner = req.user.username === username;
    const isAdmin = req.user.isAdmin;
    
    if (!isProfileOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to view these gifts' });
    }
    
    const gifts = await Gift.find({ recipientUsername: username })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    
    const totalEarned = gifts.reduce((sum, gift) => sum + Math.floor(gift.price * 0.7), 0);
    
    res.json({
      success: true,
      gifts: gifts,
      totalEarned: totalEarned,
      count: gifts.length
    });
    
  } catch (error) {
    console.error('[Get Received Gifts] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// Get all gifts for a post
// Get all gifts for a post - FIXED VERSION
// Get all gifts for a post - FIXED VERSION
// Get all gifts for a post - FIXED VERSION
// Get all gifts for a post - FIXED VERSION
router.get('/posts/:postId/gifts', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    
    console.log(`[Get Gifts] Fetching for post: ${postId}`);
    
    const gifts = await Gift.find({ 
      $or: [
        { postId: postId.toString() },
        { postId: Number(postId) },
        { postId: postId }
      ]
    }).sort({ timestamp: -1 }).lean();
    
    const totalValue = gifts.reduce((sum, gift) => sum + (gift.price || 0), 0);
    const totalRecipientValue = Math.floor(totalValue * 0.7);
    
    console.log(`[Get Gifts] Found ${gifts.length} gifts, total value: ${totalValue}`);
    
    res.json({
      success: true,
      gifts: gifts,
      totalValue: totalValue,
      totalRecipientValue: totalRecipientValue,
      count: gifts.length
    });
    
  } catch (error) {
    console.error('[Get Gifts] Error:', error);
    res.json({ 
      success: false, 
      gifts: [], 
      totalValue: 0, 
      count: 0 
    });
  }
});


// Debug endpoint to check gift collection
router.get('/debug/gifts/check', authenticateToken, async (req, res) => {
  try {
    const giftCount = await Gift.countDocuments();
    const sampleGifts = await Gift.find().limit(5).lean();
    
    res.json({
      giftCollectionExists: true,
      giftCount,
      sampleGifts,
      giftModelExists: typeof Gift !== 'undefined'
    });
  } catch (error) {
    res.json({
      error: error.message,
      giftCollectionExists: false
    });
  }
});



// Debug endpoint to check gifts for a specific post
router.get('/debug/gifts/post/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const gifts = await Gift.find({ postId: postId }).lean();
    const post = await Post.findOne({ id: Number(postId) }).lean();
    
    // Also check if there are gifts with different postId format
    const stringPostIdGifts = await Gift.find({ postId: postId.toString() }).lean();
    
    res.json({
      searchedPostId: postId,
      postFound: !!post,
      giftsFound: gifts.length,
      gifts: gifts,
      stringPostIdGifts: stringPostIdGifts,
      allGiftCount: await Gift.countDocuments()
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});



// =============================================
// DEBUG: MANUALLY FIX COIN BALANCES FOR A USER
// =============================================

router.post('/debug/fix-coin-balance/:username', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Calculate total gifts received
    const receivedGifts = await Gift.find({ recipientUsername: username });
    const totalGiftValue = receivedGifts.reduce((sum, gift) => sum + gift.price, 0);
    const expectedEarnings = Math.floor(totalGiftValue * 0.7);
    
    // Calculate total gifts sent
    const sentGifts = await Gift.find({ senderUsername: username });
    const totalSent = sentGifts.reduce((sum, gift) => sum + gift.price, 0);
    
    // Calculate what balance should be
    const calculatedBalance = expectedEarnings - totalSent;
    
    const oldBalance = user.coinBalance || 0;
    
    // Update if mismatch
    if (oldBalance !== calculatedBalance) {
      user.coinBalance = calculatedBalance;
      await user.save();
      
      console.log(`[Fix Balance] ${username}: ${oldBalance} -> ${calculatedBalance}`);
    }
    
    res.json({
      success: true,
      username: username,
      oldBalance: oldBalance,
      newBalance: user.coinBalance,
      calculatedBalance: calculatedBalance,
      totalGiftsReceived: receivedGifts.length,
      totalGiftValue: totalGiftValue,
      expectedEarnings: expectedEarnings,
      totalGiftsSent: sentGifts.length,
      totalSent: totalSent,
      fixed: oldBalance !== calculatedBalance
    });
    
  } catch (error) {
    console.error('[Fix Balance] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// =============================================
// ACTIVITY LOGGING SCHEMA
// =============================================


// Add this schema with your other schemas (around line 440-480)
// In auth.js, update the adminActivitySchema (around line where you added it)
// =============================================
// ACTIVITY LOGGING - COMPLETE
// =============================================

// Add this schema with your other schemas (around line 440-480)
// =============================================
// ACTIVITY LOGGING - COMPLETE
// =============================================

// Add this schema with your other schemas (around line 440-480)


// =============================================
// ADMIN: LOG ACTIVITY ENDPOINT
// =============================================

router.post('/admin/log-activity', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({ message: 'Type and data are required' });
    }
    
    const activity = new AdminActivity({
      id: crypto.randomBytes(16).toString('hex'),
      type,
      data,
      adminUser: req.user.username,
      adminId: req.user._id,
      timestamp: new Date()
    });
    
    await activity.save();
    
    // Keep only last 1000 activities for performance
    const count = await AdminActivity.countDocuments();
    if (count > 1000) {
      const oldestActivities = await AdminActivity.find()
        .sort({ timestamp: 1 })
        .limit(count - 1000);
      
      const oldestIds = oldestActivities.map(a => a._id);
      await AdminActivity.deleteMany({ _id: { $in: oldestIds } });
    }
    
    res.status(201).json({ success: true, activityId: activity.id });
  } catch (error) {
    console.error('[Log Activity] Error:', error);
    res.status(500).json({ message: 'Server error logging activity: ' + error.message });
  }
});

// =============================================
// ADMIN: GET ACTIVITIES ENDPOINT
// =============================================

router.get('/admin/activities', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      type, 
      startDate, 
      endDate,
      search 
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};
    
    // Filter by type
    if (type && type !== 'all') {
      query.type = type;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    // Search in data field
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { adminUser: searchRegex },
        { type: searchRegex }
      ];
    }
    
    const activities = await AdminActivity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalActivities = await AdminActivity.countDocuments(query);
    
    // Get statistics
    const stats = await AdminActivity.aggregate([
      { $group: { 
        _id: '$type', 
        count: { $sum: 1 } 
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Get daily activity counts for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyStats = await AdminActivity.aggregate([
      { $match: { timestamp: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': -1 } }
    ]);
    
    res.json({
      activities,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalActivities / limitNum),
        totalActivities,
        hasNext: pageNum < Math.ceil(totalActivities / limitNum),
        hasPrev: pageNum > 1
      },
      stats: {
        byType: stats,
        daily: dailyStats,
        totalTypes: stats.length
      }
    });
    
  } catch (error) {
    console.error('[Get Activities] Error:', error);
    res.status(500).json({ 
      activities: [],
      pagination: { currentPage: 1, totalPages: 1, totalActivities: 0, hasNext: false, hasPrev: false },
      error: error.message 
    });
  }
});

// =============================================
// ADMIN: GET ACTIVITY BY ID
// =============================================

router.get('/admin/activities/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const activity = await AdminActivity.findOne({ 
      $or: [{ id: id }, { _id: id }]
    }).lean();
    
    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }
    
    res.json(activity);
  } catch (error) {
    console.error('[Get Activity] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// ADMIN: CLEAR ACTIVITIES (with date filter)
// =============================================

router.delete('/admin/activities', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { olderThan, type } = req.query;
    
    let query = {};
    
    if (olderThan) {
      const olderThanDate = new Date();
      olderThanDate.setDate(olderThanDate.getDate() - parseInt(olderThan));
      query.timestamp = { $lt: olderThanDate };
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    const result = await AdminActivity.deleteMany(query);
    
    // Log this cleanup activity
    try {
      const cleanupActivity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'activities_cleared',
        data: {
          deletedCount: result.deletedCount,
          olderThan: olderThan || 'all',
          type: type || 'all'
        },
        adminUser: req.user.username,
        adminId: req.user._id,
        timestamp: new Date()
      });
      await cleanupActivity.save();
    } catch (logError) {
      console.error('[Clear Activities] Failed to log cleanup:', logError);
    }
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} activities`,
      deletedCount: result.deletedCount
    });
    
  } catch (error) {
    console.error('[Clear Activities] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// ADMIN: GET ACTIVITIES STATS
// =============================================

router.get('/admin/activities/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Total counts by type
    const typeStats = await AdminActivity.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Daily activity counts
    const dailyStats = await AdminActivity.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Most active admin users
    const adminStats = await AdminActivity.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      { $group: { _id: '$adminUser', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Hourly distribution
    const hourlyStats = await AdminActivity.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      period: `${days} days`,
      totalActivities: await AdminActivity.countDocuments({ timestamp: { $gte: startDate } }),
      byType: typeStats,
      daily: dailyStats,
      byAdmin: adminStats,
      hourly: hourlyStats
    });
    
  } catch (error) {
    console.error('[Activities Stats] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// ADMIN: ADD MONEY TO USER BALANCE
// =============================================

router.post('/admin/users/:username/add-funds', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { amount, reason = 'Admin adjustment' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    console.log(`[Admin Add Funds] Adding ₦${amount} to user: ${username}`);
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add to balance
    const oldBalance = user.balance || 0;
    user.balance = oldBalance + amount;
    await user.save();
    
    // Create transaction record
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: user.username,
      type: 'topup',
      amount: amount,
      description: `Admin funding: ${reason}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: `ADMIN_${Date.now()}`
    });
    await transaction.save();
    
    // Log activity in the database
    try {
      const activity = new AdminActivity({
        id: crypto.randomBytes(16).toString('hex'),
        type: 'funds_added',
        data: {
          username: username,
          amount: amount,
          reason: reason,
          oldBalance: oldBalance,
          newBalance: user.balance
        },
        adminUser: req.user.username,
        adminId: req.user._id,
        timestamp: new Date()
      });
      await activity.save();
    } catch (logError) {
      console.error('[Admin Add Funds] Failed to log activity:', logError);
    }
    
    // Send notification to user
    try {
      await sendNotificationToUser(
        user.username,
        '💰 Funds Added to Your Wallet!',
        `₦${amount.toLocaleString()} has been added to your wallet by admin. New balance: ₦${user.balance.toLocaleString()}`,
        { type: 'admin_funding', amount: amount.toString(), newBalance: user.balance.toString() }
      );
    } catch (notifError) {
      console.log('[Admin Add Funds] Notification failed (non-critical):', notifError);
    }
    
    console.log(`[Admin Add Funds] Success: ${username} balance: ${oldBalance} -> ${user.balance}`);
    
    res.json({
      success: true,
      message: `Successfully added ₦${amount.toLocaleString()} to ${username}'s wallet`,
      user: {
        username: user.username,
        oldBalance,
        newBalance: user.balance,
        amountAdded: amount
      }
    });
    
  } catch (error) {
    console.error('[Admin Add Funds] Error:', error);
    res.status(500).json({ message: 'Server error adding funds: ' + error.message });
  }
});


// Add this debug endpoint to check activities in database
router.get('/debug/activities-count', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const count = await AdminActivity.countDocuments();
    const latest = await AdminActivity.find().sort({ timestamp: -1 }).limit(10).lean();
    
    res.json({
      count,
      latestActivities: latest,
      hasActivities: count > 0
    });
  } catch (error) {
    res.json({ error: error.message, count: 0 });
  }
});

// Get all payment activities (successful and failed)
router.get('/admin/payments/history', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, username, startDate, endDate } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = { type: 'payment_received' };
    
    if (status && status !== 'all') {
      query['data.status'] = status;
    }
    
    if (username) {
      query['data.username'] = { $regex: new RegExp(username, 'i') };
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }
    
    const payments = await AdminActivity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalPayments = await AdminActivity.countDocuments(query);
    
    // Get statistics
    const stats = await AdminActivity.aggregate([
      { $match: { type: 'payment_received' } },
      { $group: {
        _id: '$data.status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$data.amount' }
      }}
    ]);
    
    const successfulCount = stats.find(s => s._id === 'success')?.count || 0;
    const failedCount = stats.find(s => s._id === 'failed')?.count || 0;
    const totalSuccessfulAmount = stats.find(s => s._id === 'success')?.totalAmount || 0;
    
    res.json({
      payments,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalPayments / limitNum),
        totalPayments,
        hasNext: pageNum < Math.ceil(totalPayments / limitNum),
        hasPrev: pageNum > 1
      },
      stats: {
        successful: successfulCount,
        failed: failedCount,
        totalSuccessfulAmount: totalSuccessfulAmount,
        totalPayments: totalPayments
      }
    });
    
  } catch (error) {
    console.error('[Payment History] Error:', error);
    res.status(500).json({ 
      payments: [],
      stats: { successful: 0, failed: 0, totalSuccessfulAmount: 0, totalPayments: 0 },
      error: error.message 
    });
  }
});









// =============================================
// LEAK CONTENT SCHEMA AND ROUTES
// Add this to your existing auth.js file
// =============================================

// =============================================
// LEAK SCHEMA DEFINITION
// Add this with your other schemas (around line 440-480)
// =============================================

// =============================================
// LEAK SCHEMA DEFINITION - FIXED (No text index on array)
// =============================================

// =============================================
// LEAK SCHEMA DEFINITION - FIXED (No array text indexes)
// =============================================

// =============================================
// LEAK SCHEMA DEFINITION - COMPLETELY FIXED
// =============================================

// =============================================
// LEAK SCHEMA DEFINITION - FORCE CLEANUP FIRST
// =============================================

// Define schema WITHOUT any text indexes
// In your leakSchema definition (around line where you defined it)
const leakSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, default: 0 },
  category: { 
    type: String, 
    enum: ['exclusive', 'premium', 'viral', 'trending', 'free'], 
    default: 'exclusive' 
  },
  tags: [{ type: String }],
  isPremium: { type: Boolean, default: false },
  isFree: { type: Boolean, default: false },
  thumbnail: { type: String, default: '' },
  videos: [{
    id: String,
    url: String,
    title: String,
    thumbnail: String,
    duration: Number,
    order: Number
  }],
  views: { type: Number, default: 0 },  // ← MAKE SURE THIS EXISTS
  purchaseCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


// Simple indexes - NO TEXT INDEXES
leakSchema.index({ title: 1 });
leakSchema.index({ category: 1, status: 1, createdAt: -1 });
leakSchema.index({ price: 1 });

// FORCE DROP ANY EXISTING TEXT INDEXES BEFORE MODEL CREATION
(async () => {
  try {
    // Wait for MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.log('[Leak Fix] Waiting for DB connection...');
      await new Promise(resolve => {
        const checkConnection = () => {
          if (mongoose.connection.readyState === 1) {
            resolve();
          } else {
            setTimeout(checkConnection, 500);
          }
        };
        checkConnection();
      });
    }
    
    console.log('[Leak Fix] Checking for existing leaks collection...');
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections({ name: 'leaks' }).toArray();
    
    if (collections.length > 0) {
      console.log('[Leak Fix] Leaks collection exists, checking indexes...');
      const leaksCollection = mongoose.connection.db.collection('leaks');
      const indexes = await leaksCollection.indexes();
      
      console.log('[Leak Fix] Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, weights: idx.weights })));
      
      // Find and drop ANY text index (any index with weights property)
      const textIndexes = indexes.filter(idx => idx.weights !== undefined);
      
      for (const textIndex of textIndexes) {
        console.log('[Leak Fix] Dropping text index:', textIndex.name);
        try {
          await leaksCollection.dropIndex(textIndex.name);
          console.log('[Leak Fix] Successfully dropped index:', textIndex.name);
        } catch (dropError) {
          console.log('[Leak Fix] Could not drop index:', dropError.message);
        }
      }
      
      // Also drop any index named 'tags_text' specifically
      const tagsTextIndex = indexes.find(idx => idx.name === 'tags_text');
      if (tagsTextIndex) {
        console.log('[Leak Fix] Dropping specific tags_text index');
        await leaksCollection.dropIndex('tags_text');
      }
      
      // Drop the entire collection and recreate to be sure
      if (textIndexes.length > 0) {
        console.log('[Leak Fix] Dropping entire leaks collection to clear all bad indexes...');
        await leaksCollection.drop();
        console.log('[Leak Fix] Leaks collection dropped successfully');
      }
    } else {
      console.log('[Leak Fix] Leaks collection does not exist yet');
    }
  } catch (error) {
    console.error('[Leak Fix] Error during cleanup:', error);
  }
})();

// Now create the model
const Leak = mongoose.model('Leak', leakSchema);

console.log('[Leak] Model created successfully without text indexes');

// =============================================
// AUTO-FIX: Drop problematic text index on tags field
// =============================================
(async () => {
  try {
    await mongoose.connection.db;
    
    const collections = await mongoose.connection.db.listCollections({ name: 'leaks' }).toArray();
    if (collections.length === 0) {
      console.log('[Leak Fix] Leaks collection does not exist yet, skipping index cleanup');
      return;
    }
    
    const leaksCollection = mongoose.connection.db.collection('leaks');
    const indexes = await leaksCollection.indexes();
    
    // Find and drop any text index (any index with weights property)
    const textIndexes = indexes.filter(idx => idx.weights !== undefined);
    
    for (const textIndex of textIndexes) {
      console.log('[Leak Fix] Dropping text index:', textIndex.name);
      await leaksCollection.dropIndex(textIndex.name);
      console.log('[Leak Fix] Successfully dropped index:', textIndex.name);
    }
    
    if (textIndexes.length === 0) {
      console.log('[Leak Fix] No text indexes found on leaks collection');
    }
    
  } catch (error) {
    console.log('[Leak Fix] Index cleanup note:', error.message);
  }
})();
// =============================================
// PURCHASED LEAK SCHEMA
// =============================================
// Helper function to create a leak safely (bypassing any index issues)
const createLeakSafely = async (leakData) => {
  try {
    // Try normal save first
    const leak = new Leak(leakData);
    return await leak.save();
  } catch (error) {
    // If still getting text index error, try direct collection insert
    if (error.code === 201 && error.message.includes('text index')) {
      console.log('[Leak] Text index error, trying direct insert...');
      
      // Get the raw collection
      const collection = mongoose.connection.db.collection('leaks');
      
      // Insert directly
      const result = await collection.insertOne(leakData);
      
      // Return the inserted document
      return { ...leakData, _id: result.insertedId };
    }
    throw error;
  }
};

const purchasedLeakSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  leakId: { type: String, required: true, ref: 'Leak' },
  username: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  price: { type: Number, required: true },
  paymentReference: { type: String, required: true },
  purchasedAt: { type: Date, default: Date.now }
});

purchasedLeakSchema.index({ username: 1, leakId: 1 });
purchasedLeakSchema.index({ purchasedAt: -1 });

const PurchasedLeak = mongoose.model('PurchasedLeak', purchasedLeakSchema);

// =============================================
// LEAK ROUTES - PUBLIC (No auth required for viewing leaks)
// =============================================

// Get all active leaks (for browsing)
// Get all active leaks (for browsing) - INCLUDES FREE LEAKS
// =============================================
// COMPLETE LEAK ROUTES - ADD TO auth.js
// =============================================



// =============================================
// GET ALL LEAKS (PUBLIC - FOR BROWSING)
// =============================================
// =============================================
// LEAK CONTENT ROUTES - SINGLE CLEAN VERSION
// =============================================

// Get all leaks (for browsing) - PUBLIC
router.get('/leaks', async (req, res) => {
  try {
    const { category, limit = 50, page = 1, search, sortBy = 'newest' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = { 
      status: 'active',
      $or: [
        { isFree: true },
        { price: { $gt: 0 } }
      ]
    };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }
    
    let sort = {};
    switch (sortBy) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'price_low':
        sort = { price: 1 };
        break;
      case 'price_high':
        sort = { price: -1 };
        break;
      case 'popular':
        sort = { purchaseCount: -1, views: -1 };
        break;
      default:
        sort = { createdAt: -1 };
    }
    
    const leaks = await Leak.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const leaksWithCount = leaks.map(leak => ({
      ...leak,
      videoCount: leak.videos?.length || 0,
      isFree: leak.isFree || false,
      views: leak.views || 0
    }));
    
    const totalLeaks = await Leak.countDocuments(query);
    
    console.log(`[Leaks] Returning ${leaksWithCount.length} leaks`);
    
    res.json({
      leaks: leaksWithCount,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalLeaks / limitNum),
        totalLeaks,
        hasNext: pageNum < Math.ceil(totalLeaks / limitNum),
        hasPrev: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error('[Get Leaks] Error:', error);
    res.status(500).json({ message: 'Server error fetching leaks: ' + error.message });
  }
});

// Get single leak by ID - PUBLIC
router.get('/leaks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[Leak Details] Fetching leak: ${id}`);
    
    const leak = await Leak.findOne({ id, status: 'active' }).lean();
    
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    if (leak.isFree) {
      return res.json({ 
        leak: {
          ...leak,
          isFree: true,
          isPurchased: true,
          videoCount: leak.videos?.length || 0,
          views: leak.views || 0
        }
      });
    }
    
    let isPurchased = false;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const purchased = await PurchasedLeak.findOne({
          leakId: id,
          username: decoded.username
        });
        isPurchased = !!purchased;
      } catch (authError) {
        console.log('[Leak Details] User not authenticated');
      }
    }
    
    let responseLeak = { ...leak };
    if (!isPurchased) {
      responseLeak.videos = responseLeak.videos?.map(v => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail,
        duration: v.duration,
        url: null
      })) || [];
      responseLeak.isPurchased = false;
    } else {
      responseLeak.isPurchased = true;
    }
    
    responseLeak.isFree = false;
    responseLeak.videoCount = leak.videos?.length || 0;
    responseLeak.views = leak.views || 0;
    
    res.json({ leak: responseLeak });
    
  } catch (error) {
    console.error('[Get Leak] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Track view for leak - AUTHENTICATED
router.post('/leaks/:leakId/views', authenticateToken, async (req, res) => {
  try {
    const { leakId } = req.params;
    
    console.log(`[Leak View] Tracking view for leak: ${leakId}, user: ${req.user.username}`);
    
    const leak = await Leak.findOne({ id: leakId });
    
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    const newViews = (leak.views || 0) + 1;
    leak.views = newViews;
    await leak.save();
    
    console.log(`[Leak View] Leak ${leakId} now has ${newViews} views`);
    
    res.json({ views: newViews });
    
  } catch (error) {
    console.error('[Leak View] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Track view for leak - PUBLIC (unauthenticated)
router.post('/public/leaks/:leakId/views', async (req, res) => {
  try {
    const { leakId } = req.params;
    
    console.log(`[Leak Public View] Tracking view for leak: ${leakId}`);
    
    const leak = await Leak.findOne({ id: leakId });
    
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    const newViews = (leak.views || 0) + 1;
    leak.views = newViews;
    await leak.save();
    
    console.log(`[Leak Public View] Leak ${leakId} now has ${newViews} views`);
    
    res.json({ views: newViews });
    
  } catch (error) {
    console.error('[Leak Public View] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Check if user purchased a leak
router.get('/leaks/:id/purchased', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    
    const purchased = await PurchasedLeak.findOne({
      leakId: id,
      username: username
    });
    
    res.json({ purchased: !!purchased });
    
  } catch (error) {
    console.error('[Check Purchased] Error:', error);
    res.json({ purchased: false });
  }
});

// Get all purchased leaks for current user
router.get('/leaks/purchased', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    
    console.log(`[User Purchased Leaks] Fetching for user: ${username}`);
    
    const purchases = await PurchasedLeak.find({ username })
      .sort({ purchasedAt: -1 })
      .lean();
    
    const purchasedLeakIds = purchases.map(p => p.leakId);
    
    res.json({ purchasedLeaks: purchasedLeakIds });
    
  } catch (error) {
    console.error('[User Purchased Leaks] Error:', error);
    res.json({ purchasedLeaks: [] });
  }
});

// Get single purchased leak with full access
router.get('/leaks/:id/purchased-content', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    
    const purchase = await PurchasedLeak.findOne({ leakId: id, username });
    if (!purchase) {
      return res.status(403).json({ message: 'You have not purchased this content' });
    }
    
    const leak = await Leak.findOne({ id, status: 'active' }).lean();
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    await Leak.updateOne({ id }, { $inc: { views: 1 } });
    
    res.json({
      leak: {
        ...leak,
        isPurchased: true,
        purchasedAt: purchase.purchasedAt
      }
    });
    
  } catch (error) {
    console.error('[Get Purchased Leak] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Purchase a leak using wallet balance
router.post('/leaks/:id/purchase', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    
    console.log(`[Purchase Leak] User ${username} purchasing leak: ${id}`);
    
    const leak = await Leak.findOne({ id, status: 'active' });
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    if (leak.isFree) {
      return res.status(400).json({ message: 'This content is free' });
    }
    
    const existingPurchase = await PurchasedLeak.findOne({
      leakId: id,
      username: username
    });
    
    if (existingPurchase) {
      return res.status(200).json({ 
        message: 'You have already purchased this content',
        alreadyPurchased: true,
        leakId: id
      });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentBalance = user.balance || 0;
    
    if (currentBalance < leak.price) {
      return res.status(400).json({ 
        message: `Insufficient balance. Need ₦${leak.price.toLocaleString()}, have ₦${currentBalance.toLocaleString()}` 
      });
    }
    
    user.balance = currentBalance - leak.price;
    await user.save();
    
    const purchaseId = crypto.randomBytes(16).toString('hex');
    const purchase = new PurchasedLeak({
      id: purchaseId,
      leakId: leak.id,
      username: username,
      userId: user._id,
      price: leak.price,
      paymentReference: `LEAK_${leak.id}_${username}_${Date.now()}`,
      purchasedAt: new Date()
    });
    
    await purchase.save();
    
    leak.purchaseCount = (leak.purchaseCount || 0) + 1;
    leak.totalRevenue = (leak.totalRevenue || 0) + leak.price;
    await leak.save();
    
    const transaction = new Transaction({
      id: crypto.randomBytes(16).toString('hex'),
      userId: username,
      type: 'wallet_deduction',
      amount: leak.price,
      description: `Purchased leak: ${leak.title}`,
      status: 'completed',
      createdAt: new Date(),
      relatedId: purchaseId
    });
    await transaction.save();
    
    res.json({
      message: `Successfully purchased "${leak.title}"`,
      newBalance: user.balance,
      leakId: leak.id,
      price: leak.price,
      alreadyPurchased: false
    });
    
  } catch (error) {
    console.error('[Purchase Leak] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});


// =============================================
// ADMIN: GET ALL LEAKS (FOR ADMIN PANEL)
// =============================================
router.get('/admin/leaks', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex }
      ];
    }
    
    const leaks = await Leak.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalLeaks = await Leak.countDocuments(query);
    
    res.json({
      leaks,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalLeaks / limitNum),
        totalLeaks,
        hasNext: pageNum < Math.ceil(totalLeaks / limitNum),
        hasPrev: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error('[Admin Get Leaks] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// ADMIN: CREATE NEW LEAK
// =============================================
router.post('/admin/leaks', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      tags,
      isPremium,
      isFree,
      thumbnail,
      videos
    } = req.body;
    
    console.log('[Admin Create Leak] Creating new leak:', { title, price, isFree, videosCount: videos?.length });
    
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    
    const finalPrice = isFree ? 0 : (price || 0);
    
    if (!isFree && (!finalPrice || finalPrice < 0)) {
      return res.status(400).json({ message: 'Valid price is required for paid leaks' });
    }
    
    if (!videos || videos.length === 0) {
      return res.status(400).json({ message: 'At least one video is required' });
    }
    
    const leakId = crypto.randomBytes(16).toString('hex');
    
    const processedVideos = videos.map((video, index) => ({
      ...video,
      id: video.id || crypto.randomBytes(8).toString('hex'),
      order: video.order !== undefined ? video.order : index
    }));
    
    const leak = new Leak({
      id: leakId,
      title: title.trim(),
      description: description || '',
      price: finalPrice,
      category: category || 'exclusive',
      tags: tags || [],
      isPremium: isPremium || false,
      isFree: isFree || false,
      thumbnail: thumbnail || '',
      videos: processedVideos,
      status: 'active',
      views: 0,
      purchaseCount: 0,
      totalRevenue: 0,
      createdBy: req.user.username,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await leak.save();
    
    console.log(`[Admin Create Leak] Success: ${leakId} - ${title}`);
    
    res.status(201).json({
      message: 'Leak created successfully',
      leak: {
        id: leak.id,
        title: leak.title,
        price: leak.price,
        isFree: leak.isFree,
        videoCount: leak.videos.length,
        createdAt: leak.createdAt
      }
    });
    
  } catch (error) {
    console.error('[Admin Create Leak] Error:', error);
    res.status(500).json({ message: 'Server error creating leak: ' + error.message });
  }
});

// =============================================
// ADMIN: UPDATE LEAK
// =============================================
router.put('/admin/leaks/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      category,
      tags,
      isPremium,
      isFree,
      thumbnail,
      videos,
      status
    } = req.body;
    
    console.log(`[Admin Update Leak] Updating leak: ${id}`);
    
    const leak = await Leak.findOne({ id });
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    if (title !== undefined) leak.title = title.trim();
    if (description !== undefined) leak.description = description;
    if (price !== undefined) leak.price = parseFloat(price);
    if (category !== undefined) leak.category = category;
    if (tags !== undefined) leak.tags = tags;
    if (isPremium !== undefined) leak.isPremium = isPremium;
    if (isFree !== undefined) leak.isFree = isFree;
    if (thumbnail !== undefined) leak.thumbnail = thumbnail;
    if (status !== undefined) leak.status = status;
    
    if (videos !== undefined) {
      const processedVideos = videos.map((video, index) => ({
        ...video,
        id: video.id || crypto.randomBytes(8).toString('hex'),
        order: video.order !== undefined ? video.order : index
      }));
      leak.videos = processedVideos;
    }
    
    leak.updatedAt = new Date();
    await leak.save();
    
    console.log(`[Admin Update Leak] Success: ${leak.id}`);
    
    res.json({
      message: 'Leak updated successfully',
      leak: {
        id: leak.id,
        title: leak.title,
        price: leak.price,
        isFree: leak.isFree,
        videoCount: leak.videos.length,
        status: leak.status,
        updatedAt: leak.updatedAt
      }
    });
    
  } catch (error) {
    console.error('[Admin Update Leak] Error:', error);
    res.status(500).json({ message: 'Server error updating leak: ' + error.message });
  }
});

// =============================================
// ADMIN: DELETE LEAK
// =============================================
router.delete('/admin/leaks/:id', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[Admin Delete Leak] Deleting leak: ${id}`);
    
    const leak = await Leak.findOne({ id });
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    await PurchasedLeak.deleteMany({ leakId: id });
    await Leak.deleteOne({ id });
    
    console.log(`[Admin Delete Leak] Success: ${leak.title}`);
    
    res.json({
      message: 'Leak deleted successfully',
      deletedLeak: {
        id: leak.id,
        title: leak.title
      }
    });
    
  } catch (error) {
    console.error('[Admin Delete Leak] Error:', error);
    res.status(500).json({ message: 'Server error deleting leak: ' + error.message });
  }
});

// =============================================
// ADMIN: TOGGLE LEAK STATUS
// =============================================
router.patch('/admin/leaks/:id/status', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Valid status (active/inactive) is required' });
    }
    
    const leak = await Leak.findOne({ id });
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    leak.status = status;
    leak.updatedAt = new Date();
    await leak.save();
    
    console.log(`[Admin Toggle Status] Leak ${leak.title} -> ${status}`);
    
    res.json({
      message: `Leak ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      leak: {
        id: leak.id,
        title: leak.title,
        status: leak.status
      }
    });
    
  } catch (error) {
    console.error('[Admin Toggle Status] Error:', error);
    res.status(500).json({ message: 'Server error toggling status: ' + error.message });
  }
});

// =============================================
// ADMIN: GET LEAK STATISTICS
// =============================================
router.get('/admin/leaks/stats', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const totalLeaks = await Leak.countDocuments();
    const activeLeaks = await Leak.countDocuments({ status: 'active' });
    const inactiveLeaks = await Leak.countDocuments({ status: 'inactive' });
    const freeLeaks = await Leak.countDocuments({ isFree: true });
    const paidLeaks = await Leak.countDocuments({ isFree: false, price: { $gt: 0 } });
    
    const totalRevenue = await Leak.aggregate([
      { $group: { _id: null, total: { $sum: '$totalRevenue' } } }
    ]);
    
    const totalPurchases = await Leak.aggregate([
      { $group: { _id: null, total: { $sum: '$purchaseCount' } } }
    ]);
    
    const totalViews = await Leak.aggregate([
      { $group: { _id: null, total: { $sum: '$views' } } }
    ]);
    
    const popularLeaks = await Leak.find({ status: 'active' })
      .sort({ purchaseCount: -1, views: -1 })
      .limit(5)
      .select('id title price purchaseCount views isFree')
      .lean();
    
    const recentPurchases = await PurchasedLeak.find()
      .sort({ purchasedAt: -1 })
      .limit(10)
      .populate('leakId', 'title')
      .lean();
    
    res.json({
      totalLeaks,
      activeLeaks,
      inactiveLeaks,
      freeLeaks,
      paidLeaks,
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
      totalPurchases: totalPurchases.length > 0 ? totalPurchases[0].total : 0,
      totalViews: totalViews.length > 0 ? totalViews[0].total : 0,
      popularLeaks,
      recentPurchases: recentPurchases.map(p => ({
        username: p.username,
        leakTitle: p.leakId?.title || 'Unknown',
        price: p.price,
        purchasedAt: p.purchasedAt
      }))
    });
    
  } catch (error) {
    console.error('[Admin Leak Stats] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// DEBUG: CHECK LEAK DATABASE
// =============================================
router.get('/debug/leaks-check', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const leakCount = await Leak.countDocuments();
    const purchaseCount = await PurchasedLeak.countDocuments();
    const sampleLeaks = await Leak.find().limit(5).lean();
    
    res.json({
      leakCollectionExists: true,
      leakCount,
      purchaseCount,
      sampleLeaks: sampleLeaks.map(l => ({
        id: l.id,
        title: l.title,
        price: l.price,
        isFree: l.isFree,
        views: l.views || 0,
        videoCount: l.videos?.length || 0,
        status: l.status
      }))
    });
  } catch (error) {
    res.json({
      error: error.message,
      leakCollectionExists: false
    });
  }
});
// =============================================
// USER PURCHASED LEAKS ENDPOINT
// =============================================

// =============================================
// USER PURCHASED LEAKS ENDPOINT - FIXED
// =============================================

router.get('/api/auth/leaks/purchased', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    
    console.log(`[User Purchased Leaks] Fetching for user: ${username}`);
    
    const purchases = await PurchasedLeak.find({ username })
      .sort({ purchasedAt: -1 })
      .lean();
    
    // Just return the array of leak IDs (what the frontend expects)
    const purchasedLeakIds = purchases.map(p => p.leakId);
    
    console.log(`[User Purchased Leaks] Found ${purchasedLeakIds.length} purchased leaks`);
    
    res.json({ purchasedLeaks: purchasedLeakIds });
    
  } catch (error) {
    console.error('[User Purchased Leaks] Error:', error);
    res.json({ purchasedLeaks: [] });
  }
});

// Get single purchased leak with full video access
router.get('/api/auth/leaks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    
    // Check if user has purchased this leak
    const purchase = await PurchasedLeak.findOne({ leakId: id, username });
    if (!purchase) {
      return res.status(403).json({ message: 'You have not purchased this content' });
    }
    
    const leak = await Leak.findOne({ id, status: 'active' }).lean();
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    // Increment view count
    await Leak.updateOne({ id }, { $inc: { views: 1 } });
    
    res.json({
      leak: {
        ...leak,
        isPurchased: true,
        purchasedAt: purchase.purchasedAt
      }
    });
    
  } catch (error) {
    console.error('[Get Purchased Leak] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// =============================================
// LEAK VIEW TRACKING ENDPOINT
// =============================================

// Track view for a leak (increments view count)
router.post('/api/auth/leaks/:leakId/views', authenticateToken, async (req, res) => {
  try {
    const { leakId } = req.params;
    
    console.log(`[Leak View] Tracking view for leak: ${leakId}, user: ${req.user.username}`);
    
    // Find the leak and increment view count
    const leak = await Leak.findOne({ id: leakId });
    
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    // Increment view count
    const newViews = (leak.views || 0) + 1;
    leak.views = newViews;
    await leak.save();
    
    console.log(`[Leak View] Leak ${leakId} now has ${newViews} views`);
    
    res.json({ views: newViews });
    
  } catch (error) {
    console.error('[Leak View] Error:', error);
    res.status(500).json({ message: 'Server error tracking view: ' + error.message });
  }
});

// Public view tracking for leaks (unauthenticated users)
router.post('/api/auth/public/leaks/:leakId/views', async (req, res) => {
  try {
    const { leakId } = req.params;
    
    console.log(`[Leak Public View] Tracking view for leak: ${leakId}`);
    
    const leak = await Leak.findOne({ id: leakId });
    
    if (!leak) {
      return res.status(404).json({ message: 'Leak not found' });
    }
    
    const newViews = (leak.views || 0) + 1;
    leak.views = newViews;
    await leak.save();
    
    console.log(`[Leak Public View] Leak ${leakId} now has ${newViews} views`);
    
    res.json({ views: newViews });
    
  } catch (error) {
    console.error('[Leak Public View] Error:', error);
    res.status(500).json({ message: 'Server error tracking view: ' + error.message });
  }
});


module.exports = router;
