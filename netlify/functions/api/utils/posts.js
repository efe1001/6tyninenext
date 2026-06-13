const { Post } = require('../models');

const extractHashtags = (text = '') => {
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  return matches.map(tag => tag.slice(1).toLowerCase());
};

const extractUserMentions = (text = '') => {
  const matches = text.match(/@[a-zA-Z0-9_]+/g) || [];
  return matches.map(mention => mention.slice(1).toLowerCase());
};

const createPost = async ({ text, username, images = [], videos = [], timestamp, isPremium = false, hashtags, userMentions }) => {
  const lastPost = await Post.findOne().sort({ id: -1 }).lean();
  const newId = lastPost ? (lastPost.id || 0) + 1 : 1;

  const post = new Post({
    id: newId,
    text,
    username,
    images: Array.isArray(images) ? images : [],
    videos: Array.isArray(videos) ? videos : [],
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    isPremium,
    hashtags: Array.isArray(hashtags) ? hashtags : extractHashtags(text),
    userMentions: Array.isArray(userMentions) ? userMentions : extractUserMentions(text),
    likes: [],
    comments: [],
    views: 0,
  });

  await post.save();
  return post;
};

// Interleave admin posts every 6th position in the feed
const insertAdminPosts = (publicPosts, adminPosts) => {
  if (!adminPosts || adminPosts.length === 0) return publicPosts;
  const result = [];
  let adminIndex = 0;
  for (let i = 0; i < publicPosts.length; i++) {
    result.push(publicPosts[i]);
    if ((i + 1) % 6 === 0 && adminIndex < adminPosts.length) {
      result.push(adminPosts[adminIndex++]);
    }
  }
  return result;
};

module.exports = { createPost, extractHashtags, extractUserMentions, insertAdminPosts };
