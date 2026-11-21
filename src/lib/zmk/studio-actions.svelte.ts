import {
  macroRequest,
  runtimeMacroId,
  type Combo,
  type Macro,
  type MacroEdit,
  type MacroList,
  type Step,
} from "./action-protocol"
import type { StudioSession } from "./studio-session"

function sameCombo(a: Combo, b: Combo) {
  return (
    a.index === b.index &&
    a.timeoutMs === b.timeoutMs &&
    a.requirePriorIdleMs === b.requirePriorIdleMs &&
    a.slowRelease === b.slowRelease &&
    a.layerMask === b.layerMask &&
    a.keyPositions.join() === b.keyPositions.join() &&
    (!a.keyPositions.length ||
      (a.behavior?.behaviorId === b.behavior?.behaviorId &&
        a.behavior?.param1 === b.behavior?.param1 &&
        a.behavior?.param2 === b.behavior?.param2))
  )
}

export class StudioActions {
  combos = $state.raw<Combo[]>([])
  comboMessage = $state("")
  macros = $state.raw<MacroList>()
  macro = $state.raw<Macro>()
  macroMessage = $state("")
  private moduleIndex?: number

  async readCombos(active: StudioSession) {
    try {
      const { listAllCombos } = await active.comboRequest({ listAllCombos: true })
      if (!listAllCombos) throw Error("No combo listing.")
      this.combos = listAllCombos.combos
      this.comboMessage = this.combos.length ? "" : "This keyboard has no combo slots."
    } catch {
      this.combos = []
      this.comboMessage = "Could not read combo slots from this firmware."
    }
  }

  async writeCombo(
    active: StudioSession,
    original: Combo,
    next: Combo,
    persist: (session: StudioSession) => Promise<void>,
  ) {
    const get = async () => {
      const { getCombo } = await active.comboRequest({ getCombo: { index: next.index } })
      if (!getCombo || getCombo.index !== next.index) throw Error("Combo readback failed.")
      return getCombo
    }
    try {
      const current = await get()
      if (!sameCombo(current, original)) throw Error("This combo changed. Review the keyboard values.")
      const { setCombo } = await active.comboRequest({ setCombo: { index: next.index, combo: next } })
      if (!setCombo?.ok) throw Error("The keyboard rejected this combo.")
      await persist(active)
      const actual = await get()
      if (!sameCombo(actual, next)) throw Error("Combo readback differs from the requested edit.")
      this.combos = this.combos.map((item) => (item.index === next.index ? actual : item))
    } catch (error) {
      await this.readCombos(active)
      throw error
    }
  }

  async discoverMacros(active: StudioSession) {
    try {
      const { list } = await active.moduleRequest({ list: {} })
      this.moduleIndex = list?.subsystems.find((item) => item.identifier === runtimeMacroId)?.index
      if (this.moduleIndex === undefined) throw Error("No runtime macro module.")
      await this.refreshMacros(active)
      this.macroMessage = ""
    } catch {
      this.macros = undefined
      this.macroMessage = "Could not read the runtime macro module."
    }
  }

  private async refreshMacros(active: StudioSession) {
    if (this.moduleIndex === undefined) throw Error("Runtime macro module unavailable.")
    const { listMacros } = await macroRequest(active, this.moduleIndex, { listMacros: {} })
    if (!listMacros) throw Error("Missing macro list.")
    this.macros = listMacros
  }

  async readMacro(active: StudioSession, slot: number) {
    this.macro = undefined
    if (this.moduleIndex === undefined) throw Error("Runtime macro module unavailable.")
    const { getMacro } = await macroRequest(active, this.moduleIndex, { getMacro: { slot } })
    if (getMacro?.macro?.slot !== slot) throw Error("Macro readback failed.")
    this.macro = getMacro.macro
    return this.macro
  }

  async createMacro(active: StudioSession, name: string) {
    if (this.moduleIndex === undefined) throw Error("Runtime macro module unavailable.")
    try {
      const reply = await macroRequest(active, this.moduleIndex, {
        createMacro: { name, persist: true },
      })
      if (!reply.status) throw Error("The keyboard rejected this macro.")
    } finally {
      await this.refreshMacros(active)
    }
    const entry = this.macros?.macros.find((item) => item.name === name)
    if (!entry || entry.hasUnsavedChanges) throw Error("Macro creation was not confirmed.")
    await this.readMacro(active, entry.slot)
  }

  async writeStep(active: StudioSession, original: Macro, edit: MacroEdit, expected: Step[]) {
    if (this.moduleIndex === undefined) throw Error("Runtime macro module unavailable.")
    const { slot, name } = original
    const current = await this.readMacro(active, slot)
    if (current.name !== name || JSON.stringify(current.steps) !== JSON.stringify(original.steps))
      throw Error("This macro changed. Review the keyboard values.")
    try {
      const reply = await macroRequest(active, this.moduleIndex, edit)
      if (!reply.status) throw Error("The keyboard rejected this macro step.")
    } finally {
      await this.readMacro(active, slot)
      await this.refreshMacros(active)
    }
    const summary = this.macros?.macros.find((item) => item.slot === slot)
    if (
      this.macro?.name !== name ||
      JSON.stringify(this.macro.steps) !== JSON.stringify(expected) ||
      !summary ||
      summary.hasUnsavedChanges
    )
      throw Error("Macro readback differs from the requested edit.")
  }
}
