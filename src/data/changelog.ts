// What's New, newest first (CHANGELOG.md has the same notes for GitHub releases).

export const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
  {
    version: '1.0.3',
    date: 'November 2026',
    notes: [
      'Replying no longer closes the app on Android. If a page ever hits a problem, you get a screen to try again or report it instead.',
      'Writing a reply on phones: the text box fills the screen, the toolbar stays above the keyboard, and Send sits right above the keyboard.',
      'Save pictures and videos to your gallery from Share in the full-screen viewer. Videos from Reddit keep their sound.',
      'Swiping over the empty space in the viewer goes to the next or previous picture instead of closing it.',
      'Summarize Comments no longer gets stuck repeating a word, has a Stop button, and folds away when you tap its title.'
    ]
  },
  {
    version: '1.0.2',
    date: 'November 2026',
    notes: [
      'Summarize Comments (Android): a short summary of a post’s comments, written on your phone by a free open-source AI model. The first time, it’s a one-time 1.1 GB download.',
      'Swipe left or right in the full-screen viewer to go to the next or previous picture, video or post.',
      'Share from the full-screen viewer: the post’s link, or the picture or video itself.',
      'Turn your phone sideways while viewing pictures and videos.',
      'Open Reddit links in Apollo Delta: share a link to it, or turn on Open Reddit Links Here in Settings → General.',
      'New app icons: eight art styles and five new colours, in Settings → App Icon. Android now changes its icon too.'
    ]
  },
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
