import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications
import MediaPlayer // Para limpar Now Playing quando o app abre (evita player "Chamô" na tela de bloqueio)

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate { // ✅ Adicionado o Delegate aqui

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // ✅ Badge zerado ao abrir o app (evita "1" ao instalar ou antes de logar)
        application.applicationIconBadgeNumber = 0

        // ✅ Inicializa o Firebase
        FirebaseApp.configure()
        
        // ✅ Configura o Delegate para mostrar notificações em primeiro plano
        UNUserNotificationCenter.current().delegate = self
        
        return true
    }
    
    // ✅ Faz a notificação aparecer (Banner + Som) mesmo com o app aberto
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([[.banner, .sound, .badge]])
    }

    // ✅ Registra o Token no Firebase e no Capacitor
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    // ✅ Caso ocorra erro no registro
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Limpa o Now Playing para o player "Chamô" sumir da tela de bloqueio ao abrir o app
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
