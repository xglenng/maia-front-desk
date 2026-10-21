import Foundation
import WebKit
import StripeTerminal

final class APIClient: NSObject, ConnectionTokenProvider, URLSessionTaskDelegate {
    weak var webView: WKWebView?
    let baseURL: URL
    override init() {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MaiaBaseURL") as? String,
              let url = URL(string: value), Self.allowedBackend(url), url.host != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
            fatalError("Configure a trusted HTTPS MaiaBaseURL in Info.plist")
        }
        baseURL = url
        super.init()
    }
    private static func allowedBackend(_ url: URL) -> Bool {
        if url.scheme == "https" { return true }
        #if DEBUG
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == 3100
        #else
        return false
        #endif
    }
    var origin: String {
        var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        parts.path = ""; parts.query = nil; parts.fragment = nil
        return parts.url!.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
    func post(_ path: String, body: [String: String], completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard path == "/api/payments/terminal/token" || path == "/api/payments/terminal/intent",
              let webView = webView, webView.url?.host == baseURL.host else {
            completion(.failure(Self.failure("Sign in to Maia first."))); return
        }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let sessionCookies = cookies.filter { $0.name == "inkflow_session" && $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == self.baseURL.host }
            guard !sessionCookies.isEmpty else { completion(.failure(Self.failure("Sign in to Maia first."))); return }
            var request = URLRequest(url: URL(string: self.origin + path)!)
            request.httpMethod = "POST"
            request.setValue(self.origin, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            for (key, value) in HTTPCookie.requestHeaderFields(with: sessionCookies) { request.setValue(value, forHTTPHeaderField: key) }
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            let config = URLSessionConfiguration.ephemeral
            config.httpShouldSetCookies = false
            config.urlCache = nil
            let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
            session.dataTask(with: request) { data, response, error in
                defer { session.finishTasksAndInvalidate() }
                guard error == nil, let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode), let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    completion(.failure(Self.failure("Payment preparation failed. Check sign-in, test configuration, and any pending payment in Maia."))); return
                }
                completion(.success(json))
            }.resume()
        }
    }
    func fetchConnectionToken(_ completion: @escaping ConnectionTokenCompletionBlock) {
        post("/api/payments/terminal/token", body: [:]) { result in
            switch result {
            case .success(let body):
                guard body["testMode"] as? Bool == true, let secret = body["secret"] as? String else {
                    completion(nil, Self.failure("Expected a test connection token.")); return
                }
                completion(secret, nil)
            case .failure(let error): completion(nil, error)
            }
        }
    }
    // Session cookies and payment secrets must never follow redirects to another host.
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    static func failure(_ message: String) -> NSError { NSError(domain: "MaiaPayments", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
