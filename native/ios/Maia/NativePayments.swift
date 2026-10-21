import Foundation
import Combine
import WebKit
import StripeTerminal

// First pilot is deliberately simulated. Enabling physical Tap to Pay needs
// entitlement approval, device validation, and a separately reviewed build.
final class NativePayments: NSObject, ObservableObject, DiscoveryDelegate, TapToPayReaderDelegate {
    let api = APIClient()
    weak var webView: WKWebView?
    @Published var webError: String?
    @Published var presented = false
    @Published var status = "Preparing test payment…"
    @Published var amountCents: Int?
    @Published var ready = false
    @Published var busy = false
    private var clientSecret: String?
    private var locationID: String?
    private var discovering: Cancelable?
    private var processing: Cancelable?
    private var connecting = false

    override init() { super.init(); Terminal.initWithTokenProvider(api) }
    func prepare(appointmentID: String) {
        guard !busy else { return }
        presented = true; busy = true; ready = false; amountCents = nil
        status = "Preparing test payment…"
        api.post("/api/payments/terminal/intent", body: ["appointmentId": appointmentID]) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let body):
                    guard body["testMode"] as? Bool == true,
                          let secret = body["clientSecret"] as? String, let location = body["locationId"] as? String,
                          let amount = body["amountCents"] as? Int else { self.fail(); return }
                    self.clientSecret = secret; self.locationID = location; self.amountCents = amount
                    self.ready = true; self.busy = false; self.status = "Review the remaining balance, then run a simulated card tap."
                case .failure: self.fail()
                }
            }
        }
    }
    func process() {
        guard ready, !busy else { return }
        busy = true; ready = false; connecting = false
        status = "Connecting simulated reader…"
        // Never reuse a reader scoped to a previous studio session.
        if Terminal.shared.connectedReader != nil {
            Terminal.shared.disconnectReader { error in
                DispatchQueue.main.async { if error != nil { self.fail() } else { self.discover() } }
            }
        } else { discover() }
    }
    private func discover() {
        if case .failure = Terminal.shared.clearCachedCredentials() { fail(); return }
        do {
            let config = try TapToPayDiscoveryConfigurationBuilder().setSimulated(true).build()
            discovering = Terminal.shared.discoverReaders(config, delegate: self) { error in
                if error != nil && !self.connecting { DispatchQueue.main.async { self.fail() } }
            }
        } catch { fail() }
    }
    func terminal(_ terminal: Terminal, didUpdateDiscoveredReaders readers: [Reader]) {
        guard !connecting, let reader = readers.first, let location = locationID else { return }
        connecting = true
        do {
            let config = try TapToPayConnectionConfigurationBuilder(delegate: self, locationId: location).build()
            Terminal.shared.connectReader(reader, connectionConfig: config) { connected, error in
                DispatchQueue.main.async {
                    guard connected != nil, error == nil else { self.fail(); return }
                    self.collect()
                }
            }
        } catch { fail() }
    }
    private func collect() {
        guard let secret = clientSecret else { fail(); return }
        status = "Running simulated card payment…"
        Terminal.shared.retrievePaymentIntent(clientSecret: secret) { intent, error in
            guard let intent = intent, error == nil else { DispatchQueue.main.async { self.fail() }; return }
            self.processing = Terminal.shared.processPaymentIntent(intent, collectConfig: nil, confirmConfig: nil) { _, error in
                DispatchQueue.main.async {
                    self.busy = false
                    self.status = error == nil ? "Simulation processed. Refresh Maia to verify the recorded payment." : "Simulation did not complete. Refresh Maia before retrying the same payment."
                    self.clientSecret = nil
                }
            }
        }
    }
    private func fail() {
        busy = false; ready = false
        status = "Test payment unavailable. Check your owner sign-in, Stripe test location, and any pending payment in Maia."
        // No raw SDK error, token, card data, or PaymentIntent is logged.
    }
    func reader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) { DispatchQueue.main.async { self.status = "Preparing simulated reader…" } }
    func reader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}
    func reader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) { if error != nil { DispatchQueue.main.async { self.fail() } } }
    func tapToPayReaderDidAcceptTermsOfService(_ reader: Reader) {}
    func reader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions = []) {}
    func reader(_ reader: Reader, didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage) {}
}
