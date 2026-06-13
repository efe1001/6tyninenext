const express = require('express');
const router = express.Router();
const crypto = require('crypto');

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

// Debug route to check user data
router.get('/debug/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log(`[Debug User] Checking user data for: ${username}`);
    
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

// Test public post endpoint
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

// Test email endpoint
router.post('/test-email', async (req, res) => {
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

// Add this route to debug available endpoints
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

// Test phone visibility
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

module.exports = router;