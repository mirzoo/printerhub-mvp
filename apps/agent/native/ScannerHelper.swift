import Foundation
import ImageCaptureCore
import UniformTypeIdentifiers

final class ScannerHelper: NSObject, ICDeviceBrowserDelegate, ICScannerDeviceDelegate {
    private let browser = ICDeviceBrowser()
    private let scannerName: String?
    private let outputURL: URL?
    private let probeOnly: Bool
    private var matchingScanners: [ICScannerDevice] = []
    private var activeScanner: ICScannerDevice?
    private var scannedURL: URL?
    private var scanRequested = false
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
            if !matchingScanners.contains(where: { $0 === scanner }) {
                matchingScanners.append(scanner)
            }
        }
        if !moreComing { selectScanner(allowUnavailable: false) }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        matchingScanners.removeAll { $0 === device }
    }

    func deviceBrowserDidEnumerateLocalDevices(_ browser: ICDeviceBrowser) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.selectScanner(allowUnavailable: true)
        }
    }

    private func selectScanner(allowUnavailable: Bool) {
        guard !finished, activeScanner == nil else { return }
        if matchingScanners.count > 1 && scannerName == nil { finish(code: "SCANNER_AMBIGUOUS", exitCode: 4) }
        guard let scanner = matchingScanners.first else {
            if allowUnavailable { finish(code: "SCANNER_UNAVAILABLE", exitCode: 3) }
            return
        }
        if probeOnly { finish(code: "OK", exitCode: 0, name: scanner.name ?? "Scanner") }
        guard outputURL != nil else { finish(code: "SCAN_FAILED", exitCode: 2) }
        activeScanner = scanner
        scanner.delegate = self
        scanner.requestOpenSession()
    }

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        guard let scanner = device as? ICScannerDevice else { finish(code: "SCAN_FAILED", exitCode: 2) }
        if error != nil { finish(code: "SCANNER_BUSY", exitCode: 5) }
        configureAndScan(scanner: scanner, functionalUnit: scanner.selectedFunctionalUnit, attemptsRemaining: 60)
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}

    func didRemove(_ device: ICDevice) {
        guard device === activeScanner else { return }
        activeScanner = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.selectScanner(allowUnavailable: true)
        }
    }

    func scannerDevice(_ scanner: ICScannerDevice, didSelect functionalUnit: ICScannerFunctionalUnit, error: Error?) {
        if error != nil { finish(code: "SCAN_FAILED", exitCode: 2) }
        configureAndScan(scanner: scanner, functionalUnit: functionalUnit, attemptsRemaining: 60)
    }

    private func configureAndScan(scanner: ICScannerDevice, functionalUnit: ICScannerFunctionalUnit, attemptsRemaining: Int) {
        guard !scanRequested else { return }
        guard !functionalUnit.supportedResolutions.isEmpty,
              functionalUnit.physicalSize.width > 0,
              functionalUnit.physicalSize.height > 0 else {
            guard attemptsRemaining > 0 else { finish(code: "SCAN_TIMEOUT", exitCode: 6) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self, weak scanner, weak functionalUnit] in
                guard let self, let scanner, let functionalUnit else { return }
                self.configureAndScan(scanner: scanner, functionalUnit: functionalUnit, attemptsRemaining: attemptsRemaining - 1)
            }
            return
        }
        scanRequested = true
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
        completeScan(scanner: scanner, scannedURL: url)
    }

    func scannerDevice(_ scanner: ICScannerDevice, didCompleteScanWithError error: Error?) {
        if error != nil { finish(code: "SCAN_FAILED", exitCode: 2) }
        guard let scannedURL else { finish(code: "SCAN_FAILED", exitCode: 2) }
        completeScan(scanner: scanner, scannedURL: scannedURL)
    }

    private func completeScan(scanner: ICScannerDevice, scannedURL: URL) {
        guard let outputURL else { finish(code: "SCAN_FAILED", exitCode: 2) }
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
