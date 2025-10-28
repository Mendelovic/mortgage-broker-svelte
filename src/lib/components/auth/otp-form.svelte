<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { REGEXP_ONLY_DIGITS } from 'bits-ui';
	import { createEventDispatcher } from 'svelte';

	interface Props {
		id: string;
		label: string;
		length: number;
		restartLabel: string;
		resendIdleLabel: string;
		resendPendingLabel: string;
		resendCooldownSeconds?: number;
		submitting?: boolean;
		resendPending?: boolean;
		value?: string;
		helperText?: string | null;
		helperTextClass?: string;
	}

	let {
		id,
		label,
		length,
		restartLabel,
		resendIdleLabel,
		resendPendingLabel,
		resendCooldownSeconds = 0,
		submitting = false,
		resendPending = false,
		value = $bindable(''),
		helperText = null,
		helperTextClass = 'text-muted-foreground'
	}: Props = $props();

	const dispatch = createEventDispatcher<{
		submit: SubmitEvent;
		input: Event;
		restart: MouseEvent;
		resend: MouseEvent;
	}>();

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		dispatch('submit', event);
	}

	function handleInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		value = target.value;
		dispatch('input', event);
	}

	function formatCooldown(totalSeconds: number): string {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	const hasCooldown = $derived(resendCooldownSeconds > 0);
	const resendDisabled = $derived(resendPending || hasCooldown);
	const resendLabel = $derived(
		resendPending
			? resendPendingLabel
			: hasCooldown
				? `${resendIdleLabel} (${formatCooldown(resendCooldownSeconds)})`
				: resendIdleLabel
	);
</script>

<form class="space-y-5" onsubmit={handleSubmit}>
	<div class="space-y-2">
		<Label for={id}>{label}</Label>
		<InputOTP.Root
			{id}
			maxlength={length}
			pattern={REGEXP_ONLY_DIGITS}
			dir="ltr"
			bind:value
			oninput={handleInput}
			class="justify-center"
		>
			{#snippet children({ cells })}
				<InputOTP.Group class="gap-2">
					{#each cells.slice(0, 3) as cell}
						<InputOTP.Slot {cell} />
					{/each}
				</InputOTP.Group>
				<InputOTP.Separator />
				<InputOTP.Group class="gap-2">
					{#each cells.slice(3, length) as cell}
						<InputOTP.Slot {cell} />
					{/each}
				</InputOTP.Group>
			{/snippet}
		</InputOTP.Root>

		{#if helperText}
			<p class={`text-sm ${helperTextClass}`}>{helperText}</p>
		{/if}
	</div>
</form>

<div class="mt-6 flex flex-col gap-6 text-sm">
	<Button
		type="button"
		variant="default"
		class="w-full justify-center"
		onclick={(event) => dispatch('resend', event)}
		disabled={resendDisabled}
	>
		{resendLabel}
	</Button>
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground transition-colors text-sm"
		onclick={(event) => dispatch('restart', event)}
	>
		{restartLabel}
	</button>
</div>
