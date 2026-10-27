import SwiftUI
import WebKit

/// 主界面：铺满全屏的 WKWebView，加载内置的网页版应用（离线可用）。
struct ContentView: View {
    var body: some View {
        WebViewContainer()
            .ignoresSafeArea()
            .background(Color(.systemBackground))
    }
}

struct WebViewContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            config.preferences.isTextInteractionEnabled = false
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        loadLocalApp(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    private func loadLocalApp(into webView: WKWebView) {
        guard
            let indexURL = Bundle.main.url(
                forResource: "index",
                withExtension: "html",
                subdirectory: "www"
            )
        else {
            webView.loadHTMLString(Self.missingResourceHTML, baseURL: nil)
            return
        }
        let root = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: root)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            // 站内跳转放行；外部链接（如「关于」里的 GitHub 地址）交给 Safari
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            if url.isFileURL {
                decisionHandler(.allow)
                return
            }
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }

    /// 资源缺失时的兜底页面，便于定位打包问题。
    private static let missingResourceHTML = """
    <!doctype html>
    <html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body{font-family:-apple-system,"PingFang SC",sans-serif;padding:32px;line-height:1.7;color:#2c2723;background:#f4efe6}
      code{background:rgba(0,0,0,.06);padding:2px 6px;border-radius:5px}
    </style></head><body>
    <h2>未找到内置网页资源</h2>
    <p>请确认 Xcode 工程里 <code>www</code> 目录已以「文件夹引用（蓝色文件夹）」形式加入
    target 的 <b>Copy Bundle Resources</b>，且包含 <code>index.html</code>。</p>
    </body></html>
    """
}
