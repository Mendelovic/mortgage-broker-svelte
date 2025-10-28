<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		onLogout: () => void;
	}

	let { children, onLogout }: Props = $props();
</script>

<Sidebar.Root side="right" collapsible="offcanvas">
	<Sidebar.Header class="flex items-center justify-between px-4 py-3" dir="rtl">
		<Button class="relative" type="button" variant="outline" size="icon" onclick={toggleMode}>
			<SunIcon
				class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 !transition-all dark:scale-0 dark:-rotate-90"
			/>
			<MoonIcon
				class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 !transition-all dark:scale-100 dark:rotate-0"
			/>
			<span class="sr-only">Toggle theme</span>
		</Button>
	</Sidebar.Header>

	<Sidebar.Content class="px-2" dir="rtl">
		{@render children?.()}
	</Sidebar.Content>

	<Sidebar.Footer class="p-4" dir="rtl">
		<Button
			class="w-full justify-center"
			type="button"
			variant="outline"
			onclick={() => onLogout()}
		>
			התנתקות
		</Button>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
