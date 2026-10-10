// encode -- H.264 at a bitrate of our choosing, which avconvert cannot do.
//
//   encode <source> <out.mp4> <width> <height> <video kbps> [audio kbps]
//
// avconvert's presets are fixed quality, so resolution is the only lever it
// offers: a 56-second vertical reel came out of Preset1920x1080 at 9.9 Mbps,
// about 69MB. This drives Apple's own encoder directly instead -- the same
// VideoToolbox avconvert uses -- with an average bitrate, so a reel can be full
// resolution and still a sensible download. Everything else matches what the
// presets give: H.264 High, AAC, BT.709, and fast start (the moov atom first,
// so a browser can begin playing before the whole file has arrived).
//
// width and height are the frame as stored. The source's rotation, if it has
// one, is carried across as a transform rather than baked in.
//
// No ffmpeg on this machine, and no Homebrew to fetch one: this needs nothing
// but the system frameworks.
import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let a = CommandLine.arguments
guard a.count >= 6, let width = Int(a[3]), let height = Int(a[4]), let videoKbps = Int(a[5]) else {
    fail("usage: encode <source> <out.mp4> <width> <height> <video kbps> [audio kbps]")
}
let audioKbps = a.count > 6 ? (Int(a[6]) ?? 128) : 128

let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let outURL = URL(fileURLWithPath: a[2])
try? FileManager.default.removeItem(at: outURL)

guard let videoTrack = asset.tracks(withMediaType: .video).first else { fail("no video track in \(a[1])") }
let audioTrack = asset.tracks(withMediaType: .audio).first

let reader: AVAssetReader
let writer: AVAssetWriter
do {
    reader = try AVAssetReader(asset: asset)
    writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
} catch { fail("could not open: \(error)") }
writer.shouldOptimizeForNetworkUse = true          // fast start

let bt709: [String: Any] = [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
]

// ---- video: decoded to 8-bit 4:2:0, then scaled and encoded by the writer
let videoOut = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    AVVideoColorPropertiesKey: bt709,
])
videoOut.alwaysCopiesSampleData = false
reader.add(videoOut)

let fps = Double(videoTrack.nominalFrameRate > 0 ? videoTrack.nominalFrameRate : 25)
let videoIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
    AVVideoColorPropertiesKey: bt709,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: videoKbps * 1000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
        AVVideoAllowFrameReorderingKey: true,
        AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
        // a keyframe every two seconds, so seeking and looping land quickly
        AVVideoMaxKeyFrameIntervalKey: Int((fps * 2).rounded()),
    ],
])
videoIn.transform = videoTrack.preferredTransform
videoIn.expectsMediaDataInRealTime = false
writer.add(videoIn)

// ---- audio, if there is any
var pairs: [(AVAssetWriterInput, AVAssetReaderOutput)] = [(videoIn, videoOut)]
if let audioTrack {
    let audioOut = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
    reader.add(audioOut)
    let audioIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 48000,
        AVEncoderBitRateKey: audioKbps * 1000,
    ])
    audioIn.expectsMediaDataInRealTime = false
    writer.add(audioIn)
    pairs.append((audioIn, audioOut))
}

guard reader.startReading() else { fail("reader: \(reader.error.map { "\($0)" } ?? "unknown")") }
guard writer.startWriting() else { fail("writer: \(writer.error.map { "\($0)" } ?? "unknown")") }
writer.startSession(atSourceTime: .zero)

let group = DispatchGroup()
for (index, (input, output)) in pairs.enumerated() {
    group.enter()
    let queue = DispatchQueue(label: "encode.\(index)")
    var done = false
    input.requestMediaDataWhenReady(on: queue) {
        while input.isReadyForMoreMediaData && !done {
            if let sample = output.copyNextSampleBuffer(), input.append(sample) { continue }
            done = true
            input.markAsFinished()
            group.leave()
        }
    }
}
group.wait()

let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()

guard writer.status == .completed, reader.status == .completed else {
    try? FileManager.default.removeItem(at: outURL)
    fail("encode failed: \(writer.error.map { "\($0)" } ?? reader.error.map { "\($0)" } ?? "unknown")")
}

let bytes = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? Int) ?? 0
let seconds = CMTimeGetSeconds(asset.duration)
print(String(format: "ok %dx%d  %.1fMB  %.1f Mbps over %.1fs",
             width, height, Double(bytes) / 1e6, Double(bytes) * 8 / seconds / 1e6, seconds))
