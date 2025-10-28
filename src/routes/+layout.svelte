<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { syncSessionCookie } from '$lib/auth/session';

	let { children, data } = $props();
	const user = $derived(data?.user);
	const supabase = $derived(data.supabase);

	async function handleLogout() {
		try {
			await supabase.auth.signOut();
			await syncSessionCookie(null);
			await Promise.all([invalidate('supabase:auth'), invalidateAll()]);
		} finally {
			await goto('/login', { invalidateAll: true });
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if user}
	<Sidebar.Provider>
		<AppSidebar onLogout={handleLogout} />

		<div class="flex min-h-svh w-full flex-1 flex-col bg-muted/40">
			<header class="flex justify-start px-4 py-3 md:hidden">
				<Sidebar.Trigger aria-label="Toggle sidebar" />
			</header>
			<main class="flex flex-1 flex-col">
				{@render children?.()}
			</main>
		</div>
	</Sidebar.Provider>
{:else}
	{@render children?.()}
{/if}
