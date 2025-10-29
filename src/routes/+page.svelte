<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fromStore } from 'svelte/store';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import MicIcon from '@lucide/svelte/icons/mic';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SendIcon from '@lucide/svelte/icons/send';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import type { SessionMessage, SessionSummary } from '$lib/api/types';
	import {
		chatErrorStore,
		chatLoadingStore,
		initializeChat,
		selectedSessionIdStore,
		selectedSessionStore,
		selectedSummaryStore,
		sendChatMessage
	} from '$lib/stores/chat';

	const quickPrompts = [
		'השוואה בין מסלול פריים לקבועה צמודה',
		'אומדן עלויות סגירה לנכס חדש',
		'בדיקת זכאות להטבת משכנתא ירוקה',
		'תכנון החזר חודשי לפי הכנסה'
	];

	let composedMessage = $state<string>('');
	let messagesPane: HTMLDivElement | null = null;
	let composer: HTMLTextAreaElement | null = null;
	let pendingMessages = $state<DisplayMessage[]>([]);

	const chatLoadingRune = fromStore(chatLoadingStore);
	const chatLoading = $derived(chatLoadingRune.current);

	const chatErrorRune = fromStore(chatErrorStore);
	const chatError = $derived(chatErrorRune.current);

	const selectedSessionRune = fromStore(selectedSessionStore);
	const selectedSession = $derived(selectedSessionRune.current);

	const selectedSummaryRune = fromStore(selectedSummaryStore);
	const selectedSummary = $derived(selectedSummaryRune.current);

	const selectedSessionIdRune = fromStore(selectedSessionIdStore);
	const selectedSessionId = $derived(selectedSessionIdRune.current);

	type DisplayMessage = {
		id: string;
		role: 'assistant' | 'user' | 'system';
		text: string;
		timestamp: string;
	};

