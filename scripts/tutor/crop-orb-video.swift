// Prepara o vídeo da esfera do modo de voz do Tutor (Stazia Voice Mode) a partir de um vídeo novo, sem mexer no original.
//
//   swift scripts/tutor/crop-orb-video.swift <video-original.mp4> public/novo-assets/tutor/stazia-voice-orb.mp4 \
//         public/novo-assets/tutor/stazia-voice-orb.jpg <x> <y> <lado> <lado-final>
//
// Recorta um quadrado de <lado> px a partir de (<x>, <y>), reduz para <lado-final> px, tira o áudio e grava também o pôster (o
// primeiro quadro). Para o vídeo de 2026-10-06 (720×1280, com a interface desenhada por cima): x=60 y=280 lado=600 lado-final=600
// (o preset "média qualidade" do macOS entrega 480×480, ~0,9 MB). Precisa de macOS (AVFoundation).
import AVFoundation
import AppKit
// Recorte quadrado do orbe (sem a interface desenhada no vídeo e sem áudio) + pôster.
let src = URL(fileURLWithPath: CommandLine.arguments[1])
let out = URL(fileURLWithPath: CommandLine.arguments[2])
let poster = URL(fileURLWithPath: CommandLine.arguments[3])
let cropX = Double(CommandLine.arguments[4])!, cropY = Double(CommandLine.arguments[5])!, side = Double(CommandLine.arguments[6])!, outSide = Double(CommandLine.arguments[7])!
let asset = AVURLAsset(url: src)
let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let track = try await asset.loadTracks(withMediaType: .video).first!
    let duration = try await asset.load(.duration)
    let comp = AVMutableComposition()
    let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try vt.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: track, at: .zero)
    let scale = outSide / side
    let instr = AVMutableVideoCompositionInstruction()
    instr.timeRange = CMTimeRange(start: .zero, duration: duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: vt)
    layer.setTransform(CGAffineTransform(translationX: -cropX, y: -cropY).concatenating(CGAffineTransform(scaleX: scale, y: scale)), at: .zero)
    instr.layerInstructions = [layer]
    let vc = AVMutableVideoComposition()
    vc.renderSize = CGSize(width: outSide, height: outSide)
    vc.frameDuration = CMTime(value: 1, timescale: 24)
    vc.instructions = [instr]
    try? FileManager.default.removeItem(at: out)
    guard let exp = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetMediumQuality) else { print("sem exportador"); sem.signal(); return }
    exp.videoComposition = vc
    exp.outputURL = out
    exp.outputFileType = .mp4
    exp.shouldOptimizeForNetworkUse = true
    await exp.export()
    if exp.status != .completed { print("falhou: \(String(describing: exp.error))"); sem.signal(); return }
    // pôster: primeiro quadro do recorte
    let gen = AVAssetImageGenerator(asset: AVURLAsset(url: out))
    gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
    let (cg, _) = try await gen.image(at: .zero)
    let rep = NSBitmapImageRep(cgImage: cg)
    try rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82])!.write(to: poster)
    let attrs = try FileManager.default.attributesOfItem(atPath: out.path)
    print("ok \(attrs[.size]!) bytes")
  } catch { print("erro: \(error)") }
  sem.signal()
}
sem.wait()
