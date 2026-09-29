<script lang="ts">
  import { language, setLanguage, type Language } from "$lib/i18n"
</script>

<select
  aria-label="Language / 语言"
  class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  value={$language}
  onchange={(event) => setLanguage(event.currentTarget.value as Language)}
>
  <option value="en">English</option>
  <option value="zh-CN">简体中文</option>
</select>
