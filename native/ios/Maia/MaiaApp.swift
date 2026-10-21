import SwiftUI

@main
struct MaiaApp: App {
    @StateObject private var payments = NativePayments()
    var body: some Scene {
        WindowGroup {
            MaiaWebView(payments: payments)
                .overlay {
                    if let message = payments.webError {
                        VStack(spacing: 20) {
                            Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                            Text(message).multilineTextAlignment(.center)
                            Button("Retry") { payments.webError = nil; payments.webView?.reload() }
                        }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity).background(.background)
                    }
                }
                .sheet(isPresented: $payments.presented) {
                    VStack(spacing: 24) {
                        Image(systemName: "wave.3.right.circle").font(.system(size: 56))
                        Text("Test card payment").font(.title.bold())
                        Text(payments.status).multilineTextAlignment(.center)
                        if let amount = payments.amountCents {
                            Text(Double(amount) / 100, format: .currency(code: "USD")).font(.largeTitle.bold())
                        }
                        Text("Simulation only. No physical card or real money.").foregroundStyle(.secondary)
                        if payments.ready {
                            Button("Run simulated payment") { payments.process() }.buttonStyle(.borderedProminent)
                        }
                        if !payments.busy {
                            Button("Close") { payments.presented = false; payments.webView?.reload() }
                        }
                    }.padding(28).interactiveDismissDisabled(payments.busy)
                }
        }
    }
}
