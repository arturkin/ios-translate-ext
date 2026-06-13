//
//  Translate_IcelandicTests.swift
//  Translate IcelandicTests
//
//  Tests for SharedStore — the settings contract the app writes and the Safari
//  extension reads. Getting the defaults and the empty-string handling right
//  matters because a wrong default silently changes the extension's behaviour.
//

import XCTest
@testable import Translate_Icelandic

final class Translate_IcelandicTests: XCTestCase {

    private let keys = [
        SharedStore.Key.azureKey, SharedStore.Key.azureRegion, SharedStore.Key.provider,
        SharedStore.Key.useWiktionary, SharedStore.Key.useBin,
        SharedStore.Key.tapToTranslate, SharedStore.Key.autoTranslate,
    ]

    override func setUpWithError() throws {
        keys.forEach { SharedStore.defaults.removeObject(forKey: $0) }
    }

    override func tearDownWithError() throws {
        keys.forEach { SharedStore.defaults.removeObject(forKey: $0) }
    }

    func testDefaultsWhenUnset() {
        XCTAssertEqual(SharedStore.provider, "azure")
        XCTAssertNil(SharedStore.azureKey)
        XCTAssertNil(SharedStore.azureRegion)
        XCTAssertTrue(SharedStore.useWiktionary)
        XCTAssertTrue(SharedStore.useBin)
        XCTAssertTrue(SharedStore.tapToTranslate)        // tap-to-translate defaults ON
        XCTAssertFalse(SharedStore.autoTranslate)        // auto-translate defaults OFF
    }

    func testRoundTrip() {
        SharedStore.provider = "free"
        SharedStore.azureKey = "secret-key"
        SharedStore.azureRegion = "westeurope"
        SharedStore.useWiktionary = false
        SharedStore.autoTranslate = true

        XCTAssertEqual(SharedStore.provider, "free")
        XCTAssertEqual(SharedStore.azureKey, "secret-key")
        XCTAssertEqual(SharedStore.azureRegion, "westeurope")
        XCTAssertFalse(SharedStore.useWiktionary)
        XCTAssertTrue(SharedStore.autoTranslate)
        XCTAssertTrue(SharedStore.useBin)                // untouched key keeps its default
    }

    func testBlankKeyIsTreatedAsUnset() {
        SharedStore.azureKey = "   "
        XCTAssertNil(SharedStore.azureKey, "Whitespace-only key must read back as nil so we fall back to the free provider")
    }
}
