const MP4Box = require('mp4box')

// Save Video with its sound (issue #8, as on Android): Reddit keeps a video's picture and sound in
// separate MP4 files (often fragmented, DASH/CMAF). This puts the first video track of one and the
// first audio track of the other into one plain MP4, copying the samples as they are (no
// re-encoding), with mp4box.js.

/** Reads `buf` and returns its first track of `kind` with its samples and sample description. */
function readTrack(buf, kind) {
  const file = MP4Box.createFile(true)
  let track = null
  let error = null
  const samples = []
  file.onError = (e) => (error = new Error(String(e)))
  // Extraction has to be set up as soon as the tracks are known, before the samples go by.
  file.onReady = (info) => {
    track = kind === 'video' ? info.videoTracks[0] : info.audioTracks[0]
    if (!track) return
    file.onSamples = (_id, _user, s) => samples.push(...s)
    file.setExtractionOptions(track.id, null, { nbSamples: 1e9 })
    file.start()
  }
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  file.appendBuffer(MP4Box.MP4BoxBuffer.fromArrayBuffer(ab, 0))
  file.flush()
  if (error) throw error
  if (!track) throw new Error(`no ${kind} track`)
  if (!samples.length) throw new Error(`no ${kind} samples`)
  const entry = file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0]
  return { track, samples, entry }
}

/** The box describing the codec (avcC, hvcC, esds…) inside a sample entry. */
function codecBox(entry) {
  for (const key of ['avcC', 'hvcC', 'vpcC', 'av1C', 'esds', 'dOps']) if (entry[key]) return entry[key]
  throw new Error(`unsupported codec ${entry.type}`)
}

/** One MP4 with the video track of `video` and the audio track of `audio` (both Buffers). */
function muxAudioVideo(video, audio) {
  const v = readTrack(video, 'video')
  const a = readTrack(audio, 'audio')
  const out = MP4Box.createFile()
  const vid = out.addTrack({
    type: v.entry.type,
    timescale: v.track.timescale,
    width: v.track.video.width,
    height: v.track.video.height,
    hdlr: 'vide',
    description: codecBox(v.entry)
  })
  const aid = out.addTrack({
    type: a.entry.type,
    timescale: a.track.timescale,
    hdlr: 'soun',
    samplerate: a.track.audio.sample_rate,
    channel_count: a.track.audio.channel_count,
    samplesize: a.track.audio.sample_size || 16,
    description: codecBox(a.entry)
  })
  for (const s of v.samples) out.addSample(vid, s.data, { duration: s.duration, dts: s.dts, cts: s.cts, is_sync: s.is_sync })
  for (const s of a.samples) out.addSample(aid, s.data, { duration: s.duration, dts: s.dts, cts: s.cts, is_sync: s.is_sync })
  return Buffer.from(out.getBuffer().buffer)
}

/** The candidate sound files for a v.redd.it video, newest naming first (same list as src/lib/mediaFiles.ts). */
function redditAudioUrls(videoUrl) {
  const m = /^https:\/\/v\.redd\.it\/(\w+)\//.exec(videoUrl)
  if (!m) return []
  const base = `https://v.redd.it/${m[1]}/`
  return ['CMAF_AUDIO_128.mp4', 'CMAF_AUDIO_64.mp4', 'DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_audio.mp4', 'audio'].map((f) => base + f)
}

module.exports = { muxAudioVideo, redditAudioUrls }
