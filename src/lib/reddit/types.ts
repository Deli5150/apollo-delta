// Reddit's things, trimmed to what the app shows. Built from the raw JSON in parse.ts.

export type Vote = 1 | 0 | -1

export interface Flair {
  text: string
  bg?: string
  color?: 'light' | 'dark'
  /** Emoji flairs: image parts, in order with the text parts. */
  parts?: Array<{ t: 'text'; v: string } | { t: 'emoji'; url: string }>
}

export interface MediaImage {
  url: string
  width: number
  height: number
  /** Smaller sizes, small to large. */
  previews?: Array<{ url: string; width: number; height: number }>
  caption?: string
  link?: string
  /** An animated image's MP4 (Reddit converts GIFs). */
  mp4?: string
}

export type Media =
  | { kind: 'image'; image: MediaImage }
  | { kind: 'gif'; image: MediaImage; mp4?: string }
  | { kind: 'gallery'; items: MediaImage[] }
  | { kind: 'video'; hls?: string; dash?: string; mp4?: string; width: number; height: number; poster?: string; duration?: number; gif?: boolean }
  | { kind: 'youtube'; id: string; poster?: string; start?: number }
  | { kind: 'embed'; html?: string; url: string; poster?: string; provider?: string }
  | { kind: 'imgur-album'; id: string; poster?: string }
  | { kind: 'link'; url: string; domain: string; thumb?: string }
  | { kind: 'none' }

export interface Post {
  kind: 't3'
  id: string
  name: string
  title: string
  author: string
  authorId?: string
  authorFlair?: Flair
  authorIsOp?: boolean
  distinguished?: 'moderator' | 'admin' | null
  subreddit: string
  subredditId: string
  subredditIcon?: string
  score: number
  upvoteRatio?: number
  numComments: number
  created: number
  edited?: number
  permalink: string
  url: string
  domain: string
  isSelf: boolean
  selftext: string
  selftextHtml?: string
  thumbnail?: string
  media: Media
  flair?: Flair
  nsfw: boolean
  spoiler: boolean
  stickied: boolean
  pinned: boolean
  locked: boolean
  archived: boolean
  saved: boolean
  hidden: boolean
  likes: Vote
  awards: number
  crosspost?: Post
  isOwn?: boolean
  removed?: boolean
  deleted?: boolean
  suggestedSort?: string
  isGallery?: boolean
  pollOptions?: Array<{ text: string; votes?: number }>
  pollTotal?: number
  /** Reddit's own media map (inline images in self posts). */
  mediaMetadata?: Record<string, MediaImage>
}

export interface Comment {
  kind: 't1'
  id: string
  name: string
  parentId: string
  linkId: string
  author: string
  authorId?: string
  authorFlair?: Flair
  isSubmitter: boolean
  distinguished?: 'moderator' | 'admin' | null
  body: string
  bodyHtml: string
  score: number
  scoreHidden: boolean
  created: number
  edited?: number
  depth: number
  likes: Vote
  saved: boolean
  stickied: boolean
  locked: boolean
  collapsedByReddit: boolean
  controversial: boolean
  awards: number
  replies: Array<Comment | More>
  mediaMetadata?: Record<string, MediaImage>
  /** Comments in a user's history and the inbox: the post they're on. */
  linkTitle?: string
  linkPermalink?: string
  subreddit: string
  permalink: string
  deleted?: boolean
}

export interface More {
  kind: 'more'
  id: string
  name: string
  parentId: string
  depth: number
  count: number
  children: string[]
}

export interface Subreddit {
  name: string
  displayName: string
  title: string
  icon?: string
  banner?: string
  color?: string
  subscribers: number
  active?: number
  description: string
  descriptionHtml?: string
  publicDescription: string
  nsfw: boolean
  subscribed: boolean
  created: number
  type: string
  isUser?: boolean
  submitText?: string
  allowImages?: boolean
  allowVideos?: boolean
  allowGalleries?: boolean
  allowPolls?: boolean
  linkFlairEnabled?: boolean
  wikiEnabled?: boolean
  userIsModerator?: boolean
}

export interface User {
  name: string
  id: string
  icon?: string
  banner?: string
  linkKarma: number
  commentKarma: number
  totalKarma: number
  created: number
  isFriend?: boolean
  isMod?: boolean
  isGold?: boolean
  verified?: boolean
  description?: string
  title?: string
  isBlocked?: boolean
  acceptsFollowers?: boolean
  suspended?: boolean
}

export interface Message {
  kind: 't4' | 't1'
  id: string
  name: string
  author: string
  dest: string
  subject: string
  body: string
  bodyHtml: string
  created: number
  isNew: boolean
  /** Comment replies and mentions: which kind (`comment reply`, `post reply`, `username mention`). */
  type?: string
  context?: string
  linkTitle?: string
  subreddit?: string
  parentId?: string
  firstMessageName?: string
  replies?: Message[]
  likes?: Vote
  score?: number
  distinguished?: string | null
}

export interface Multi {
  name: string
  displayName: string
  path: string
  owner: string
  subreddits: string[]
  icon?: string
  color?: string
  description?: string
}

export interface Trophy {
  name: string
  icon: string
  description?: string
  url?: string
}

export interface Listing<T> {
  items: T[]
  after: string | null
  before?: string | null
}

export type Thing = Post | Comment

export type Sort = 'best' | 'hot' | 'new' | 'top' | 'rising' | 'controversial'
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
export type CommentSort = 'confidence' | 'top' | 'new' | 'controversial' | 'old' | 'qa'
