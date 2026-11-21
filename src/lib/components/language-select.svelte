<script lang="ts">
  import { language, languageNames, setLanguage, t, type Language } from "$lib/i18n"
</script>

<select
  aria-label={$t("Language")}
  class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  value={$language}
  onchange={(event) => setLanguage(event.currentTarget.value as Language)}
>
  {#each Object.entries(languageNames) as [code, name]}
    <option value={code} lang={code}>{name}</option>
  {/each}
</select>
