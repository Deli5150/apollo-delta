# Changelog

## [1.0.4] - 2026-11-24

- Summarize Comments on Mac and Windows: the same summaries as on Android, written on your computer by the same free open-source model (Qwen2.5 1.5B), so nothing is sent anywhere. It's a one-time 1.1 GB download the first time; Settings can delete it. Stop, folding and the guard against repeating work the same way.
- Save Video on Mac and Windows keeps the sound of videos hosted on Reddit, as on Android.
- Messages like "Image copied" now show over the full-screen viewer on Mac and Windows too.
- Summaries no longer quote upvote counts like "[412]".

## [1.0.3] - 2026-11-24

- Replying no longer closes the app on Android. Reddit sometimes answers a new reply without its author or text, and showing that reply crashed the app; it now fills them in from what you wrote. If a page ever hits a problem, you get a "Something went wrong" screen with Try Again and Report It, instead of the app closing (#10).
- Writing a reply on phones: the text box fills the screen, so you can tap anywhere to start typing; the formatting toolbar stays above the keyboard; and Send is at the right of the toolbar, just above the keyboard (#9).
- Save pictures and videos (Android): Share in the full-screen viewer now has Save Picture / Save Video, which saves to your gallery. Videos from Reddit keep their sound, both when saved and when shared as a file (#8).
- Swiping over the empty space around a picture or video in the viewer goes to the next or previous one instead of closing the viewer. Only a tap closes it (#11).
- Summarize Comments: the summary no longer gets stuck repeating a word. If the model starts looping anyway, it's stopped and you keep what it wrote before. There's a Stop button while it writes, and once it's done, tap its title to fold it away and back (#7).
- Messages like "Picture saved" now show over the full-screen viewer on Android.

## [1.0.2] - 2026-11-23

- Summarize Comments (Android): under a post's comments, get a short summary of what everyone is saying. It's written on your phone by Qwen2.5 1.5B, a free open-source AI model, so nothing is sent anywhere. The model is a one-time 1.1 GB download the first time; Settings → General can delete it (#5).
- Swipe between pictures and posts: in the full-screen viewer on phones, swipe left or right anywhere to go to the next or previous picture, video or post, in Gallery View and in posts with several pictures. The arrow buttons are desktop-only now (#2).
- Share from the viewer (Android): a Share button in the corner shares the post's link or the picture or video itself. In Gallery View it replaces the comments button; the bar at the bottom still opens the comments (#3, #4).
- Turn your phone sideways while viewing pictures and videos for a bigger view (#4).
- Open Reddit links in Apollo Delta (Android): share a Reddit link to Apollo Delta to open it here. To have links from other apps and your browser open here too, use Settings → General → Open Reddit Links Here (#6).
- New app icons: eight art styles (Pixel Art, Watercolour, Oil Paint, Neon Sign, Paper Cut-Out, Blueprint, Stained Glass, Synthwave) and five new colours (Ember, Ocean, Forest, Gold, Sakura) in Settings → App Icon. On Android the icon now changes too (when you leave the app); on Windows it shows on the taskbar.

## [1.0.1] - 2026-11-20

- Gallery View on phones: a picture no longer opens with the comments stuck open after you closed the viewer with the comments up (#1).
- Send Feedback on phones: the description now reaches GitHub. The form opens in a browser tab inside the app instead of the GitHub app, which kept only the title; the description is also copied, in case anything still leaves it out.

## [1.0.0] - 2026-11-20

- Apollo Delta: a Reddit client inspired by Apollo, for Mac, Windows and Android.
- No API key: sign in on Reddit itself (or with Google) and browse with that session.
- Feeds, comments, inbox, search, profiles, multireddits and favorites.
- Large and compact posts, galleries, videos, GIFs, inline media and rich link previews.
- Desktop: three panes (subreddits, feed, comments), Gallery View with the arrow keys and the comments beside the picture.
- Android: a floating dock on every page, pinch and double-tap to zoom pictures, pinch Gallery View for more or fewer columns, comments that slide up from the bottom.
- New Comments Highlightifier, jump button, translation, saved categories, recently read.
- Several accounts, each with its own settings.
- Themes, app icons, filters, tag filters, backup and restore, in-app updates.
