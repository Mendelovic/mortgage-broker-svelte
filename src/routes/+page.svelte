<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { fromStore } from 'svelte/store';
	import { enhance } from '$app/forms';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import SendIcon from '@lucide/svelte/icons/send';
	import XIcon from '@lucide/svelte/icons/x';
	import type { DocumentArtifactSummary, SessionMessage } from '$lib/api/types';
	import type { SubmitFunction } from '@sveltejs/kit';
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
	let fileInput: HTMLInputElement | null = null;
	let composerForm: HTMLFormElement | null = null;
	let pendingMessages = $state<DisplayMessage[]>([]);
	let sendErrorMessage = $state<DisplayMessage | null>(null);
	let reduceMotion = false;
	let prefersReducedMotionQuery: MediaQueryList | null = null;
	let dragDepth = 0;

	type AttachmentItem = {
		id: string;
		file: File;
	};

	type DisplayAttachment = {
		name: string;
		mime_type: string | null;
	};

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
		attachments?: DisplayAttachment[];
		isError?: boolean;
	};

	const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
	const allowedExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg']);

	const documentAttachmentMap: Map<string, DisplayAttachment[]> = $derived(
		buildDocumentAttachmentMap(selectedSession?.messages ?? [], selectedSession?.documents ?? null)
	);

	const messages = $derived([
		...(selectedSession?.messages ?? [])
			.map(transformSessionMessage)
			.filter((message) => message.text.length > 0 || (message.attachments?.length ?? 0) > 0),
		...pendingMessages,
		...(sendErrorMessage ? [sendErrorMessage] : [])
	]);

	let attachments = $state<AttachmentItem[]>([]);
	let isDragOver = $state(false);
	let attachmentError = $state<string | null>(null);

	function fileKey(file: File) {
		return `${file.name}:${file.size}:${file.lastModified}`;
	}

	function syncFileInput() {
		if (!browser || !fileInput) return;
		if (attachments.length === 0) {
			fileInput.value = '';
			return;
		}
		if (typeof DataTransfer === 'undefined') return;
		const dt = new DataTransfer();
		for (const { file } of attachments) {
			dt.items.add(file);
		}
		(fileInput as HTMLInputElement & { files: FileList }).files = dt.files;
	}

	function isAllowedFile(file: File) {
		const mime = file.type?.toLowerCase();
		if (mime && allowedMimeTypes.has(mime)) return true;
		const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
		return allowedExtensions.has(extension);
	}

	function addFiles(input: FileList | File[] | null) {
		if (!input || input.length === 0) return;

		const candidates = Array.from(input);
		const rejected: string[] = [];
		const existingKeys = new Set(attachments.map(({ file }) => fileKey(file)));

		const nextAttachments = candidates
			.filter((file) => {
				if (!isAllowedFile(file)) {
					rejected.push(file.name);
					return false;
				}
				if (existingKeys.has(fileKey(file))) {
					return false;
				}
				return true;
			})
			.map((file) => ({
				id:
					typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
						? crypto.randomUUID()
						: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
				file
			}));

		if (nextAttachments.length) {
			attachments = [...attachments, ...nextAttachments];
			attachmentError = null;
			syncFileInput();
		}

		if (rejected.length) {
			const displayed = rejected.slice(0, 3).join(', ');
			const suffix = rejected.length > 3 ? ` ועוד ${rejected.length - 3} קבצים` : '';
			attachmentError = `לא ניתן לצרף את הקבצים: ${displayed}${suffix ? suffix : ''}. ניתן לצרף רק קובצי PDF או תמונות PNG / JPG.`;
		}

		syncFileInput();
	}

	function handleFileInputChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		addFiles(target.files);
	}

	function removeAttachment(id: string) {
		attachments = attachments.filter((item) => item.id !== id);
		if (attachments.length === 0) {
			attachmentError = null;
		}
		syncFileInput();
	}

	function openFilePicker() {
		fileInput?.click();
	}

	function eventHasFiles(event: DragEvent) {
		return Array.from(event.dataTransfer?.types ?? []).includes('Files');
	}

	function handleDragEnter(event: DragEvent) {
		if (!eventHasFiles(event)) return;
		event.preventDefault();
		dragDepth += 1;
		isDragOver = true;
	}

	function handleDragOver(event: DragEvent) {
		if (!eventHasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent) {
		if (!eventHasFiles(event)) return;
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) {
			isDragOver = false;
		}
	}

	function handleDrop(event: DragEvent) {
		if (!eventHasFiles(event)) return;
		event.preventDefault();
		addFiles(event.dataTransfer?.files ?? null);
		dragDepth = 0;
		isDragOver = false;
	}

	function formatFileSize(size: number) {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
		return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
	}

	function formatMimeLabel(mime: string) {
		const normalised = mime.toLowerCase();
		if (normalised === 'application/pdf') return 'PDF';
		if (normalised.startsWith('image/')) {
			const subtype = normalised.split('/')[1];
			return subtype ? subtype.toUpperCase() : 'IMAGE';
		}
		return normalised;
	}

	onMount(() => {
		let destroyed = false;

		if (browser) {
			prefersReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			reduceMotion = prefersReducedMotionQuery.matches;
			if (typeof prefersReducedMotionQuery.addEventListener === 'function') {
				prefersReducedMotionQuery.addEventListener('change', handleReduceMotionPreference);
			} else if (typeof prefersReducedMotionQuery.addListener === 'function') {
				// Fallback for Safari < 14
				prefersReducedMotionQuery.addListener(handleReduceMotionPreference);
			}
		}

		void (async () => {
			await initializeChat();
			if (destroyed) return;

			await tick();
			scrollToBottom();
		})();

		return () => {
			destroyed = true;
			if (!prefersReducedMotionQuery) return;
			if (typeof prefersReducedMotionQuery.removeEventListener === 'function') {
				prefersReducedMotionQuery.removeEventListener('change', handleReduceMotionPreference);
			} else if (typeof prefersReducedMotionQuery.removeListener === 'function') {
				prefersReducedMotionQuery.removeListener(handleReduceMotionPreference);
			}
		};
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
			const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
			messagesPane.scrollTo({
				top: messagesPane.scrollHeight,
				behavior
			});
		}
	}

	function handleReduceMotionPreference(event: MediaQueryListEvent | MediaQueryList) {
		reduceMotion = event.matches;
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

	async function sendMessage(trimmed: string) {
		if (!trimmed || chatLoading.isSending) return;

		const originalMessage = composedMessage;
		const now = new Date();
		const filesToUpload = attachments.map((item) => item.file);
		const optimisticAttachments: DisplayAttachment[] = attachments.map(({ file }) => ({
			name: file.name,
			mime_type: file.type || null
		}));
		const optimisticMessage: DisplayMessage = {
			id: `temp-${now.getTime()}`,
			role: 'user',
			text: trimmed,
			attachments: optimisticAttachments.length ? optimisticAttachments : undefined
		};

		pendingMessages = [...pendingMessages, optimisticMessage];
		sendErrorMessage = null;
		composedMessage = '';
		resetComposerHeight();

		try {
			await sendChatMessage({ message: trimmed, files: filesToUpload });
			pendingMessages = [];
			sendErrorMessage = null;
			attachments = [];
			attachmentError = null;
			syncFileInput();
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
			composerForm?.requestSubmit();
		}
	}

	const handleEnhancedSubmit: SubmitFunction = ({ formData, cancel }) => {
		cancel();
		if (chatLoading.isSending) return;
		const messageValue = formData.get('message');
		const trimmed = typeof messageValue === 'string' ? messageValue.trim() : '';
		if (!trimmed) {
			return;
		}
		void sendMessage(trimmed);
	};

	function transformSessionMessage(message: SessionMessage): DisplayMessage {
		const inferredAttachments = extractAttachments(message.content);
		const mappedAttachments = documentAttachmentMap.get(`${message.id}`) ?? [];
		const attachments = dedupeAttachments([...inferredAttachments, ...mappedAttachments]);
		return {
			id: `${message.id}`,
			role: message.role === 'assistant' || message.role === 'user' ? message.role : 'system',
			text: extractMessageText(message.content),
			attachments: attachments.length > 0 ? attachments : undefined
		};
	}

	function buildDocumentAttachmentMap(
		messages: SessionMessage[],
		documents: DocumentArtifactSummary[] | null
	) {
		const map = new Map<string, DisplayAttachment[]>();
		if (!documents || documents.length === 0) return map;

		const userMessages = messages
			.filter((message) => message.role === 'user')
			.map((message) => ({
				id: `${message.id}`,
				time: Date.parse(message.created_at)
			}))
			.filter((entry) => Number.isFinite(entry.time))
			.sort((a, b) => a.time - b.time);

		if (userMessages.length === 0) return map;

		const sortedDocuments = [...documents].sort((a, b) => {
			const aTime = Date.parse(a.uploaded_at ?? a.extracted_at ?? '');
			const bTime = Date.parse(b.uploaded_at ?? b.extracted_at ?? '');
			if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
			if (!Number.isFinite(aTime)) return 1;
			if (!Number.isFinite(bTime)) return -1;
			return aTime - bTime;
		});

		for (const document of sortedDocuments) {
			const name = (document.display_name || document.document_type || document.id || '').trim();
			if (!name) continue;

			const attachment: DisplayAttachment = {
				name,
				mime_type: document.mime_type ?? null
			};

			let target = userMessages[userMessages.length - 1];
			const documentTime = Date.parse(document.uploaded_at ?? document.extracted_at ?? '');
			if (Number.isFinite(documentTime)) {
				let bestDiff = Number.POSITIVE_INFINITY;
				for (const entry of userMessages) {
					const diff = Math.abs(documentTime - entry.time);
					if (diff < bestDiff) {
						bestDiff = diff;
						target = entry;
					}
				}
			}

			const existing = map.get(target.id) ?? [];
			existing.push(attachment);
			map.set(target.id, existing);
		}

		return map;
	}

	function extractAttachments(value: unknown, depth = 0): DisplayAttachment[] {
		if (depth > 5 || value === null || value === undefined) return [];
		if (Array.isArray(value)) {
			return value.flatMap((item) => extractAttachments(item, depth + 1));
		}
		if (typeof value === 'object') {
			const record = value as Record<string, unknown>;
			const attachments: DisplayAttachment[] = [];
			if (isAttachmentRecord(record)) {
				attachments.push({
					name: extractAttachmentName(record),
					mime_type: extractAttachmentMime(record)
				});
			}
			for (const child of Object.values(record)) {
				attachments.push(...extractAttachments(child, depth + 1));
			}
			return attachments;
		}
		return [];
	}

	function isAttachmentRecord(record: Record<string, unknown>) {
		const name = extractAttachmentRawName(record);
		const hasName = typeof name === 'string' && name.trim().length > 0;
		if (!hasName) return false;

		const mime = extractAttachmentMime(record);
		const documentType = typeof record.document_type === 'string' ? record.document_type : null;
		const typeValue = typeof record.type === 'string' ? record.type.toLowerCase() : null;
		const category = typeof record.category === 'string' ? record.category.toLowerCase() : null;

		const fileHints = [
			'mime_type' in record,
			'content_type' in record,
			'document_type' in record,
			typeof record.file_id === 'string',
			typeof record.url === 'string',
			typeof record.bucket_id === 'string',
			typeof record.file === 'object' && record.file !== null,
			typeValue === 'file' ||
				typeValue === 'document' ||
				typeValue === 'attachment' ||
				typeValue === 'input_file' ||
				typeValue === 'output_file',
			category === 'file' || category === 'document'
		];

		const hasMime = typeof mime === 'string' && mime.trim().length > 0;
		return hasMime || fileHints.some(Boolean) || documentType !== null;
	}

	function extractAttachmentRawName(record: Record<string, unknown>) {
		return typeof record.display_name === 'string'
			? record.display_name
			: typeof record.filename === 'string'
				? record.filename
				: typeof record.file_name === 'string'
					? record.file_name
					: typeof record.name === 'string'
						? record.name
						: null;
	}

	function extractAttachmentName(record: Record<string, unknown>) {
		const raw = extractAttachmentRawName(record);
		return raw ? raw.trim() : 'קובץ';
	}

	function extractAttachmentMime(record: Record<string, unknown>) {
		const mime =
			typeof record.mime_type === 'string'
				? record.mime_type
				: typeof record.content_type === 'string'
					? record.content_type
					: typeof record.type === 'string' && record.type.includes('/')
						? record.type
						: null;
		return mime ? mime.trim() : null;
	}

	function dedupeAttachments(list: DisplayAttachment[]) {
		const seen = new Set<string>();
		const result: DisplayAttachment[] = [];
		for (const item of list) {
			if (!item.name) continue;
			const key = `${item.name}|${item.mime_type ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(item);
		}
		return result;
	}

	function extractMessageText(value: unknown, depth = 0): string {
		if (depth > 5) return '';
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

<div class="chat-layout flex w-full overflow-hidden">
	<div
		class="relative flex flex-1 flex-col overflow-hidden"
		role="region"
		aria-label="אזור השיחה וגרירת הקבצים"
		ondragenter={handleDragEnter}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		{#if isDragOver}
			<div
				class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-sm"
			>
				<div
					class="rounded-3xl border border-dashed border-primary/60 bg-background/90 px-6 py-5 text-center shadow-lg"
				>
					<p class="text-base font-medium text-primary">שחררו כאן כדי לצרף קבצים</p>
					<p class="mt-1 text-xs text-muted-foreground">
						ניתן גם להשתמש בכפתור ההוספה מתחת לשדה ההקלדה
					</p>
				</div>
			</div>
		{/if}
		<div
			class="safe-area-scroll flex-1 overflow-y-auto px-4 pt-6 sm:px-8 sm:pt-10"
			bind:this={messagesPane}
		>
			<div class="mx-auto flex w-full max-w-3xl flex-col gap-4" role="log">
				{#each messages as message (message.id)}
					{#if message.isError}
						<div class="flex justify-start">
							<div
								class="flex max-w-[92vw] items-start gap-3 rounded-3xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm leading-relaxed text-destructive shadow-sm sm:max-w-md sm:text-base"
							>
								<AlertTriangleIcon class="mt-1 size-5 shrink-0" />
								<p class="whitespace-pre-wrap">{message.text}</p>
							</div>
						</div>
					{:else if message.role === 'assistant'}
						<div class="flex justify-start">
							<div
								class="max-w-[92vw] text-sm leading-relaxed whitespace-pre-wrap text-foreground sm:max-w-4xl sm:text-base"
							>
								{message.text}
								{#if message.attachments && message.attachments.length > 0}
									<ul class="message-attachments">
										{#each message.attachments as attachment}
											<li>
												<span aria-hidden="true">📎</span>
												<span class="attachment-name">{attachment.name}</span>
												{#if attachment.mime_type}
													<span class="attachment-meta"
														>({formatMimeLabel(attachment.mime_type)})</span
													>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{:else if message.role === 'user'}
						<div class="flex justify-end" dir="ltr">
							<div
								class="max-w-[92vw] rounded-3xl bg-primary px-5 py-4 text-sm leading-relaxed text-primary-foreground shadow-lg sm:max-w-[82%] sm:text-base"
							>
								<p class="text-right whitespace-pre-wrap" dir="auto">{message.text}</p>
								{#if message.attachments && message.attachments.length > 0}
									<ul class="message-attachments user">
										{#each message.attachments as attachment}
											<li>
												<span aria-hidden="true">📎</span>
												<span class="attachment-name">{attachment.name}</span>
												{#if attachment.mime_type}
													<span class="attachment-meta"
														>({formatMimeLabel(attachment.mime_type)})</span
													>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				{/each}

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
		<div
			class="safe-area-inset shrink-0 bg-linear-to-t from-background via-background/95 to-background/80 px-4 pt-2 backdrop-blur-sm sm:px-8 sm:pt-4"
		>
			<form
				class="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:gap-3"
				method="POST"
				bind:this={composerForm}
				use:enhance={handleEnhancedSubmit}
				novalidate
				enctype="multipart/form-data"
			>
				<input
					class="sr-only"
					type="file"
					name="files"
					accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
					multiple
					bind:this={fileInput}
					onchange={handleFileInputChange}
					tabindex="-1"
				/>
				<input type="hidden" name="thread_id" value={selectedSessionId ?? ''} />
				{#if attachments.length > 0}
					<ul
						class="flex flex-wrap gap-2 rounded-3xl border border-primary/30 bg-primary/5 p-3 text-sm dark:border-primary/40 dark:bg-primary/10"
					>
						{#each attachments as attachment (attachment.id)}
							<li
								class="flex items-center gap-3 rounded-2xl bg-primary/20 px-3 py-2 text-primary-foreground shadow-sm dark:bg-primary/30"
							>
								<div class="flex flex-col text-right">
									<span class="font-medium">{attachment.file.name}</span>
									<span class="text-xs text-primary-foreground/80"
										>{formatFileSize(attachment.file.size)}</span
									>
								</div>
								<button
									class="inline-flex size-7 items-center justify-center rounded-full bg-primary/30 text-primary-foreground transition hover:bg-primary/40 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none dark:bg-primary/40 dark:hover:bg-primary/50"
									type="button"
									onclick={() => removeAttachment(attachment.id)}
								>
									<XIcon class="h-3.5 w-3.5" />
									<span class="sr-only">הסרת קובץ</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if attachmentError}
					<p class="text-right text-sm text-destructive" aria-live="polite">{attachmentError}</p>
				{:else}
					<p class="text-right text-xs text-muted-foreground">
						ניתן לצרף קובצי PDF, PNG או JPG בלבד.
					</p>
				{/if}
				<div
					class="flex w-full items-end gap-2 rounded-3xl border border-primary/30 bg-primary/10 p-2.5 shadow-xl backdrop-blur focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/30 sm:gap-3 sm:p-3 dark:border-primary/40 dark:bg-primary/20"
				>
					<button
						class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/30 text-primary-foreground transition hover:bg-primary/40 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none dark:bg-primary/40 dark:hover:bg-primary/50"
						type="button"
						onclick={openFilePicker}
						aria-label="צרפו קבצים להודעה"
						disabled={chatLoading.isSending}
					>
						<PaperclipIcon class="h-4 w-4" />
					</button>
					<textarea
						class="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-1 py-2 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-70 sm:px-2"
						name="message"
						bind:value={composedMessage}
						bind:this={composer}
						oninput={autoResize}
						onkeydown={handleKeyDown}
						dir="rtl"
						inputmode="text"
						placeholder="אני מעוניין לקנות נכס ב..."
						enterkeyhint="send"
						rows="1"
						required
						disabled={chatLoading.isSending}
					></textarea>
					<button
						class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
						type="submit"
						aria-label="שליחת הודעה"
						disabled={browser && (chatLoading.isSending || composedMessage.trim().length === 0)}
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
	.chat-layout {
		min-height: 100vh;
		height: 100vh;
	}

	@supports (height: 100svh) {
		.chat-layout {
			min-height: 100svh;
			height: 100svh;
		}
	}

	@supports (height: 100dvh) {
		.chat-layout {
			min-height: 100dvh;
			height: 100dvh;
		}
	}

	.safe-area-scroll {
		--chat-scroll-pb: 1.5rem;
		padding-bottom: var(--chat-scroll-pb);
		scroll-padding-bottom: var(--chat-scroll-pb);
	}

	@media (min-width: 640px) {
		.safe-area-scroll {
			--chat-scroll-pb: 2rem;
		}
	}

	@media (min-width: 1024px) {
		.safe-area-scroll {
			--chat-scroll-pb: 2.5rem;
		}
	}

	.safe-area-inset {
		padding-bottom: 1rem;
	}

	@supports (padding-bottom: constant(safe-area-inset-bottom)) {
		.safe-area-scroll {
			padding-bottom: calc(var(--chat-scroll-pb) + constant(safe-area-inset-bottom));
			scroll-padding-bottom: calc(var(--chat-scroll-pb) + constant(safe-area-inset-bottom));
		}

		.safe-area-inset {
			padding-bottom: calc(1rem + constant(safe-area-inset-bottom));
		}
	}

	@supports (padding-bottom: env(safe-area-inset-bottom)) {
		.safe-area-scroll {
			padding-bottom: calc(var(--chat-scroll-pb) + env(safe-area-inset-bottom));
			scroll-padding-bottom: calc(var(--chat-scroll-pb) + env(safe-area-inset-bottom));
		}

		.safe-area-inset {
			padding-bottom: calc(1rem + env(safe-area-inset-bottom));
		}
	}

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

	.message-attachments {
		margin-top: 0.75rem;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.4rem;
		font-size: 0.85em;
		line-height: 1.2;
		color: inherit;
	}

	.message-attachments.user {
		direction: rtl;
		text-align: right;
	}

	.message-attachments li {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.message-attachments .attachment-name {
		font-weight: 500;
	}

	.message-attachments .attachment-meta {
		font-weight: 400;
		color: color-mix(in srgb, currentColor 70%, transparent);
	}
</style>
