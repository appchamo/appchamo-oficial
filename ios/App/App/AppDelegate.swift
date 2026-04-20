import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications
import MediaPlayer // Para limpar Now Playing quando o app abre (evita player "Chamô" na tela de bloqueio)
import FBSDKCoreKit
import AppTrackingTransparency

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate { // ✅ Adicionado o Delegate aqui

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // ✅ Badge zerado ao abrir o app (evita "1" ao instalar ou antes de logar)
        application.applicationIconBadgeNumber = 0

        // ✅ Inicializa o Firebase
        FirebaseApp.configure()

        // ✅ Inicializa o Meta SDK (Facebook) — necessário para a Meta atribuir
        // installs/eventos das campanhas de Tráfego para Aplicativo.
        // O SDK auto-loga "fb_mobile_activate_app" a cada abertura do app.
        ApplicationDelegate.shared.application(
            application,
            didFinishLaunchingWithOptions: launchOptions
        )

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

        // Pede permissão de App Tracking Transparency (iOS 14.5+) para habilitar
        // atribuição de installs com IDFA. Se o usuário negar, o Meta ainda usa
        // SKAdNetwork (limitado, mas funciona).
        if #available(iOS 14.5, *) {
            // Pequeno delay para o iOS aceitar a chamada (não pode ser durante launch)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                ATTrackingManager.requestTrackingAuthorization { _ in
                    // Após a resposta, dispara o activateApp para registrar o evento
                    // de abertura no Meta com o consentimento já definido.
                    AppEvents.shared.activateApp()
                }
            }
        } else {
            AppEvents.shared.activateApp()
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Deixa o SDK do Facebook processar deep links de campanhas (deferred deep linking)
        ApplicationDelegate.shared.application(app, open: url, options: options)
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
