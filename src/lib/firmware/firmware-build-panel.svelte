<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import { Textarea } from '$lib/components/ui/textarea'

  const receiverProfile = 'minew-nrf54lm20a'
  let repository = $state<HTMLInputElement | null>(null)
  let revision = $state('')
  let modules = $state<HTMLTextAreaElement | null>(null)
  let triMode = $state(false)
  let studio = $state(false)
  let status = $state('')

  function isGitHubRepository(value: string) {
    return /^https:\/\/github\.com\/[\w-]+\/(?!\.{1,2}\/?$)[\w.-]+\/?$/i.test(value)
  }

  function clearValidation(event: Event) {
    const field = event.target
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.setCustomValidity('')
    }
    status = ''
  }

  function exportPlan(event: SubmitEvent) {
    event.preventDefault()
    if (!repository || !modules) return

    const repoUrl = repository.value.trim()
    const moduleUrls = modules.value.split('\n').map((url) => url.trim()).filter(Boolean)

    if (!isGitHubRepository(repoUrl)) {
      repository.setCustomValidity('Enter a GitHub repository URL in the form https://github.com/owner/repo.')
      repository.reportValidity()
      return
    }

    if (moduleUrls.some((url) => !isGitHubRepository(url))) {
      modules.setCustomValidity('Enter one GitHub repository URL per line.')
      modules.reportValidity()
      return
    }

    const plan = {
      schemaVersion: 1,
      repository: repoUrl,
      revision: revision.trim() || null,
      features: { triMode, studio, modules: moduleUrls },
      receiverProfile: triMode ? receiverProfile : null,
      requestedImages: triMode ? ['keyboard', 'receiver'] : ['keyboard'],
    }

    const file = new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const download = document.createElement('a')
    download.href = url
    download.download = 'keyspensory-zmk-build-plan.json'
    download.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status = 'Build plan downloaded.'
  }
</script>

<section class="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8" aria-labelledby="firmware-build-title">
  <h1 id="firmware-build-title" class="text-2xl font-semibold">Build firmware</h1>
  <p class="mt-2 text-sm text-muted-foreground">
    Prepare a firmware build plan for a ZMK config. The plan records your selections for a separate build and flash workflow.
  </p>

  <form class="mt-6 grid gap-6" onsubmit={exportPlan} oninput={clearValidation}>
    <fieldset class="grid min-w-0 gap-4 rounded-lg border p-5">
      <legend class="px-2 text-sm font-medium">Source</legend>
      <label class="grid gap-2 text-sm">
        GitHub ZMK config repository
        <Input type="url" bind:ref={repository} placeholder="https://github.com/owner/zmk-config" required />
      </label>
      <label class="grid gap-2 text-sm">
        Branch, tag, or commit (optional)
        <Input bind:value={revision} placeholder="Repository default branch" spellcheck={false} />
      </label>
    </fieldset>

    <fieldset class="grid min-w-0 gap-5 rounded-lg border p-5">
      <legend class="px-2 text-sm font-medium">Firmware features</legend>
      <div class="flex items-center justify-between gap-4">
        <div>
          <label for="firmware-trimode" class="text-sm font-medium">Enable tri-mode</label>
          <p id="firmware-trimode-help" class="mt-1 text-sm text-muted-foreground">
            Wired USB, Bluetooth, and proprietary 2.4 GHz through a matching receiver.
          </p>
        </div>
        <Switch id="firmware-trimode" aria-describedby="firmware-trimode-help" bind:checked={triMode} onCheckedChange={() => status = ''} />
      </div>
      {#if triMode}
        <div class="rounded-md border bg-muted/20 p-4 text-sm">
          <p class="font-medium">Receiver profile</p>
          <p class="mt-1">Keyspensory nRF54LM20A dev pair (experimental)</p>
          <p class="mt-2 text-muted-foreground">
            The dev pair currently uses separate USB/Bluetooth and 2.4 GHz keyboard images. A single tri-mode image is pending hardware validation.
          </p>
        </div>
      {/if}
      <div class="flex items-center justify-between gap-4">
        <label for="firmware-studio" class="text-sm font-medium">Request ZMK Studio support</label>
        <Switch id="firmware-studio" bind:checked={studio} onCheckedChange={() => status = ''} />
      </div>
      <label class="grid gap-2 text-sm">
        Additional ZMK module repositories (optional)
        <Textarea bind:ref={modules} rows={3} aria-describedby="firmware-modules-help" placeholder="https://github.com/owner/zmk-module" spellcheck={false} />
        <span id="firmware-modules-help" class="text-muted-foreground">Enter one GitHub repository URL per line.</span>
      </label>
    </fieldset>

    <div class="grid gap-3 rounded-lg border p-5">
      <h2 class="text-sm font-medium">Requested firmware</h2>
      <p class="text-sm text-muted-foreground" aria-live="polite">
        {triMode ? 'Tri-mode keyboard firmware and matching 2.4 GHz receiver firmware.' : 'Keyboard firmware using the repository’s build targets.'}
      </p>
      <Button type="submit" class="justify-self-start">Download build plan (.json)</Button>
      <p class="text-sm text-muted-foreground empty:hidden" role="status">{status}</p>
    </div>
  </form>
</section>
