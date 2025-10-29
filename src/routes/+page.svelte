<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fromStore } from 'svelte/store';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import SendIcon from '@lucide/svelte/icons/send';
	import type { SessionMessage } from '$lib/api/types';
	import {
		chatLoadingStore,
		initializeChat,
		selectedSessionIdStore,
		selectedSessionStore,
		sendChatMessage
	} from '$lib/stores/chat';

	let composedMessage = $state<string>('');
	let messagesPane: HTMLDivElement | null = null;
	let composer: HTMLTextAreaElement | null = null;
	let pendingMessages = $state<DisplayMessage[]>([]);
	let sendErrorMessage = $state<DisplayMessage | null>(null);

	const chatLoadingRune = fromStore(chatLoadingStore);
	const chatLoading = $derived(chatLoadingRune.current);

	const selectedSessionRune = fromStore(selectedSessionStore);
	const selectedSession = $derived(selectedSessionRune.current);

	const selectedSessionIdRune = fromStore(selectedSessionIdStore);
	const selectedSessionId = $derived(selectedSessionIdRune.current);

	type DisplayMessage = {
		id: string;
		role: 'assistant' | 'user' | 'system';
		text: string;
		isError?: boolean;
	};

	const messages = $derived([
		...(selectedSession?.messages ?? [])
			.map(transformSessionMessage)
			.filter((message) => message.text.length > 0),
		...pendingMessages,
		...(sendErrorMessage ? [sendErrorMessage] : [])
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

	async function handleSend() {
		const originalMessage = composedMessage;
		const trimmed = originalMessage.trim();
		if (!trimmed || chatLoading.isSending) return;

		const now = new Date();
		const optimisticMessage: DisplayMessage = {
			id: `temp-${now.getTime()}`,
			role: 'user',
			text: trimmed
		};

		pendingMessages = [...pendingMessages, optimisticMessage];
		sendErrorMessage = null;
		composedMessage = '';
		resetComposerHeight();

		try {
			await sendChatMessage({ message: trimmed });
			pendingMessages = [];
			sendErrorMessage = null;
		} catch (error) {
			pendingMessages = [];
			sendErrorMessage = {
				id: `error-${now.getTime()}`,
				role: 'assistant',
				text: 'אירעה שגיאה בעת שליחת ההודעה. נסו שוב.',
				isError: true
			};
			composedMessage = originalMessage;
			await tick();
			if (composer) {
				composer.style.height = 'auto';
				composer.style.height = `${Math.min(composer.scrollHeight, 200)}px`;
			}
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

	function transformSessionMessage(message: SessionMessage): DisplayMessage {
		return {
			id: `${message.id}`,
			role: message.role === 'assistant' || message.role === 'user' ? message.role : 'system',
			text: extractMessageText(message.content)
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
			const type = typeof record.type === 'string' ? (record.type as string) : null;
			if (type && ['reasoning', 'tool_use', 'function_call', 'metadata', 'status'].includes(type)) {
				return '';
			}

			const parts: string[] = [];

			if (typeof record.text === 'string') {
				parts.push(record.text);
			}

			const content = record.content;
			if (typeof content === 'string') {
				parts.push(content);
			} else if (Array.isArray(content) || typeof content === 'object') {
				const chunk = extractMessageText(content, depth + 1);
				if (chunk) parts.push(chunk);
			}

			for (const [key, child] of Object.entries(record)) {
				if (['type', 'role', 'id', 'name', 'content', 'text', 'status'].includes(key)) continue;
				const chunk = extractMessageText(child, depth + 1);
				if (chunk) parts.push(chunk);
			}

			return parts
				.map((part) => part.trim())
				.filter(Boolean)
				.join('\n\n');
		}
		return '';
	}
</script>

<div class="flex h-[calc(100dvh-5rem)] overflow-hidden bg-background text-foreground">
	<div class="relative flex flex-1 flex-col overflow-hidden">
		<div
			class="flex-1 scroll-pb-56 overflow-y-auto px-4 py-6 pb-56 sm:px-8"
			bind:this={messagesPane}
		>
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
						{#if message.isError}
							<div class="flex justify-start">
								<div
									class="flex max-w-md items-start gap-3 rounded-3xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm leading-relaxed text-destructive shadow-sm sm:text-base"
								>
									<AlertTriangleIcon class="mt-1 h-5 w-5 shrink-0" />
									<p class="whitespace-pre-wrap">{message.text}</p>
								</div>
							</div>
						{:else if message.role === 'assistant'}
							<div class="flex justify-start">
								<div
									class="max-w-4xl text-sm leading-relaxed whitespace-pre-wrap text-foreground sm:text-base"
								>
									{message.text}
								</div>
							</div>
						{:else if message.role === 'user'}
							<div class="flex justify-end" dir="ltr">
								<div
									class="max-w-[82%] rounded-3xl bg-primary px-5 py-4 text-sm leading-relaxed text-primary-foreground shadow-lg sm:text-base"
								>
									<p class="text-right whitespace-pre-wrap" dir="auto">{message.text}</p>
								</div>
							</div>
						{/if}
					{/each}
				{/if}

				{#if chatLoading.isSending}
					<div class="flex justify-start">
						<div
							class="relative inline-flex w-full max-w-sm flex-col gap-3 overflow-hidden rounded-3xl px-5 py-4 text-muted-foreground"
							role="status"
						>
							<div class="loading-line h-3 w-1/2"></div>
							<div class="loading-line h-3 w-11/12"></div>
							<div class="loading-line h-3 w-2/3"></div>
							<div class="loading-dot-row">
								<span class="loading-dot"></span>
								<span class="loading-dot"></span>
								<span class="loading-dot"></span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
		<div class="pointer-events-none fixed inset-x-0 bottom-0 z-10">
			<form
				class="pointer-events-auto mx-auto flex w-full max-w-3xl items-end gap-3 px-4 pb-4 sm:px-8"
				onsubmit={(event) => {
					event.preventDefault();
					void handleSend();
				}}
			>
				<div
					class="flex flex-1 items-end gap-3 rounded-2xl border border-border/60 bg-background/95 p-3 shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35 focus-within:ring-offset-2 focus-within:ring-offset-background dark:border-border/40 dark:bg-background/80"
				>
					<textarea
						class="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:opacity-70 dark:placeholder:text-muted-foreground/50"
						bind:value={composedMessage}
						bind:this={composer}
						oninput={autoResize}
						onkeydown={handleKeyDown}
						placeholder="תארו את הנכס, ההון העצמי וההחזר הרצוי — ואכין לכם תרחיש מימון מלא."
						rows="1"
						aria-label="הקלדת הודעה"
						disabled={chatLoading.isSending}
					></textarea>
					<button
						class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
			</form>
		</div>
	</div>
</div>

<style>
	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@keyframes floatGlow {
		0%,
		100% {
			transform: translate3d(-8%, -8%, 0) scale(1);
		}
		50% {
			transform: translate3d(8%, 8%, 0) scale(1.05);
		}
	}

	@keyframes dotPulse {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.35;
		}
		50% {
			transform: translateY(-35%);
			opacity: 1;
		}
	}

	.loading-line {
		border-radius: 9999px;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--muted-foreground) 15%, transparent) 0%,
			color-mix(in srgb, var(--muted-foreground) 55%, white 30%) 50%,
			color-mix(in srgb, var(--muted-foreground) 15%, transparent) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.6s ease-in-out infinite;
	}

	.loading-dot-row {
		display: inline-flex;
		gap: 0.35rem;
		padding-top: 0.2rem;
	}

	.loading-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--primary) 42%, white 30%);
		animation: dotPulse 1.2s ease-in-out infinite;
	}

	.loading-dot:nth-child(2) {
		animation-delay: 0.12s;
	}

	.loading-dot:nth-child(3) {
		animation-delay: 0.24s;
	}
</style>
