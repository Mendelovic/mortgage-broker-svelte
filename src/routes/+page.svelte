<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fromStore } from 'svelte/store';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import MicIcon from '@lucide/svelte/icons/mic';
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

	async function handleSend() {
		const trimmed = composedMessage.trim();
		if (!trimmed || chatLoading.isSending) return;

		const now = new Date();
		const optimisticMessage: DisplayMessage = {
			id: `temp-${now.getTime()}`,
			role: 'user',
			text: trimmed
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

<div class="flex h-full min-h-[calc(100vh-5rem)] bg-background text-foreground">
	<div class="flex flex-1 flex-col">
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
									{#if message.role === 'assistant'}
										<div class="flex justify-start">
											<div
												class="max-w-4xl text-sm leading-relaxed whitespace-pre-wrap text-foreground sm:text-base"
											>
												{message.text}
											</div>
										</div>
									{:else}
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
						</form>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
