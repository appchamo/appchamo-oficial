import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    // A NOSSA PONTE DIRETA (SWIFT -> REACT)
        func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
            print("🚀🚀🚀 ALARME NATIVO: O iOS capturou o link: \(url.absoluteString)")
            
            // FORÇA BRUTA SUPREMA: Injeta a URL diretamente na veia do React (bypassa o Capacitor)
            if let bridgeVC = self.window?.rootViewController as? CAPBridgeViewController {
                let js = "window.dispatchEvent(new CustomEvent('iosDeepLink', { detail: '\(url.absoluteString)' }));"
                bridgeVC.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
            
            return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
        }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
