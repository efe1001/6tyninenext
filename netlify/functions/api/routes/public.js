// public.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const NodeCache = require('node-cache');

// Initialize cache
const cache = new NodeCache({ stdTTL: 300 });

// Helper functions
const insertAdminPosts = (posts, adminPosts) => {
  if (!adminPosts || adminPosts.length === 0) {
    console.log('[AdminPosts] No admin posts to insert');
    return posts;
  }

  const result = [];
  let adminPostIndex = 0;
  let regularPostCount = 0;

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
      
      console.log(`[AdminPosts] Inserting admin post at position ${result.length + 1}`);
      
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

// =============================================
// PUBLIC ROUTES FOR NON-LOGGED-IN USERS
// =============================================

// Public posts with admin posts inserted every 6 posts
router.get('/public/posts', async (req, res) => {
  const cacheKey = 'public_posts_with_admin';
  const bypassCache = req.query.bypassCache === 'true';
  const cachedPosts = !bypassCache ? cache.get(cacheKey) : null;

  if (cachedPosts) {
    console.log('[Public Posts] Returning cached posts with admin posts');
    return res.json(cachedPosts);
  }

  try {
    console.log('[Public Posts] Fetching fresh public posts with admin posts for ALL users...');

    // Get ALL public posts (non-premium)
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    console.log('[Public Posts] Raw public posts from database:', publicPosts.length);
    
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
      .lean();
      
      console.log('[Public Posts] Admin posts found:', adminPosts.length);
    }

    // Insert admin posts every 6th post for ALL users
    let allPosts = publicPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
      console.log('[Public Posts] After admin post insertion:', allPosts.length);
    }

    if (!bypassCache) {
      cache.set(cacheKey, allPosts, 300);
    }

    console.log('[Public Posts] Returning posts with admin posts to client:', allPosts.length);
    res.json(allPosts);
  } catch (error) {
    console.error('[Public Posts] Error:', error);
    cache.del(cacheKey);
    res.status(500).json({ message: 'Server error fetching public posts: ' + error.message });
  }
});

// Get ALL posts without limits (public)
router.get('/public/posts/unlimited', async (req, res) => {
  try {
    console.log('[Public Posts Unlimited] Fetching ALL public posts without limits...');
    
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

// Public get single post by ID
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
            _id: userPost._id || userPost.id,
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

// =============================================
// PUBLIC USER ROUTES
// =============================================

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

// Public get user profile with bio and location
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
    
    // Check if phone should be hidden for unlogged users
    const shouldHidePhone = (visibility !== 'all_users'); // Hide for unlogged users if not 'all_users'
    
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

// Public user profile
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
// PUBLIC SEARCH ROUTES
// =============================================

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

// Public location search with combined results
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
    .select('username profilePicture firstName lastName name location city country state bio userType followers following subscribers')
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
// PUBLIC HASHTAG SEARCH
// =============================================

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

// Enhanced public hashtag search
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

// =============================================
// PUBLIC BULK OPERATIONS
// =============================================

// Fetch posts by multiple usernames (public)
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

// Get bulk user types (public)
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

// Public view count for regular posts
router.post('/public/posts/:postId/views', async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.views += 1;
    await post.save();
    
    // Also update in user's posts array for consistency
    const user = await User.findOne({ username: post.username });
    if (user) {
      const userPost = user.posts.find(p => p.id === Number(postId));
      if (userPost) {
        userPost.views += 1;
        await user.save();
      }
    }
    
    res.json({ 
      views: post.views,
      message: 'View counted successfully'
    });
  } catch (error) {
    console.error('[Public View Count] Error:', error);
    res.status(500).json({ message: 'Server error counting view: ' + error.message });
  }
});

// Public view count for premium posts (limited access)
router.post('/public/premium-posts/:postId/views', async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Find the user who owns this premium post
    const users = await User.find({}).select('username premiumContent').lean();
    
    let premiumPost = null;
    let postOwner = null;
    
    for (const user of users) {
      if (!user.premiumContent || !Array.isArray(user.premiumContent)) continue;
      
      const foundPost = user.premiumContent.find(p => 
        p.id === postId || p.id?.toString() === postId
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
    
    // Update view count
    premiumPost.views = (premiumPost.views || 0) + 1;
    
    // Save back to database
    await User.updateOne(
      { username: postOwner.username, 'premiumContent.id': premiumPost.id || premiumPost._id },
      { $set: { 'premiumContent.$.views': premiumPost.views } }
    );
    
    res.json({ 
      views: premiumPost.views,
      message: 'Premium post view counted successfully'
    });
  } catch (error) {
    console.error('[Public Premium View Count] Error:', error);
    res.status(500).json({ message: 'Server error counting premium post view: ' + error.message });
  }
});

module.exports = router;