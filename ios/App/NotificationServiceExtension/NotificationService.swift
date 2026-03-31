//
//  NotificationService.swift
//  NotificationServiceExtension
//
//  • Som customizado (chamo_notification.caf)
//  • iOS 15+: notificações de comunicação (INSendMessageIntent) → avatar circular do remetente
//    + badge do app, estilo LinkedIn — quando o payload traz ios_communication=1 e push_sender_name.
//  • Fallback: anexo de imagem (thumbnail) quando não for comunicação.
//

import UserNotifications
import Intents

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

        bestAttemptContent.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "chamo_notification.caf"))

        let userInfo = request.content.userInfo
        let imageUrlString = Self.resolveImageUrlString(userInfo: userInfo)
        let imageUrl = imageUrlString.flatMap { URL(string: $0) }

        if Self.shouldUseCommunicationStyle(userInfo: userInfo) {
            applyCommunicationStyle(content: bestAttemptContent, userInfo: userInfo, imageUrl: imageUrl, completion: contentHandler)
            return
        }

        guard let url = imageUrl else {
            contentHandler(bestAttemptContent)
            return
        }

        downloadImageAttachment(from: url) { attachment in
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

    // MARK: - Communication notifications (iOS 15+)

    private func applyCommunicationStyle(
        content: UNMutableNotificationContent,
        userInfo: [AnyHashable: Any],
        imageUrl: URL?,
        completion: @escaping (UNNotificationContent) -> Void
    ) {
        guard #available(iOSApplicationExtension 15.0, *) else {
            if let url = imageUrl {
                downloadImageAttachment(from: url) { att in
                    if let att = att { content.attachments = [att] }
                    completion(content)
                }
            } else {
                completion(content)
            }
            return
        }

        let rawName = (userInfo["push_sender_name"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = (rawName?.isEmpty == false) ? rawName! : "Chamô"

        let convRaw = (userInfo["communication_conv_id"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let conversationId = (convRaw?.isEmpty == false) ? convRaw! : (UUID().uuidString)

        let messageText = content.body

        func deliver(senderImage: INImage?) {
            let handle = INPersonHandle(value: conversationId, type: .unknown)
            let sender = INPerson(
                personHandle: handle,
                nameComponents: nil,
                displayName: displayName,
                image: senderImage,
                contactIdentifier: nil,
                customIdentifier: nil
            )

            let intent = INSendMessageIntent(
                recipients: nil,
                outgoingMessageType: .outgoingMessageText,
                content: messageText,
                speakableGroupName: nil,
                conversationIdentifier: conversationId,
                serviceName: nil,
                sender: sender,
                attachments: nil
            )

            let interaction = INInteraction(intent: intent, response: nil)
            interaction.direction = .incoming

            interaction.donate { [weak self] err in
                if err != nil {
                    self?.fallbackAttachment(content: content, imageUrl: imageUrl, completion: completion)
                    return
                }
                do {
                    let updated = try content.updating(from: intent)
                    if let mutable = updated.mutableCopy() as? UNMutableNotificationContent {
                        mutable.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "chamo_notification.caf"))
                        completion(mutable)
                    } else {
                        completion(updated)
                    }
                } catch {
                    self?.fallbackAttachment(content: content, imageUrl: imageUrl, completion: completion)
                }
            }
        }

        guard let url = imageUrl else {
            deliver(senderImage: nil)
            return
        }

        Self.downloadImageData(from: url) { data in
            let inImage = data.flatMap { INImage(imageData: $0) }
            deliver(senderImage: inImage)
        }
    }

    private func fallbackAttachment(
        content: UNMutableNotificationContent,
        imageUrl: URL?,
        completion: @escaping (UNNotificationContent) -> Void
    ) {
        guard let url = imageUrl else {
            completion(content)
            return
        }
        downloadImageAttachment(from: url) { attachment in
            if let attachment = attachment {
                content.attachments = [attachment]
            }
            completion(content)
        }
    }

    // MARK: - Helpers

    private static func shouldUseCommunicationStyle(userInfo: [AnyHashable: Any]) -> Bool {
        guard let flag = userInfo["ios_communication"] as? String else { return false }
        return flag == "1" || flag.lowercased() == "true"
    }

    private static func resolveImageUrlString(userInfo: [AnyHashable: Any]) -> String? {
        if let fcmOptions = userInfo["fcm_options"] as? [String: Any],
           let img = fcmOptions["image"] as? String, !img.isEmpty {
            return img
        }
        if let img = userInfo["image_url"] as? String, !img.isEmpty {
            return img
        }
        return nil
    }

    private static func downloadImageData(from url: URL, completion: @escaping (Data?) -> Void) {
        let task = URLSession.shared.dataTask(with: url) { data, _, error in
            guard error == nil, let data = data, !data.isEmpty else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            DispatchQueue.main.async { completion(data) }
        }
        task.resume()
    }

    private func downloadImageAttachment(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { tempURL, response, error in
            guard let tempURL = tempURL, error == nil else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            let ext: String
            if let mime = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") {
                ext = Self.fileExtension(for: mime)
            } else {
                ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            }

            let destURL = tempURL.deletingLastPathComponent().appendingPathComponent("avatar.\(ext)")
            try? FileManager.default.removeItem(at: destURL)
            try? FileManager.default.moveItem(at: tempURL, to: destURL)

            let attachment = try? UNNotificationAttachment(identifier: "avatar", url: destURL, options: nil)
            DispatchQueue.main.async { completion(attachment) }
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
