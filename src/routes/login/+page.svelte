<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import type { PageData } from './$types';
	import { syncSessionCookie } from '$lib/auth/session';
	import IdentifierField from '$lib/components/auth/identifier-field.svelte';
	import OtpForm from '$lib/components/auth/otp-form.svelte';

	let { data }: { data: PageData } = $props();
	const supabase = $derived(data.supabase);

	const OTP_LENGTH = 6;

	type Stage = 'identifier' | 'otp';
	type Status = 'idle' | 'error' | 'sent' | 'verified';
	type FeedbackTone = 'muted' | 'error' | 'success';

	let stage = $state<Stage>('identifier');
	let status = $state<Status>('idle');
	let email = $state('');
	let otp = $state('');
	let target = $state('');
	let identifierSubmitting = $state(false);
	let otpSubmitting = $state(false);
	let resendPending = $state(false);
	let resendCooldown = $state(0);
	let pendingVerification = $state(false);
	let lastSubmittedOtp = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	let resendTimer: ReturnType<typeof setInterval> | null = null;

	const emailValue = $derived(email.trim());
	const isIdentifierValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue));
	const isOtpComplete = $derived(otp.length === OTP_LENGTH);
	const feedback = $derived(computeFeedback());
	const feedbackToneClass = $derived(
		!feedback
			? 'text-muted-foreground'
			: feedback.tone === 'error'
				? 'text-destructive'
				: feedback.tone === 'success'
					? 'text-emerald-600'
					: 'text-muted-foreground'
	);

	function computeFeedback(): { tone: FeedbackTone; text: string } | null {
		if (stage === 'identifier' && status === 'error') {
			return {
				tone: 'error',
				text: errorMessage ?? 'הזינו כתובת אימייל תקינה כדי לקבל את קוד האימות.'
			};
		}

		if (stage === 'otp') {
			if (status === 'verified') {
				return {
					tone: 'success',
					text: 'הקוד אומת בהצלחה. מעבירים אתכם הלאה...'
				};
			}

			if (status === 'error') {
				return {
					tone: 'error',
					text:
						errorMessage ?? `הזינו קוד באורך ${OTP_LENGTH} תווים שקיבלתם כדי לאמת את הזהות שלכם.`
				};
			}

			return {
				tone: 'muted',
				text: `שלחנו קוד בן ${OTP_LENGTH} ספרות אל ${target}`
			};
		}

		return null;
	}

	function clearResendTimer() {
		if (resendTimer) {
			clearInterval(resendTimer);
			resendTimer = null;
		}
	}

	function startResendCooldown(seconds = 60) {
		clearResendTimer();
		resendCooldown = seconds;
		resendTimer = setInterval(() => {
			if (resendCooldown <= 1) {
				resendCooldown = 0;
				clearResendTimer();
			} else {
				resendCooldown = resendCooldown - 1;
			}
		}, 1_000);
	}

	async function handleIdentifierSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!isIdentifierValid) {
			status = 'error';
			errorMessage = 'הזינו כתובת אימייל תקינה כדי לקבל את קוד האימות.';
			return;
		}

		const destination = emailValue;
		identifierSubmitting = true;
		errorMessage = null;

		try {
			const { error } = await supabase.auth.signInWithOtp({ email: destination });

			if (error) {
				status = 'error';
				errorMessage = error.message;
				return;
			}

			target = destination;
			stage = 'otp';
			status = 'sent';
			otp = '';
			startResendCooldown();
		} finally {
			identifierSubmitting = false;
		}
	}

	async function handleOtpSubmit(event?: SubmitEvent) {
		event?.preventDefault();

		if (!isOtpComplete) {
			status = 'error';
			errorMessage = `הזינו קוד באורך ${OTP_LENGTH} תווים שקיבלתם כדי לאמת את הזהות שלכם.`;
			return;
		}

		if (pendingVerification) {
			return;
		}

		otpSubmitting = true;
		pendingVerification = true;
		lastSubmittedOtp = otp;
		errorMessage = null;

		try {
			const { data, error } = await supabase.auth.verifyOtp({
				type: 'email',
				email: target,
				token: otp
			});

			if (error || !data.session) {
				status = 'error';
				errorMessage = error?.message ?? 'אירעה שגיאה בעת אימות הקוד.';
				return;
			}

			const session = data.session;

			if (session) {
				await syncSessionCookie(session);
			}

			status = 'verified';
			await invalidate('supabase:auth');
			await goto('/');
			return;
		} finally {
			otpSubmitting = false;
			pendingVerification = false;
		}
	}

	function handleIdentifierInput() {
		if (stage === 'identifier' && status === 'error') {
			status = 'idle';
			errorMessage = null;
		}
	}

	function handleOtpInput() {
		if (stage === 'otp' && status === 'error') {
			status = 'idle';
			errorMessage = null;
		}
	}

	function restart() {
		stage = 'identifier';
		status = 'idle';
		identifierSubmitting = false;
		otpSubmitting = false;
		otp = '';
		target = '';
		errorMessage = null;
		resendPending = false;
		resendCooldown = 0;
		pendingVerification = false;
		lastSubmittedOtp = null;
		clearResendTimer();
	}

	async function resendCode() {
		if (!target) {
			return;
		}

		resendPending = true;
		errorMessage = null;

		try {
			const { error } = await supabase.auth.signInWithOtp({ email: target });

			if (error) {
				status = 'error';
				errorMessage = error.message;
				return;
			}

			status = 'sent';
			otp = '';
			lastSubmittedOtp = null;
			startResendCooldown();
		} finally {
			resendPending = false;
		}
	}

	$effect(() => {
		if (stage === 'otp' && isOtpComplete && !pendingVerification && otp !== lastSubmittedOtp) {
			handleOtpSubmit().catch((error) => console.error('OTP auto-submit failed', error));
		}
	});

	onDestroy(() => {
		clearResendTimer();
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<Card class="w-full max-w-md border border-border/60 px-6 py-6">
		{#if stage === 'identifier'}
			<CardHeader class="space-y-2">
				<CardTitle class="text-2xl font-semibold">כניסה למערכת</CardTitle>
				<CardDescription>נשלח קוד חד־פעמי לאימייל שתזינו.</CardDescription>
			</CardHeader>
		{/if}

		<CardContent class="space-y-6">
			{#if stage === 'identifier'}
				<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
					<IdentifierField
						id="otp-email"
						label="אימייל"
						placeholder="example@you.com"
						type="email"
						autocomplete="email"
						inputmode="email"
						dir="ltr"
						bind:value={email}
						invalid={status === 'error'}
						on:input={() => handleIdentifierInput()}
					/>

					<Button
						type="submit"
						class="w-full"
						disabled={!isIdentifierValid || identifierSubmitting}
					>
						{identifierSubmitting ? 'שולחים...' : 'שלחו קוד'}
					</Button>
				</form>
			{:else}
				<OtpForm
					id="otp-code-email"
					label="קוד אימות"
					length={OTP_LENGTH}
					bind:value={otp}
					submitting={otpSubmitting}
					resendCooldownSeconds={resendCooldown}
					{resendPending}
					restartLabel="השתמשו באימייל אחר"
					resendIdleLabel="שלחו שוב את הקוד"
					resendPendingLabel="שולחים שוב..."
					helperText={feedback?.text ?? null}
					helperTextClass={feedbackToneClass}
					on:submit={(event) => handleOtpSubmit(event.detail)}
					on:input={() => handleOtpInput()}
					on:restart={() => restart()}
					on:resend={() => resendCode()}
				/>
			{/if}

			{#if stage === 'identifier' && feedback}
				<p class={`text-sm ${feedbackToneClass}`}>{feedback.text}</p>
			{/if}
		</CardContent>
	</Card>
</div>
