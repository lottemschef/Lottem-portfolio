import AVFoundation
import AppKit
import Foundation

let a = CommandLine.arguments
guard a.count >= 4, let secs = Double(a[2]) else {
    FileHandle.standardError.write("usage: grabframe <video> <seconds> <out.jpg>\n".data(using: .utf8)!)
    exit(1)
}
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter  = .zero

do {
    var actual = CMTime.zero
    let cg = try gen.copyCGImage(at: CMTime(seconds: secs, preferredTimescale: 600), actualTime: &actual)
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let d = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.94]) else { exit(2) }
    try d.write(to: URL(fileURLWithPath: a[3]))
    print("ok \(cg.width)x\(cg.height) @ \(String(format: "%.2f", CMTimeGetSeconds(actual)))s")
} catch {
    FileHandle.standardError.write("error: \(error)\n".data(using: .utf8)!)
    exit(3)
}
