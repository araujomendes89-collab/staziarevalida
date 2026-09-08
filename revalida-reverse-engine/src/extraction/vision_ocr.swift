import AppKit
import Foundation
import PDFKit
import Vision

guard CommandLine.arguments.count == 3 else {
    fputs("Uso: vision_ocr.swift entrada.pdf saida.json\n", stderr)
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let document = PDFDocument(url: inputURL) else {
    fputs("Não foi possível abrir o PDF.\n", stderr)
    exit(1)
}

var pages: [[String: Any]] = []
for pageIndex in 0..<document.pageCount {
    autoreleasepool {
        guard let page = document.page(at: pageIndex) else { return }
        let bounds = page.bounds(for: .mediaBox)
        let targetWidth: CGFloat = 1800
        let scale = targetWidth / bounds.width
        let pixelWidth = Int(bounds.width * scale)
        let pixelHeight = Int(bounds.height * scale)
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelWidth,
            pixelsHigh: pixelHeight,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else { return }
        NSGraphicsContext.saveGraphicsState()
        guard let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { return }
        NSGraphicsContext.current = graphics
        graphics.cgContext.setFillColor(NSColor.white.cgColor)
        graphics.cgContext.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
        graphics.cgContext.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: graphics.cgContext)
        graphics.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        guard let image = bitmap.cgImage else { return }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["pt-BR"]
        request.usesLanguageCorrection = true
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            fputs("Falha no OCR da página \(pageIndex + 1): \(error)\n", stderr)
            exit(1)
        }

        var blocks: [[String: Any]] = []
        for observation in request.results ?? [] {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let box = observation.boundingBox
            blocks.append([
                "text": candidate.string,
                "x0": Double(box.minX * bounds.width),
                "y0": Double((1 - box.maxY) * bounds.height),
                "x1": Double(box.maxX * bounds.width),
                "y1": Double((1 - box.minY) * bounds.height),
                "confidence": Double(candidate.confidence),
            ])
        }
        pages.append([
            "page_number": pageIndex + 1,
            "width": Double(bounds.width),
            "height": Double(bounds.height),
            "blocks": blocks,
        ])
        fputs("OCR página \(pageIndex + 1)/\(document.pageCount)\n", stderr)
    }
}

let payload: [String: Any] = ["pages": pages]
let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted])
try data.write(to: outputURL, options: .atomic)
