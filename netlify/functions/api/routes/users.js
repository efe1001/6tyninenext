// routes/users.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { User } = require('../models');
const { authenticateToken } = require('../middleware');
const { checkSubscriptionStatus } = require('../utils/subscriptions');
const { shouldHidePhoneForUser } = require('../utils/phoneVisibility');
const { updateUserOnlineStatus, updateUserOfflineStatus } = require('../utils/userStatus');

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

// Get current user profile
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

// Get all users
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

// Search users
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

// Get user by username
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
      numbersVisibility: user.numbersVisibility || 'all_users'
    };
    delete userDetails.website;

    // Check if requester is viewing their own profile
    const isProfileOwner = user.email === req.user.email;
    
    if (!isProfileOwner) {
      // For non-owners, check if we need to hide phone number based on visibility setting
      const shouldHidePhoneNumber = await shouldHidePhoneForUser(
        user.username,
        req.user.username,
        user.numbersVisibility || 'all_users'
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

// Update user route
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

    // Handle userType
    if (updateData.userType && ['content_creator', 'escort', 'both'].includes(updateData.userType)) {
      console.log('[Update User] Setting userType to:', updateData.userType);
      user.userType = updateData.userType;
    }

    // Handle numbersVisibility
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
      updatedUser.numbersVisibility = 'all_users';
    }

    console.log('[Update User] User saved successfully');
    res.json(updatedUser);
  } catch (error) {
    console.error('[Update User] Error:', error);
    res.status(500).json({ message: 'Server error updating user: ' + error.message });
  }
});

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
     
      // Send notification to the user being followed
      const { sendNotificationToUser } = require('../utils/notifications');
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
    res.status(500).json({ message: 'Server error unfollowing user: ' + error.message });
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
    const { Post } = require('../models');
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
      }
    };

    console.log('[User Profile Full] Found user:', enhancedUser.username);
    res.json(enhancedUser);
  } catch (error) {
    console.error('[User Profile Full] Error:', error);
    res.status(500).json({ message: 'Server error fetching user profile: ' + error.message });
  }
});

// Get users with bio and location
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

// Update phone number visibility setting
router.put('/users/:username/phone-visibility', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const { numbersVisibility } = req.body;
    
    if (!numbersVisibility || !['all_users', 'subscribers_only', 'followers_only', 'non'].includes(numbersVisibility)) {
      return res.status(400).json({ 
        message: 'Valid visibility setting required (all_users, subscribers_only, followers_only, non)' 
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
      user.numbersVisibility || 'all_users'
    );
    
    if (shouldHidePhone && !isProfileOwner) {
      return res.status(403).json({ 
        message: 'Phone number not available based on user privacy settings',
        numbersVisibility: user.numbersVisibility || 'all_users'
      });
    }
    
    res.json({
      username: user.username,
      phoneNumber: user.phoneNumber || '',
      numbersVisibility: user.numbersVisibility || 'all_users'
    });
    
  } catch (error) {
    console.error('[Get Phone] Error:', error);
    res.status(500).json({ message: 'Server error fetching phone number: ' + error.message });
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

// User status tracking endpoints
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

module.exports = router;