const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const authMiddleware = require('../middleware/authMiddleware');

// Get comments for a post
router.get('/:postId', async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.postId }).populate('user', 'name');
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a comment (protected)
router.post('/:postId', authMiddleware, async (req, res) => {
  const { text } = req.body;

  try {
    const newComment = new Comment({
      text,
      user: req.user.userId,
      post: req.params.postId,
    });
    await newComment.save();
    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;