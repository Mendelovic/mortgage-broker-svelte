<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { PageData } from './$types';
	import { syncSessionCookie } from '$lib/auth/session';
	import IdentifierField from '$lib/components/auth/identifier-field.svelte';
	import OtpForm from '$lib/components/auth/otp-form.svelte';

	let { data }: { data: PageData } = $props();
	const supabase = $derived(data.supabase);

	const OTP_LENGTH = 6;

	type Mode = 'email' | 'phone';
	type Stage = 'identifier' | 'otp';
	type Status = 'idle' | 'error' | 'sent' | 'verified';
	type FeedbackTone = 'muted' | 'error' | 'success';

	let mode = $state<Mode>('email');
	let stage = $state<Stage>('identifier');
	let status = $state<Status>('idle');
	let email = $state('');
	let phone = $state('');
	let otp = $state('');
	let target = $state('');
	let targetMode = $state<Mode>('email');
	let identifierSubmitting = $state(false);
	let otpSubmitting = $state(false);
	let resendPending = $state(false);
	let resendCooldown = $state(0);
	let pendingVerification = $state(false);
	let lastSubmittedOtp = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	let resendTimer: ReturnType<typeof setInterval> | null = null;

	const emailValue = $derived(email.trim());
	const phoneDigits = $derived(phone.replace(/\D/g, ''));
	const phoneStartsWithPlus = $derived(phone.trim().startsWith('+'));
	const normalizedPhone = $derived<string>(phoneStartsWithPlus ? `+${phoneDigits}` : phoneDigits);
	const identifierValue = $derived<string>(mode === 'email' ? emailValue : normalizedPhone);
	const isIdentifierValid = $derived(
		mode === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) : phoneDigits.length >= 8
	);
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

	function formatIdentifier(value: string, valueMode: Mode): string {
		if (!value) {
			return '';
		}

		if (valueMode === 'email') {
			const [user, domain] = value.split('@');
			if (!user || !domain) {
				return value;
			}

			const visible = user.slice(0, 2);
			return `${visible}${user.length > 2 ? '***' : ''}@${domain}`;
		}

		const digits = value.replace(/\D/g, '');
		if (digits.length <= 4) {
			return value;
		}

		const masked = '*'.repeat(Math.max(0, digits.length - 4));
		const suffix = digits.slice(-4);
		return value.startsWith('+') ? `+${masked}${suffix}` : `${masked}${suffix}`;
	}

	function computeFeedback(): { tone: FeedbackTone; text: string } | null {
		if (stage === 'identifier') {
			if (status === 'error') {
				return {
					tone: 'error',
					text:
						errorMessage ??
						(mode === 'email'
							? 'הזינו כתובת אימייל תקינה כדי לקבל את קוד האימות.'
							: 'הזינו מספר טלפון תקין כולל קידומת מדינה.')
				};
			}

			return {
				tone: 'muted',
				text:
					mode === 'email'
						? 'נשלח קוד חד־פעמי לכתובת האימייל שתזינו.'
						: 'נשלח קוד חד־פעמי בהודעת SMS למספר שתזינו.'
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
				text: target
					? `שלחנו קוד בן ${OTP_LENGTH} ספרות אל ${formatIdentifier(target, targetMode)}.`
					: `שלחנו קוד בן ${OTP_LENGTH} ספרות.`
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
			errorMessage =
				mode === 'email'
					? 'הזינו כתובת אימייל תקינה כדי לקבל את קוד האימות.'
					: 'הזינו מספר טלפון תקין כולל קידומת מדינה.';
			return;
		}

		const destination = identifierValue;
		identifierSubmitting = true;
		errorMessage = null;

		try {
			const { error } =
				mode === 'email'
					? await supabase.auth.signInWithOtp({ email: destination })
					: await supabase.auth.signInWithOtp({ phone: destination });

			if (error) {
				status = 'error';
				errorMessage = error.message;
				return;
			}

			target = destination;
			targetMode = mode;
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
			const verifyPayload =
				targetMode === 'email'
					? {
							type: 'email' as const,
							email: target,
							token: otp
						}
					: {
							type: 'sms' as const,
							phone: target,
							token: otp
						};

			const { data, error } = await supabase.auth.verifyOtp(verifyPayload);

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
			await Promise.all([invalidate('supabase:auth'), invalidateAll()]);
			await goto('/', { invalidateAll: true });
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
		targetMode = mode;
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
			const { error } =
				targetMode === 'email'
					? await supabase.auth.signInWithOtp({ email: target })
					: await supabase.auth.signInWithOtp({ phone: target });

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

	$effect(() => {
		mode;
		restart();
	});

	onDestroy(() => {
		clearResendTimer();
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<Card class="w-full max-w-md border border-border/60 px-6 py-6">
		{#if stage === 'identifier'}
			<CardHeader class="space-y-2">
				<CardTitle class="text-2xl font-semibold">כניסה למערכת עם קוד חד־פעמי</CardTitle>
				<CardDescription>בחרו את ערוץ האימות המתאים לכם ונשלח קוד קצר שתוקפו מוגבל.</CardDescription
				>
			</CardHeader>
		{/if}

		<CardContent class="space-y-6">
			<Tabs.Root bind:value={mode} class="w-full">
				{#if stage === 'identifier'}
					<Tabs.List class="grid w-full grid-cols-2 bg-muted p-1">
						<Tabs.Trigger value="email">אימייל</Tabs.Trigger>
						<Tabs.Trigger value="phone">טלפון</Tabs.Trigger>
					</Tabs.List>
				{/if}

				<Tabs.Content value="email" class="mt-4">
					{#if stage === 'identifier'}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<IdentifierField
								id="otp-email"
								label="כתובת אימייל"
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
					{:else if mode === 'email'}
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
				</Tabs.Content>

				<Tabs.Content value="phone" class="mt-4">
					{#if stage === 'identifier'}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<IdentifierField
								id="otp-phone"
								label="מספר טלפון נייד"
								placeholder="+972 50 000 0000"
								type="tel"
								autocomplete="tel"
								inputmode="tel"
								dir="ltr"
								bind:value={phone}
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
					{:else if mode === 'phone'}
						<OtpForm
							id="otp-code-phone"
							label="קוד אימות"
							length={OTP_LENGTH}
							bind:value={otp}
							submitting={otpSubmitting}
							resendCooldownSeconds={resendCooldown}
							{resendPending}
							restartLabel="השתמשו במספר אחר"
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
				</Tabs.Content>
			</Tabs.Root>

			{#if stage === 'identifier' && feedback}
				<p class={`text-sm ${feedbackToneClass}`}>{feedback.text}</p>
			{/if}
		</CardContent>
	</Card>
</div>
