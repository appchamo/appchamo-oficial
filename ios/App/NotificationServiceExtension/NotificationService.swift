//
//  NotificationService.swift
//  NotificationServiceExtension
//
//  Força apenas o som chamo_notification.caf (evita som padrão do iOS).
//

import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent) else {
            contentHandler(request.content)
            return
        }
        self.bestAttemptContent = bestAttemptContent

        // Único som: só o do app (o payload do servidor não envia "sound" para evitar duplo)
        bestAttemptContent.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "chamo_notification.caf"))

        contentHandler(bestAttemptContent)
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }
}
