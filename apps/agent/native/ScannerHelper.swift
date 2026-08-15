import Foundation
import ImageCaptureCore
import UniformTypeIdentifiers

final class ScannerHelper: NSObject, ICDeviceBrowserDelegate, ICScannerDeviceDelegate {
    private let browser = ICDeviceBrowser()
    private let scannerName: String?
    private let outputURL: URL?
    private let probeOnly: Bool
    private var matchingScanners: [ICScannerDevice] = []
    private var scannedURL: URL?
    private var finished = false

    init(scannerName: String?, outputURL: URL?, probeOnly: Bool) {
        self.scannerName = scannerName
        self.outputURL = outputURL
        self.probeOnly = probeOnly
        super.init()
    }

    func run() -> Never {
        browser.delegate = self
        browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: 0x00000102)!
        browser.start()
        RunLoop.current.run()
        fatalError("Run loop ended unexpectedly")
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard let scanner = device as? ICScannerDevice else { return }
        if scannerName == nil || (scanner.name?.localizedCaseInsensitiveContains(scannerName!) ?? false) {
            matchingScanners.append(scanner)
        }
        if !moreComing { selectScanner() }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        matchingScanners.removeAll { $0 === device }
    }

    func deviceBrowserDidEnumerateLocalDevices(_ browser: ICDeviceBrowser) {
        selectScanner()
    }

    private func selectScanner() {
        guard !finished else { return }
        if matchingScanners.count > 1 && scannerName == nil { finish(code: "SCANNER_AMBIGUOUS", exitCode: 4) }
        guard let scanner = matchingScanners.first else { finish(code: "SCANNER_UNAVAILABLE", exitCode: 3) }
        if probeOnly { finish(code: "OK", exitCode: 0, name: scanner.name ?? "Scanner") }
        guard outputURL != nil else { finish(code: "SCAN_FAILED", exitCode: 2) }
        finished = true
        scanner.delegate = self
        scanner.requestOpenSession()
    }

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        guard let scanner = device as? ICScannerDevice else { finish(code: "SCAN_FAILED", exitCode: 2) }
        if error != nil { finish(code: "SCANNER_BUSY", exitCode: 5) }
        guard scanner.availableFunctionalUnitTypes.contains(NSNumber(value: ICScannerFunctionalUnitType.flatbed.rawValue)) else { finish(code: "SCANNER_UNAVAILABLE", exitCode: 3) }
        scanner.requestSelect(.flatbed)
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}

    func didRemove(_ device: ICDevice) {
        finish(code: "SCANNER_UNAVAILABLE", exitCode: 3)
    }

    func scannerDevice(_ scanner: ICScannerDevice, didSelect functionalUnit: ICScannerFunctionalUnit, error: Error?) {
        if error != nil { finish(code: "SCAN_FAILED", exitCode: 2) }
        functionalUnit.measurementUnit = .inches
        let resolutions = functionalUnit.supportedResolutions.map { $0 }
        functionalUnit.resolution = resolutions.min(by: { abs($0 - 300) < abs($1 - 300) }) ?? 300
        functionalUnit.pixelDataType = .gray
        functionalUnit.bitDepth = .depth8Bits
        functionalUnit.scanArea = NSRect(x: 0, y: 0, width: min(8.27, functionalUnit.physicalSize.width), height: min(11.69, functionalUnit.physicalSize.height))
        scanner.transferMode = .fileBased
        scanner.downloadsDirectory = outputURL!.deletingLastPathComponent()
        scanner.documentName = outputURL!.deletingPathExtension().lastPathComponent
        scanner.documentUTI = UTType.jpeg.identifier
        scanner.requestScan()
    }

    func scannerDevice(_ scanner: ICScannerDevice, didScanTo url: URL) {
        scannedURL = url
    }

    func scannerDevice(_ scanner: ICScannerDevice, didCompleteScanWithError error: Error?) {
        if error != nil { finish(code: "SCAN_FAILED", exitCode: 2) }
        guard let scannedURL, let outputURL else { finish(code: "SCAN_FAILED", exitCode: 2) }
        do {
            if scannedURL.standardizedFileURL != outputURL.standardizedFileURL {
                try? FileManager.default.removeItem(at: outputURL)
                try FileManager.default.moveItem(at: scannedURL, to: outputURL)
            }
            scanner.requestCloseSession()
            finish(code: "OK", exitCode: 0)
        } catch {
            finish(code: "SCAN_FAILED", exitCode: 2)
        }
    }

    private func finish(code: String, exitCode: Int32, name: String? = nil) -> Never {
        finished = true
        browser.stop()
        let payload: [String: Any] = name.map { ["ok": exitCode == 0, "code": code, "name": $0] } ?? ["ok": exitCode == 0, "code": code]
        if let data = try? JSONSerialization.data(withJSONObject: payload), let text = String(data: data, encoding: .utf8) { print(text) }
        fflush(stdout)
        exit(exitCode)
    }
}

let arguments = CommandLine.arguments.dropFirst()
var probe = false
var scannerName: String?
var outputPath: String?
var index = arguments.startIndex
while index < arguments.endIndex {
    let argument = arguments[index]
    if argument == "--probe" { probe = true }
    else if argument == "--scanner", let next = arguments.index(index, offsetBy: 1, limitedBy: arguments.endIndex), next < arguments.endIndex { scannerName = String(arguments[next]); index = next }
    else if argument == "--output", let next = arguments.index(index, offsetBy: 1, limitedBy: arguments.endIndex), next < arguments.endIndex { outputPath = String(arguments[next]); index = next }
    index = arguments.index(after: index)
}
if !probe && outputPath == nil {
    print("{\"ok\":false,\"code\":\"SCAN_FAILED\"}")
    exit(2)
}
ScannerHelper(scannerName: scannerName, outputURL: outputPath.map { URL(fileURLWithPath: $0) }, probeOnly: probe).run()
