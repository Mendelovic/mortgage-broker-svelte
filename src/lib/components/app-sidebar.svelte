<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import { fromStore } from 'svelte/store';
	import type { SessionSummary } from '$lib/api/types';
	import {
		chatLoadingStore,
		selectSession,
		selectedSessionIdStore,
		sessionSummariesStore
	} from '$lib/stores/chat';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		onLogout: () => void;
	}

	let { children, onLogout }: Props = $props();

	const sessionSummariesState = fromStore(sessionSummariesStore);
	const sessionSummaries = $derived(sessionSummariesState.current);

	const selectedSessionIdState = fromStore(selectedSessionIdStore);
	const selectedSessionId = $derived(selectedSessionIdState.current);

	const chatLoadingState = fromStore(chatLoadingStore);
	const chatLoading = $derived(chatLoadingState.current);

	function handleSelect(sessionId: string) {
		void selectSession(sessionId);
	}

	function handleCreateThread() {
		selectedSessionIdStore.set(null);
	}

	function formatSummaryTitle(summary: SessionSummary, index: number) {
		const title = summaryTitle(summary) || `שיחה ${index + 1}`;
		return title.length > 60 ? `${title.slice(0, 57)}…` : title;
	}

	function buildMessagePreview(summary: SessionSummary) {
		if (!summary.latest_message) return '';
		return extractText(summary.latest_message.content).trim();
	}

	function formatUpdatedAt(iso: string) {
		const date = new Date(iso);
		return date.toLocaleTimeString('he-IL', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function summaryTitle(summary: SessionSummary) {
		const preview = buildMessagePreview(summary);
		if (summary.latest_message?.role === 'user' && preview) {
			return preview;
		}
		if (preview) {
			return `${preview}`;
		}
		return '';
	}

	function extractText(value: unknown, depth = 0): string {
		if (depth > 5) return '';
		if (value === null || value === undefined) return '';
		if (typeof value === 'string') return value.trim();
		if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
		if (Array.isArray(value)) {
			return value
				.map((item) => extractText(item, depth + 1))
				.filter(Boolean)
				.join(' ');
		}
		if (typeof value === 'object') {
			const record = value as Record<string, unknown>;
			if (typeof record.text === 'string') {
				return record.text.trim();
			}
			if (Array.isArray(record.content)) {
				return record.content
					.map((item) => extractText(item, depth + 1))
					.filter(Boolean)
					.join(' ');
			}
			return Object.values(record)
				.map((item) => extractText(item, depth + 1))
				.filter(Boolean)
				.join(' ');
		}
		return '';
	}
</script>

<Sidebar.Root side="right" collapsible="offcanvas">
	<Sidebar.Header class="flex items-center justify-between px-4 py-4" dir="rtl">
		<div class="flex items-center gap-2 text-base font-semibold text-foreground">
			<span>שיחות</span>
		</div>
		<Button class="relative" type="button" variant="outline" size="icon" onclick={toggleMode}>
			<SunIcon
				class="h-[1.2rem] w-[1.2rem] scale-100 transition-all! dark:scale-0 dark:-rotate-90"
			/>
			<MoonIcon
				class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"
			/>
			<span class="sr-only">Toggle theme</span>
		</Button>
	</Sidebar.Header>

	<Sidebar.Content class="flex flex-1 flex-col gap-4 px-4 py-4" dir="rtl">
		<div class="flex items-center justify-between gap-2">
			<Button class="w-full rounded-xl" type="button" onclick={handleCreateThread}>
				<PlusIcon class="size-4" />
				<span>שיחה חדשה</span>
			</Button>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if chatLoading.isLoadingSummaries && sessionSummaries.length === 0}
				<div class="space-y-2.5">
					{#each Array.from({ length: 4 }) as _, index}
						<div class="animate-pulse rounded-3xl border border-border/40 bg-sidebar/50 px-4 py-4">
							<div class="h-4 w-2/3 rounded-full bg-border/50"></div>
							<div class="mt-2 h-3 w-1/2 rounded-full bg-border/40"></div>
						</div>
					{/each}
				</div>
			{:else if sessionSummaries.length === 0}
				<div
					class="rounded-2xl border border-dashed border-border bg-sidebar/60 px-4 py-6 text-center text-sm text-muted-foreground"
				>
					לא נמצאו שיחות. פתחו שיחה חדשה כדי להתחיל.
				</div>
			{:else}
				<div class="space-y-2.5">
					{#each sessionSummaries as summary, index (summary.session_id)}
						<button
							class={[
								'flex w-full flex-col rounded-3xl border px-4 py-4 text-right transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
								summary.session_id === selectedSessionId
									? 'border-primary/50 bg-primary/10 text-foreground shadow-sm'
									: 'border-transparent bg-sidebar/70 text-sidebar-foreground hover:border-border/60 hover:bg-sidebar/90'
							].join(' ')}
							type="button"
							onclick={() => handleSelect(summary.session_id)}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="space-y-1 overflow-hidden">
									<p class="truncate text-sm font-semibold text-foreground">
										{formatSummaryTitle(summary, index)}
									</p>
									<p class="truncate text-xs text-muted-foreground">
										{summary.message_count} הודעות · הודעה אחרונה {formatUpdatedAt(
											summary.updated_at
										)}
									</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if children}
			<div class="pt-2">
				{@render children?.()}
			</div>
		{/if}
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
