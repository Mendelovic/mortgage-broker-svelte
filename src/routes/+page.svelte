<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import type { PageData } from './$types';
	import { syncSessionCookie } from '$lib/auth/session';

	let { data }: { data: PageData } = $props();
	const user = $derived(data.user);
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

<div>
	<p>Logged in</p>
</div>
