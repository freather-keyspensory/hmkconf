import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap"
import protobuf from "protobufjs/light"
import type { StudioSession } from "./studio-session"

// PHDesign Studio combos.proto and cormoran.runtime_macro's published Studio schema.
const field = (type: string, id: number, repeated = false) => ({
  type,
  id,
  ...(repeated ? { rule: "repeated" } : {}),
})
const u = (id: number) => field("uint32", id)
const schema = protobuf.Root.fromJSON({
  nested: {
    Binding: { fields: { behaviorId: u(1), param1: u(2), param2: u(3) } },
    KeymapBinding: { fields: { behaviorId: field("sint32", 1), param1: u(2), param2: u(3) } },
    Combo: {
      fields: {
        index: u(1),
        timeoutMs: field("int32", 2),
        requirePriorIdleMs: field("int32", 3),
        slowRelease: field("bool", 4),
        layerMask: u(5),
        behavior: field("KeymapBinding", 6),
        keyPositions: field("uint32", 7, true),
        editableBehavior: field("bool", 8),
        editableKeyPositions: field("bool", 9),
      },
    },
    Index: { fields: { index: u(1) } },
    SetCombo: { fields: { index: u(1), combo: field("Combo", 2) } },
    ComboRequest: {
      fields: {
        listAllCombos: field("bool", 1),
        getCombo: field("Index", 2),
        setCombo: field("SetCombo", 3),
      },
    },
    ComboList: { fields: { combos: field("Combo", 1, true) } },
    Confirmation: { fields: { ok: field("bool", 1), err: u(2) } },
    ComboReply: {
      fields: {
        listAllCombos: field("ComboList", 1),
        getCombo: field("Combo", 2),
        setCombo: field("Confirmation", 3),
      },
    },
    Query: { fields: { requestId: u(1), combos: field("ComboRequest", 7) } },
    Reply: { fields: { requestId: u(1), combos: field("ComboReply", 7) } },
    Envelope: { fields: { reply: field("Reply", 1) } },
    Empty: { fields: {} },
    Slot: { fields: { slot: u(1) } },
    Delay: { fields: { delayMs: u(1) } },
    Packed: { fields: { packedKeys: field("bytes", 1) } },
    Step: {
      fields: {
        down: field("Binding", 1),
        up: field("Binding", 2),
        tap: field("Binding", 3),
        delay: field("Delay", 4),
        keyTapSequence: field("Packed", 5),
      },
    },
    Summary: {
      fields: {
        slot: u(1),
        name: field("string", 2),
        encodedSize: u(3),
        hasUnsavedChanges: field("bool", 4),
      },
    },
    Macro: { fields: { slot: u(1), name: field("string", 2), steps: field("Step", 3, true) } },
    MacroList: {
      fields: { macros: field("Summary", 1, true), maxMacroBytes: u(2), maxNameLength: u(3) },
    },
    MacroResult: { fields: { macro: field("Macro", 1) } },
    Create: { fields: { name: field("string", 1), persist: field("bool", 2) } },
    Truncate: { fields: { slot: u(1), stepCount: u(2), persist: field("bool", 3) } },
    Replace: {
      fields: { slot: u(1), stepIndex: u(2), step: field("Step", 3), persist: field("bool", 4) },
    },
    Append: { fields: { slot: u(1), step: field("Step", 2), persist: field("bool", 3) } },
    MacroRequest: {
      fields: {
        listMacros: field("Empty", 1),
        getMacro: field("Slot", 2),
        setMacroStepCount: field("Truncate", 4),
        setMacroStep: field("Replace", 7),
        appendMacroStep: field("Append", 11),
        createMacro: field("Create", 12),
      },
    },
    Error: { fields: { message: field("string", 1) } },
    MacroReply: {
      fields: {
        error: field("Error", 1),
        status: field("Empty", 2),
        listMacros: field("MacroList", 3),
        getMacro: field("MacroResult", 4),
      },
    },
  },
})

export type Combo = {
  index: number
  timeoutMs: number
  requirePriorIdleMs: number
  slowRelease: boolean
  layerMask: number
  behavior?: BehaviorBinding
  keyPositions: number[]
  editableBehavior: boolean
  editableKeyPositions: boolean
}
export type ComboRequest =
  | { listAllCombos: true }
  | { getCombo: { index: number } }
  | { setCombo: { index: number; combo: Combo } }
export type ComboReply = {
  listAllCombos?: { combos: Combo[] }
  getCombo?: Combo
  setCombo?: { ok: boolean }
}
export type Step =
  | { tap: BehaviorBinding }
  | { down: BehaviorBinding }
  | { up: BehaviorBinding }
  | { delay: { delayMs: number } }
  | { keyTapSequence: { packedKeys: Uint8Array } }
export type Macro = { slot: number; name: string; steps: Step[] }
export type MacroList = {
  macros: { slot: number; name: string; hasUnsavedChanges: boolean }[]
  maxNameLength: number
}
export type MacroEdit =
  | { setMacroStepCount: { slot: number; stepCount: number; persist: true } }
  | { setMacroStep: { slot: number; stepIndex: number; step: Step; persist: true } }
  | { appendMacroStep: { slot: number; step: Step; persist: true } }
type MacroRequest =
  | MacroEdit
  | { listMacros: Record<string, never> }
  | { getMacro: { slot: number } }
  | { createMacro: { name: string; persist: true } }
type MacroReply = {
  error?: { message: string }
  status?: object
  listMacros?: MacroList
  getMacro?: { macro?: Macro }
}

const encode = (name: string, value: object) => schema.lookupType(name).encode(value).finish()
function decode<T>(name: string, bytes: Uint8Array, defaults = false): T {
  const type = schema.lookupType(name)
  return type.toObject(type.decode(bytes), { arrays: true, defaults }) as T
}
export const encodeComboRequest = (requestId: number, combos: ComboRequest) =>
  encode("Query", { requestId, combos })
export function decodeComboReply(bytes: Uint8Array) {
  return decode<{ reply?: { combos?: ComboReply } }>("Envelope", bytes, true).reply?.combos
}
const normalizeBinding = (b: BehaviorBinding): BehaviorBinding => ({
  behaviorId: b.behaviorId ?? 0,
  param1: b.param1 ?? 0,
  param2: b.param2 ?? 0,
})
export const runtimeMacroId = "cormoran__runtime_macro"
export const isPresetMacro = (name: string) =>
  name !== "Runtime Macro" && (/macro/i.test(name) || /^(Copy|Paste|Undo) \((macOS|Ctrl)\)$/.test(name))

export async function macroRequest(active: StudioSession, index: number, request: MacroRequest) {
  const { call } = await active.moduleRequest({
    call: { index, payload: encode("MacroRequest", request) },
  })
  if (!call || call.index !== index) throw Error("Unexpected macro module response.")
  const reply = decode<MacroReply>("MacroReply", call.payload)
  if (reply.error) throw Error(reply.error.message || "Macro request rejected.")
  if (reply.listMacros) {
    for (const item of reply.listMacros.macros) item.slot ??= 0
  }
  const macro = reply.getMacro?.macro
  if (macro) {
    macro.slot ??= 0
    macro.steps = macro.steps.map((step) => {
      if ("down" in step) return { down: normalizeBinding(step.down) }
      if ("up" in step) return { up: normalizeBinding(step.up) }
      if ("tap" in step) return { tap: normalizeBinding(step.tap) }
      if ("delay" in step) return { delay: { delayMs: step.delay.delayMs ?? 0 } }
      if ("keyTapSequence" in step) return step
      throw Error("The macro contains an unrecognized step.")
    })
  }
  return reply
}
