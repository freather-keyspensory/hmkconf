import Foundation
import CoreBluetooth

let service = CBUUID(string: "00000000-0196-6107-c967-c5cfb1c2482a")
let rpc = CBUUID(string: "00000001-0196-6107-c967-c5cfb1c2482a")

func emit(_ message: String) {
    FileHandle.standardOutput.write(Data((message + "\n").utf8))
}
func fail(_ message: String) -> Never {
    emit("error " + message)
    exit(1)
}

final class StudioBluetooth: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    let identifier: UUID?
    var central: CBCentralManager!
    var board: CBPeripheral?
    var endpoint: CBCharacteristic?
    var ready = false
    var settle: DispatchWorkItem?
    var lastDrainUpdate = Date.distantPast
    var inventory: Data?
    var timer: Timer?
    var remaining = Data()
    var writing = false

    init(identifier: UUID?) {
        self.identifier = identifier
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ manager: CBCentralManager) {
        if manager.state == .unknown || manager.state == .resetting { return }
        guard manager.state == .poweredOn else {
            if identifier != nil || manager.state == .unauthorized || manager.state == .unsupported {
                fail("Bluetooth is unavailable.")
            }
            inventory = nil
            emit("[]")
            return
        }
        if let id = identifier {
            guard let device = manager.retrieveConnectedPeripherals(withServices: [service])
                    .first(where: { $0.identifier == id }) else { fail("Keyboard disconnected.") }
            board = device
            device.delegate = self
            manager.connect(device)
        } else {
            publishDevices()
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in self.publishDevices() }
        }
    }

    func publishDevices() {
        guard central.state == .poweredOn else { return }
        let devices = central.retrieveConnectedPeripherals(withServices: [service])
            .map { ["id": $0.identifier.uuidString, "name": $0.name ?? "ZMK Studio"] }
            .sorted { $0["id"]! < $1["id"]! }
        guard let data = try? JSONSerialization.data(withJSONObject: devices, options: [.sortedKeys]),
              data != inventory else { return }
        inventory = data
        emit(String(decoding: data, as: UTF8.self))
    }

    func centralManager(_ manager: CBCentralManager, didConnect device: CBPeripheral) {
        device.discoverServices([service])
    }
    func centralManager(_ manager: CBCentralManager, didFailToConnect device: CBPeripheral, error: Error?) {
        fail(error?.localizedDescription ?? "Bluetooth connection failed.")
    }
    func centralManager(_ manager: CBCentralManager, didDisconnectPeripheral device: CBPeripheral, error: Error?) {
        fail("Keyboard disconnected.")
    }
    func peripheral(_ device: CBPeripheral, didDiscoverServices error: Error?) {
        guard let found = device.services?.first(where: { $0.uuid == service }) else { fail("Missing ZMK Studio service.") }
        device.discoverCharacteristics([rpc], for: found)
    }
    func peripheral(_ device: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let ch = service.characteristics?.first(where: { $0.uuid == rpc }),
              ch.properties.contains(.write) || ch.properties.contains(.writeWithoutResponse) else {
            fail("Missing writable ZMK Studio characteristic.")
        }
        endpoint = ch
        device.setNotifyValue(true, for: ch)
    }
    func peripheral(_ device: CBPeripheral, didUpdateNotificationStateFor ch: CBCharacteristic, error: Error?) {
        guard ch.isNotifying else { fail("Could not subscribe to ZMK Studio.") }
        settleNotifications()
    }
    // A previous Studio session can leave notifications in flight after disconnect.
    func settleNotifications() {
        settle?.cancel()
        let work = DispatchWorkItem { self.ready = true; emit("ready") }
        settle = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }
    func peripheral(_ device: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        if let error = error { fail(error.localizedDescription) }
        if !ready {
            if Date().timeIntervalSince(lastDrainUpdate) >= 1 {
                emit("draining")
                lastDrainUpdate = Date()
            }
            settleNotifications()
            return
        }
        if let data = ch.value { emit(data.base64EncodedString()) }
    }

    func write(_ data: Data) {
        guard ready, !writing, !data.isEmpty else { fail("Invalid Studio write.") }
        writing = true
        remaining = data
        sendNextChunk()
    }
    func sendNextChunk() {
        guard writing, let device = board, let ch = endpoint else { return }
        let type: CBCharacteristicWriteType = ch.properties.contains(.write) ? .withResponse : .withoutResponse
        while !remaining.isEmpty {
            if type == .withoutResponse && !device.canSendWriteWithoutResponse { return }
            let count = min(remaining.count, device.maximumWriteValueLength(for: type))
            let chunk = remaining.prefix(count)
            remaining.removeFirst(count)
            device.writeValue(chunk, for: ch, type: type)
            if type == .withResponse { return }
        }
        writing = false
        emit("written")
    }
    func peripheral(_ device: CBPeripheral, didWriteValueFor ch: CBCharacteristic, error: Error?) {
        if let error = error { fail(error.localizedDescription) }
        sendNextChunk()
    }
    func peripheralIsReady(toSendWriteWithoutResponse device: CBPeripheral) { sendNextChunk() }
}

let argument = CommandLine.arguments.last!
let target = UUID(uuidString: argument)
if target == nil && argument != "discover" { fail("Invalid device identifier.") }
let bluetooth = StudioBluetooth(identifier: target)
DispatchQueue.global().async {
    while let line = readLine() {
        guard target != nil, let data = Data(base64Encoded: line) else { exit(1) }
        DispatchQueue.main.async { bluetooth.write(data) }
    }
    exit(0)
}
RunLoop.main.run()
