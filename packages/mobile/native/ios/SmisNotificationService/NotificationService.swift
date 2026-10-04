import Foundation
import ImageIO
import Intents
import UIKit
import UserNotifications

/// 채팅 메시지 알림 — 앱 로고 대신 보낸 사람 사진 (iOS 통신 알림 · Communication Notification)
///
/// 서버(functions/src/chat.ts)가 사진이 있는 사람의 메시지면 mutable-content 로 보내고 data 에
/// cs(보낸 사람 id) · cn(이름) · cp(사진 주소) · cg(방 이름 — 1:1 이면 빈 값) · cb(본문) · roomId 를 넣는다.
/// 사진을 받아 작게 줄인 뒤 INSendMessageIntent 로 알림을 바꾼다. 사진을 못 받으면 원래 알림 그대로 (앱 아이콘).
/// 1:1 — 제목: 보낸 사람, 본문: 메시지 / 단체방 — 제목: 방 이름, 부제: 보낸 사람, 본문: 메시지
/// (app.config.ts 의 withSmisNotificationService 가 이 파일을 Xcode 확장 대상으로 넣는다)
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var handler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    original = request.content
    let content = request.content
    // Expo 푸시의 data 는 userInfo["body"] 에 온다
    let data = (content.userInfo["body"] as? [String: Any]) ?? [:]
    guard
      let senderId = data["cs"] as? String, !senderId.isEmpty,
      let photo = data["cp"] as? String, let url = URL(string: photo)
    else {
      finish(content)
      return
    }
    let senderName = (data["cn"] as? String) ?? content.title
    let group = (data["cg"] as? String) ?? ""
    let body = (data["cb"] as? String) ?? content.body
    let roomId = (data["roomId"] as? String) ?? senderId
    NotificationService.loadAvatar(url) { [weak self] image in
      guard let self = self else { return }
      guard let image = image else {
        self.finish(content)
        return
      }
      self.present(content, senderId: senderId, senderName: senderName, group: group, body: body, roomId: roomId, image: image)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let content = original { finish(content) }
  }

  private func present(_ content: UNNotificationContent, senderId: String, senderName: String, group: String, body: String, roomId: String, image: INImage) {
    let sender = INPerson(
      personHandle: INPersonHandle(value: senderId, type: .unknown),
      nameComponents: nil,
      displayName: senderName,
      image: image,
      contactIdentifier: nil,
      customIdentifier: senderId
    )
    var recipients: [INPerson]?
    var groupName: INSpeakableString?
    if !group.isEmpty {
      // 단체방 — 받는 사람이 둘 이상이어야 방 이름이 제목, 보낸 사람이 부제로 나온다
      let me = INPerson(
        personHandle: INPersonHandle(value: "me", type: .unknown),
        nameComponents: nil,
        displayName: nil,
        image: nil,
        contactIdentifier: nil,
        customIdentifier: nil,
        isMe: true
      )
      recipients = [me, sender]
      groupName = INSpeakableString(spokenPhrase: group)
    }
    let intent = INSendMessageIntent(
      recipients: recipients,
      outgoingMessageType: .outgoingMessageText,
      content: body,
      speakableGroupName: groupName,
      conversationIdentifier: roomId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    if groupName != nil {
      // 단체방 사진 자리에도 보낸 사람 사진
      intent.setImage(image, forParameterNamed: \.speakableGroupName)
    }
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate { [weak self] _ in
      guard let self = self else { return }
      let base = (content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
      // 단체방은 보낸 사람이 부제로 나오므로 본문 앞의 '이름: ' 을 뺀 글로
      base.body = body
      do {
        let updated = try base.updating(from: intent)
        self.finish(updated)
      } catch {
        self.finish(content)
      }
    }
  }

  private func finish(_ content: UNNotificationContent) {
    lock.lock()
    let done = handler
    handler = nil
    lock.unlock()
    done?(content)
  }

  /// 사진 받기 (8초) → 256px 로 줄이기 — 확장은 메모리가 작아 원본을 그대로 다루지 않는다
  private static func loadAvatar(_ url: URL, done: @escaping (INImage?) -> Void) {
    let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 8)
    URLSession.shared.dataTask(with: request) { data, response, _ in
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        done(nil)
        return
      }
      guard let data = data, let small = NotificationService.thumbnail(data, maxPixel: 256) else {
        done(nil)
        return
      }
      done(INImage(imageData: small))
    }.resume()
  }

  private static func thumbnail(_ data: Data, maxPixel: Int) -> Data? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixel,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    return UIImage(cgImage: image).jpegData(compressionQuality: 0.85)
  }
}
