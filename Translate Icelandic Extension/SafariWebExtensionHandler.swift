//
//  SafariWebExtensionHandler.swift
//  Translate Icelandic Extension
//
//  Native bridge for the web extension. The background worker calls
//  browser.runtime.sendNativeMessage({ type, payload }); we route it through
//  MessageRouter (which owns the API key and does the networking) and return the
//  result. Work is async, so we only complete the request once it resolves.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = item?.userInfo?[SFExtensionMessageKey]
        } else {
            message = item?.userInfo?["message"]
        }

        guard let dict = message as? [String: Any], let type = dict["type"] as? String else {
            os_log(.error, "TranslateIcelandic: malformed native message")
            complete(context, ["ok": false, "error": "malformed message"])
            return
        }
        let payload = dict["payload"] as? [String: Any] ?? [:]

        Task {
            let response = await MessageRouter.handle(type: type, payload: payload)
            complete(context, response)
        }
    }

    private func complete(_ context: NSExtensionContext, _ body: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: body]
        } else {
            response.userInfo = ["message": body]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
