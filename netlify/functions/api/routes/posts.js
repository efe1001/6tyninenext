// routes/posts.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { User, Post } = require('../models');
const { authenticateToken } = require('../middleware');
const { createPost, extractHashtags, extractUserMentions, insertAdminPosts } = require('../utils/posts');
const { checkSubscriptionStatus } = require('../utils/subscriptions');
const { sendNotificationToUser } = require('../utils/notifications');

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

    const newPost = await createPost({ 
      text, 
      username, 
      images, 
      videos, 
      timestamp, 
      isPremium, 
      hashtags, 
      userMentions 
    });
    
    // Clear cache
    const { cache } = require('../utils/cache');
    cache.del('public_posts');
    
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
    post.userMentions = Array.isArray(userMentions) ? userMentions : extractUserMentions(text);

    await post.save();

    const userPost = user.posts.find((p) => p.id === Number(postId));
    if (userPost) {
      userPost.text = post.text;
      userPost.images = post.images;
      userPost.videos = post.videos;
      userPost.isPremium = post.isPremium;
      userPost.hashtags = post.hashtags;
      userPost.userMentions = post.userMentions;
      await user.save();
    }

    // Clear cache
    const { cache } = require('../utils/cache');
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

    // Clear cache
    const { cache } = require('../utils/cache');
    cache.del('public_posts');
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[Delete Post] Error:', error);
    res.status(500).json({ message: 'Server error deleting post: ' + error.message });
  }
});

// Like post route
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
      isLiked: !alreadyLiked
    });

  } catch (error) {
    console.error('[Like Post] Error:', error);
    res.status(500).json({ message: 'Server error liking post: ' + error.message });
  }
});

// Unlike post route
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

// Comment on post
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

    const post = await Post.findOne({ id: Number(postId) });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const comment = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    post.comments.push(comment);
    await post.save();

    // Update in user's posts as well
    const postOwner = await User.findOne({ username: post.username });
    if (postOwner) {
      const userPost = postOwner.posts.find(p => p.id === Number(postId));
      if (userPost) {
        userPost.comments.push(comment);
        await postOwner.save();
      }
    }
   
    // Send notification to post owner about comment
    if (post.username !== username) {
      try {
        await sendNotificationToUser(
          post.username,
          'New Comment!',
          `${username} commented on your post: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          { type: 'post_comment', postId: postId, commenter: username }
        );
      } catch (notifError) {
        console.log('[FCM] Comment notification failed (non-critical):', notifError);
      }
    }
   
    // Return the updated post with consistent data
    res.json({
      ...post.toObject(),
      comments: post.comments,
    });
  } catch (error) {
    console.error('[Comment Post] Error:', error);
    res.status(500).json({ message: 'Server error commenting on post: ' + error.message });
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

// Create premium post
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
    premiumPost.userMentions = Array.isArray(userMentions) ? userMentions : extractUserMentions(text);

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

// Like premium post route
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
      isLiked: !alreadyLiked
    });

  } catch (error) {
    console.error('[Like Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error liking premium post: ' + error.message });
  }
});

// Comment on premium post
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
   
    // Return the full updated premiumPost for frontend to sync comments/likes properly
    res.json({
      ...premiumPost,
      comments: premiumPost.comments,
    });
  } catch (error) {
    console.error('[Comment Premium Post] Error:', error);
    res.status(500).json({ message: 'Server error commenting on premium post: ' + error.message });
  }
});

// Increment premium post views
router.post('/premium-posts/:postId/views', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const username = req.user.username;

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
      return res.status(403).json({ message: 'Must be subscribed or profile owner to view premium post' });
    }

    premiumPost.views = (premiumPost.views || 0) + 1;
    await postOwner.save();
    
    res.json({ views: premiumPost.views });
  } catch (error) {
    console.error('[Premium Post Views] Error:', error);
    res.status(500).json({ message: 'Server error incrementing premium post views: ' + error.message });
  }
});

// Search posts by hashtag
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

// Search posts by user mention
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

// Get ALL posts without limits
router.get('/posts/unlimited', authenticateToken, async (req, res) => {
  try {
    console.log('[Posts Unlimited] Fetching ALL posts...');
    
    const publicPosts = await Post.find({ isPremium: false })
      .sort({ timestamp: -1 })
      .lean();

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
      .lean();
    }

    // Insert admin posts every 6th post
    let allPosts = publicPosts;
    if (adminPosts.length > 0) {
      allPosts = insertAdminPosts(publicPosts, adminPosts);
    }

    console.log(`[Posts Unlimited] Returning ${allPosts.length} posts`);
    res.json({ posts: allPosts });
  } catch (error) {
    console.error('[Posts Unlimited] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

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

// Test public post creation
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
    
    // Clear cache
    const { cache } = require('../utils/cache');
    cache.del('public_posts');
    
    res.status(201).json(newPost);
  } catch (error) {
    console.error('[Test Public Post] Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});




module.exports = router;