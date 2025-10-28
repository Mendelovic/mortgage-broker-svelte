<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		onLogout: () => void;
	}

	let { onLogout }: Props = $props();
</script>

<Sidebar.Root side="right" collapsible="offcanvas">
	<Sidebar.Content class="px-2" dir="rtl"></Sidebar.Content>

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
