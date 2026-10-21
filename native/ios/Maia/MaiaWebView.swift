import SwiftUI
import WebKit

struct MaiaWebView: UIViewRepresentable {
    let payments: NativePayments
    func makeCoordinator() -> Coordinator { Coordinator(payments) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "maiaTapToPay")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        payments.webView = view
        payments.api.webView = view
        view.load(URLRequest(url: payments.api.baseURL))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "maiaTapToPay")
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let payments: NativePayments
        init(_ payments: NativePayments) { self.payments = payments }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard message.name == "maiaTapToPay", message.frameInfo.isMainFrame,
                  origin.protocol == payments.api.baseURL.scheme, origin.host == payments.api.baseURL.host,
                  (origin.port == 0 ? (origin.protocol == "https" ? 443 : 80) : origin.port) == (payments.api.baseURL.port ?? 443),
                  let body = message.body as? [String: String], let id = body["appointmentId"], UUID(uuidString: id) != nil else { return }
            payments.prepare(appointmentID: id)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { payments.webError = nil }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            payments.webError = "Unable to connect to Maia. Check that the test server is running, then retry."
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            payments.webError = "Maia could not finish loading. Check the connection, then retry."
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url, url.scheme == "https", url.host == "pay.stripe.com",
               url.port == nil, url.user == nil, url.password == nil, url.path.hasPrefix("/receipts/"),
               navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true {
                UIApplication.shared.open(url)
                decisionHandler(.cancel); return
            }
            // Embedded Checkout hosts card fields in Stripe-owned child frames.
            // This never permits an external top-level page or bridge message.
            if let target = navigationAction.targetFrame, !target.isMainFrame,
               let url = navigationAction.request.url, url.scheme == "https",
               let host = url.host, host == "stripe.com" || host.hasSuffix(".stripe.com") || host == "stripe.network" || host.hasSuffix(".stripe.network") {
                decisionHandler(.allow); return
            }
            guard let url = navigationAction.request.url,
                  url.scheme == payments.api.baseURL.scheme, url.host == payments.api.baseURL.host,
                  (url.port ?? 443) == (payments.api.baseURL.port ?? 443) else { decisionHandler(.cancel); return }
            decisionHandler(.allow)
        }
    }
}
