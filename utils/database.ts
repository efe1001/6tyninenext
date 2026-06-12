import Dexie from 'dexie'

class SocialDatabase extends Dexie {
  seenPosts!: Dexie.Table<any, string>
  postInteractions!: Dexie.Table<any, string>
  cachedPosts!: Dexie.Table<any, string>
  userPreferences!: Dexie.Table<any, string>
  videos!: Dexie.Table<any, string>

  constructor() {
    super('SocialAppDB')
    this.version(1).stores({
      seenPosts: '&postId, timestamp, username, postDate',
      postInteractions: '&id, postId, userId, type, timestamp',
      cachedPosts: '&id, timestamp, username, likes, comments',
      userPreferences: '&userId, preferences',
      videos: '&url, blobUrl, timestamp',
    })
  }

  async markPostSeen(postId: string, username = 'anonymous') {
    if (!postId) return
    await this.seenPosts.put({ postId, username, timestamp: Date.now(), postDate: Date.now() }).catch(() => {})
  }

  async getSeenPostIds(maxAgeDays = 7): Promise<Set<string>> {
    try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
      const seen = await this.seenPosts.where('timestamp').above(cutoff).toArray()
      return new Set(seen.map((s: any) => s.postId))
    } catch { return new Set() }
  }

  async filterUnseenPosts(posts: any[], maxAgeDays = 7): Promise<any[]> {
    const seenIds = await this.getSeenPostIds(maxAgeDays)
    return posts.filter(p => !seenIds.has(p.id || p._id || `${p.username}-${p.timestamp}`))
  }

  async runMaintenance(): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    await this.seenPosts.where('timestamp').below(cutoff).delete().catch(() => {})
    await this.postInteractions.where('timestamp').below(cutoff).delete().catch(() => {})
  }
}

let _db: SocialDatabase | null = null

export const getDb = (): SocialDatabase | null => {
  if (typeof window === 'undefined') return null
  if (!_db) {
    _db = new SocialDatabase()
    _db.runMaintenance()
  }
  return _db
}

// Named export matching original usage: import { db } from '@/utils/database'
export const db = typeof window !== 'undefined' ? (() => {
  const instance = new SocialDatabase()
  instance.runMaintenance()
  return instance
})() : null as any