const messages = $derived([
	...(selectedSession?.messages ?? [])
		.map(transformSessionMessage)
		.filter((message) => message.text.length > 0),
	...pendingMessages
]);
const isConversationEmpty = $derived(messages.length === 0);

	onMount(async () => {
		await initializeChat();
		await tick();
		scrollToBottom();
	});

	let lastSignature = '';
	$effect(() => {
		const signature = `${selectedSessionId ?? 'new'}:${messages.map((message) => message.id).join(',')}`;
		if (signature === lastSignature) return;
		lastSignature = signature;

		void tick().then(() => {
			scrollToBottom();
			if (!selectedSessionId) {
				composer?.focus();
			}
		});
	});

	async function scrollToBottom() {
		await tick();
		if (messagesPane) {
			messagesPane.scrollTo({
				top: messagesPane.scrollHeight,
				behavior: 'smooth'
			});
		}
	}

	function autoResize(event: Event) {
		const target = event.currentTarget as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
	}

	function resetComposerHeight() {
		if (!composer) return;
		composer.style.height = 'auto';
	}

	function applyPrompt(prompt: string) {
		composedMessage = prompt;
		void tick().then(() => {
			if (!composer) return;
			composer.focus();
			composer.setSelectionRange(prompt.length, prompt.length);
			autoResize({ currentTarget: composer } as unknown as Event);
		});
	}

	async function handleSend() {
		const trimmed = composedMessage.trim();
		if (!trimmed || chatLoading.isSending) return;

		const now = new Date();
		const optimisticMessage: DisplayMessage = {
			id: `temp-${now.getTime()}`,
			role: 'user',
			text: trimmed,
			timestamp: formatTimestamp(now.toISOString())
		};

		pendingMessages = [...pendingMessages, optimisticMessage];

		try {
			await sendChatMessage({ message: trimmed });
			composedMessage = '';
			resetComposerHeight();
			pendingMessages = [];
		} catch (error) {
			pendingMessages = [];
			console.error('Failed to send message', error);
		} finally {
			await tick();
			scrollToBottom();
			composer?.focus();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void handleSend();
		}
	}

	function startNewSession() {
		selectedSessionIdStore.set(null);
		composedMessage = '';
		pendingMessages = [];
		resetComposerHeight();
		void tick().then(() => composer?.focus());
	}

	function formatTimestamp(iso: string) {
		const date = new Date(iso);
		return date.toLocaleTimeString('he-IL', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatSummaryTitle(summary: SessionSummary, index: number) {
		if (summary.latest_message) {
			const preview = buildMessagePreview(summary.latest_message);
			if (preview) {
				return preview;
			}
		}
		return `שיחה ${index + 1}`;
	}

	function buildMessagePreview(message: SessionMessage) {
		const preview = extractMessageText(message.content);
		return preview.length > 0 ? preview.slice(0, 80) : '';
	}

	function transformSessionMessage(message: SessionMessage): DisplayMessage {
		return {
			id: `${message.id}`,
			role: message.role === 'assistant' || message.role === 'user' ? message.role : 'system',
			text: extractMessageText(message.content),
			timestamp: formatTimestamp(message.created_at)
		};
	}

	function extractMessageText(value: unknown, depth = 0): string {
		if (depth > 5) {
			return '';
		}
		if (value === null || value === undefined) return '';
		if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
	if (Array.isArray(value)) {
		return value
			.map((item) => extractMessageText(item, depth + 1))
			.filter(Boolean)
			.join('\n\n');
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.text === 'string') {
			return record.text.trim();
		}
		if (Array.isArray(record.content)) {
			return record.content
				.map((item) => extractMessageText(item, depth + 1))
				.filter(Boolean)
				.join('\n\n');
		}
		const values = Object.values(record)
			.map((item) => extractMessageText(item, depth + 1))
			.filter(Boolean);
		if (values.length > 0) {
			return values.join('\n\n');
		}
	}
	return '';
}
</script>

<div class="flex h-full min-h-[calc(100vh-5rem)] bg-background text-foreground">
	<div class="flex flex-1 flex-col">
		<header class="flex flex-col gap-4 border-b px-4 py-4 sm:px-8">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div class="flex items-start gap-3">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-primary/60 text-lg font-semibold text-primary-foreground shadow-md"
					>
						AI
					</div>
					<div class="space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<h1 class="text-xl font-semibold tracking-tight text-foreground">
								יועץ המשכנתאות החכם
							</h1>
							<span
								class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary uppercase"
							>
								<SparklesIcon class="h-3 w-3" />
								Beta
							</span>
						</div>
						<p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
							השווה הצעות מימון, נהל מסמכים ותקשר עם הלקוחות שלך באמצעות ממשק אחד המכוון לתהליך
							המשכנתא הישראלי.
						</p>
						{#if selectedSummary}
							<div
								class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
							>
								<span class="inline-flex items-center gap-1">
									<CalendarIcon class="h-3.5 w-3.5" />
									עודכן {formatTimestamp(selectedSummary.updated_at)}
								</span>
								<span class="inline-flex items-center gap-1">
									<PhoneIcon class="h-3.5 w-3.5" />
									קישור לשיחת וידאו
								</span>
								<span class="inline-flex items-center gap-1">
									<SparklesIcon class="h-3.5 w-3.5" />
									{selectedSummary.message_count} הודעות
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						class="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:text-foreground lg:hidden"
						type="button"
						onclick={toggleMode}
					>
						<SunIcon class="h-5 w-5 scale-100 transition-all dark:scale-0" />
						<MoonIcon class="absolute h-5 w-5 scale-0 transition-all dark:scale-100" />
						<span class="sr-only">Toggle theme</span>
					</button>
					<button
						class="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
						type="button"
						onclick={startNewSession}
					>
						<PlusIcon class="h-4 w-4" />
						שיחה חדשה
					</button>
				</div>
			</div>

			{#if chatError}
				<div
					class="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
				>
					{chatError}
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2 sm:gap-3">
				{#each quickPrompts as prompt}
					<button
						class="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
						type="button"
						onclick={() => applyPrompt(prompt)}
					>
						<SparklesIcon class="h-3.5 w-3.5 text-primary" />
						{prompt}
					</button>
				{/each}
			</div>
		</header>

		<div class="flex flex-1 flex-col overflow-hidden">
			<div class="flex-1 overflow-hidden">
				<div class="flex h-full flex-col">
					<div class="flex-1 overflow-y-auto px-4 py-6 sm:px-8" bind:this={messagesPane}>
						<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
							{#if isConversationEmpty}
								<div
									class="rounded-3xl border border-dashed border-muted bg-muted/40 px-8 py-12 text-center text-sm text-muted-foreground"
								>
									{#if selectedSessionId}
										לא נמצאו הודעות לשיחה זו. התחילו הודעה חדשה כדי להמשיך את הדיון.
									{:else}
										פתחו שיחה חדשה כדי לבנות סימולציית מימון חכמה על בסיס פרטי הלקוח.
									{/if}
								</div>
							{:else}
								{#each messages as message (message.id)}
									<div
										class={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
									>
										<div
											class={[
												'max-w-[82%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-sm sm:text-base',
												message.role === 'assistant'
													? 'border border-border bg-card text-foreground'
													: 'bg-primary text-primary-foreground shadow-lg'
											].join(' ')}
										>
											<p class="whitespace-pre-wrap">{message.text}</p>
											<span
												class="mt-3 block text-right text-[0.65rem] tracking-wide text-muted-foreground uppercase"
											>
												{message.timestamp}
											</span>
										</div>
									</div>
								{/each}
							{/if}

							{#if chatLoading.isSending}
								<div class="flex justify-start">
									<div
										class="inline-flex items-center gap-2 rounded-3xl border border-border bg-card/90 px-4 py-3 text-sm text-muted-foreground"
									>
										<Loader2Icon class="h-4 w-4 animate-spin" />
										הודעה נשלחת...
									</div>
								</div>
							{/if}
						</div>
					</div>

					<div class="border-t bg-background/95">
						<form
							class="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:gap-4 sm:px-8"
							onsubmit={(event) => {
								event.preventDefault();
								void handleSend();
							}}
						>
							<div class="relative w-full">
								<textarea
									class="peer w-full resize-none rounded-2xl border border-border bg-muted/40 px-4 py-3 pr-24 text-sm text-foreground shadow-sm transition outline-none focus:bg-background focus:ring-2 focus:ring-primary/40 disabled:opacity-70 sm:text-base"
									bind:value={composedMessage}
									bind:this={composer}
									oninput={autoResize}
									onkeydown={handleKeyDown}
									placeholder="תארו את הנכס, ההון העצמי וההחזר הרצוי — ואכין לכם תרחיש מימון מלא."
									rows="1"
									aria-label="הקלדת הודעה"
									disabled={chatLoading.isSending}
								></textarea>
								<div class="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2">
									<button
										class="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:text-foreground"
										type="button"
										title="הקלטת הודעת קול"
										disabled={chatLoading.isSending}
									>
										<MicIcon class="h-4 w-4" />
									</button>
									<div class="h-6 w-px bg-border"></div>
									<button
										class="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
										type="submit"
										aria-label="שליחת הודעה"
										disabled={chatLoading.isSending || composedMessage.trim().length === 0}
									>
										{#if chatLoading.isSending}
											<Loader2Icon class="h-4 w-4 animate-spin" />
										{:else}
											<SendIcon class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>
							<div
								class="flex items-center justify-between text-xs text-muted-foreground sm:mx-0 sm:w-auto sm:flex-col sm:items-end sm:gap-1"
							>
								<span>Enter לשליחה · Shift+Enter לשורה חדשה</span>
								<span>מגובה אוטומטית בענן</span>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
