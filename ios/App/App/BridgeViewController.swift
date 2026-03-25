import UIKit
import Capacitor

/// Desativa o preview nativo de links e reduz menus de long-press no WKWebView (iOS).
final class BridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsLinkPreview = false
    }
}
