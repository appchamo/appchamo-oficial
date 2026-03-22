//
//  NotificationService.swift
//  NotificationServiceExtension
//
//  Configura o som chamo_notification.caf e faz download da imagem de perfil
//  para exibir como thumbnail na notificação (lock screen / banner).
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

        // Som customizado do app
        bestAttemptContent.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "chamo_notification.caf"))

        // Tenta obter a URL da imagem de perfil do remetente
        // FCM v1 envia via apns.fcm_options.image → chega como fcm_options.image no userInfo
        let imageUrlString: String? = {
            if let fcmOptions = request.content.userInfo["fcm_options"] as? [String: Any],
               let img = fcmOptions["image"] as? String {
                return img
            }
            // Fallback: campo image_url do data payload
            if let img = request.content.userInfo["image_url"] as? String, !img.isEmpty {
                return img
            }
            return nil
        }()

        guard let urlString = imageUrlString, let url = URL(string: urlString) else {
            // Sem imagem → entrega a notificação só com o som
            contentHandler(bestAttemptContent)
            return
        }

        // Download da imagem e criação do attachment
        downloadImage(from: url) { attachment in
            if let attachment = attachment {
                bestAttemptContent.attachments = [attachment]
            }
            contentHandler(bestAttemptContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    // MARK: - Helpers

    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { tempURL, response, error in
            guard let tempURL = tempURL, error == nil else {
                completion(nil)
                return
            }

            // Determina extensão pelo content-type ou pela URL
            let ext: String
            if let mime = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") {
                ext = Self.fileExtension(for: mime)
            } else {
                ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            }

            let destURL = tempURL.deletingLastPathComponent().appendingPathComponent("avatar.\(ext)")
            try? FileManager.default.moveItem(at: tempURL, to: destURL)

            let options: [String: Any] = [UNNotificationAttachmentOptionsThumbnailClippingRectKey: CGRect(x: 0, y: 0, width: 1, height: 1)]
            let attachment = try? UNNotificationAttachment(identifier: "avatar", url: destURL, options: options)
            completion(attachment)
        }
        task.resume()
    }

    private static func fileExtension(for mimeType: String) -> String {
        switch mimeType.lowercased() {
        case let m where m.contains("jpeg"), let m where m.contains("jpg"): return "jpg"
        case let m where m.contains("png"): return "png"
        case let m where m.contains("gif"): return "gif"
        case let m where m.contains("webp"): return "webp"
        default: return "jpg"
        }
    }
}
