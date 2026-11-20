// What's New, newest first (CHANGELOG.md has the same notes for GitHub releases).

export const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
  {
    version: '1.0.1',
    date: 'November 2026',
    notes: [
      'Gallery View on phones: a picture no longer opens with the comments stuck open after you closed the viewer with the comments up.',
      'Send Feedback on phones: your description now reaches GitHub (the form opens in a browser tab inside the app, and the description is also copied).'
    ]
  },
  {
    version: '1.0.0',
    date: 'November 2026',
    notes: [
      'Apollo Delta: a Reddit client inspired by Apollo, for Mac, Windows and Android.',
      'No API key: sign in on Reddit itself and browse with that session.',
      'Feeds, comments, inbox, search, profiles, multireddits and favorites.',
      'Large and compact posts, galleries, videos, GIFs, inline media and rich link previews.',
      'New Comments Highlightifier, jump button, translation, saved categories, recently read.',
      'Themes, app icons, filters, tag filters, backup and restore, in-app updates.'
    ]
  }
]
