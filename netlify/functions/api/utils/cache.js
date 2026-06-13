const store = new Map();

const cache = {
  get: (key) => store.get(key),
  set: (key, value, ttlSeconds = 300) => {
    store.set(key, value);
    setTimeout(() => store.delete(key), ttlSeconds * 1000);
  },
  del: (key) => store.delete(key),
  clear: () => store.clear(),
};

module.exports = { cache };
