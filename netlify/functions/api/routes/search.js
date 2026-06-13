// search.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');

// Middleware
const authenticateToken = require('../middleware/auth').authenticateToken;

// Helper functions
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

// =============================================
// SEARCH ROUTES - LOGGED IN USERS
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

// Search location (combined users and posts)
router.get('/search/location/:query', authenticateToken, async (req, res) => {
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

// =============================================
// LOCATION-BASED POST ROUTES
// =============================================

// Get posts by location
router.get('/posts/location/:location', authenticateToken, async (req, res) => {
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

// Get ALL posts from location users
router.get('/location/:query/posts-all', authenticateToken, async (req, res) => {
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

// Enhanced: Get comprehensive location search results
router.get('/api/search/location/:query', authenticateToken, async (req, res) => {
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

// Enhanced comprehensive search with ALL posts
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

module.exports = router;