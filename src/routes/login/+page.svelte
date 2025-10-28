<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputOTP from '$lib/components/ui/input-otp/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { PageData } from './$types';
	import { REGEXP_ONLY_DIGITS } from 'bits-ui';
	import { syncSessionCookie } from '$lib/auth/session';

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
	let pendingVerification = $state(false);
	let lastSubmittedOtp = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

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
		pendingVerification = false;
		lastSubmittedOtp = null;
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
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<Card class="w-full max-w-md border border-border/60 px-6 py-6">
		<CardHeader class="space-y-2">
			<CardTitle class="text-2xl font-semibold">כניסה למערכת עם קוד חד־פעמי</CardTitle>
			<CardDescription>בחרו את ערוץ האימות המתאים לכם ונשלח קוד קצר שתוקפו מוגבל.</CardDescription>
		</CardHeader>

		<CardContent class="space-y-6">
			<Tabs.Root bind:value={mode} class="w-full">
				<Tabs.List class="grid w-full grid-cols-2 bg-muted p-1">
					<Tabs.Trigger value="email">אימייל</Tabs.Trigger>
					<Tabs.Trigger value="phone">טלפון</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="email" class="mt-4">
					{#if stage === 'identifier'}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<div class="space-y-2">
								<Label for="otp-email">כתובת אימייל</Label>
								<Input
									id="otp-email"
									type="email"
									placeholder="example@you.com"
									autocomplete="email"
									dir="ltr"
									class="text-start"
									bind:value={email}
									aria-invalid={status === 'error' ? 'true' : undefined}
									oninput={handleIdentifierInput}
								/>
							</div>

							<Button
								type="submit"
								class="w-full"
								disabled={!isIdentifierValid || identifierSubmitting}
							>
								{identifierSubmitting ? 'שולחים...' : 'שלחו קוד'}
							</Button>
						</form>
					{:else}
						{@const tabIsActive = mode === 'email'}
						{#if tabIsActive}
							<form class="space-y-5" onsubmit={handleOtpSubmit}>
								<div class="space-y-2">
									<Label for="otp-code-email">קוד אימות</Label>
									<InputOTP.Root
										id="otp-code-email"
										maxlength={OTP_LENGTH}
										pattern={REGEXP_ONLY_DIGITS}
										dir="ltr"
										bind:value={otp}
										oninput={handleOtpInput}
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
												{#each cells.slice(3, OTP_LENGTH) as cell}
													<InputOTP.Slot {cell} />
												{/each}
											</InputOTP.Group>
										{/snippet}
									</InputOTP.Root>
								</div>
							</form>

							<p class="text-center text-xs text-muted-foreground">
								{otpSubmitting ? 'מאמתים את הקוד...' : 'הקוד יישלח אוטומטית מיד כשכל הספרות יוזנו.'}
							</p>

							<div class="flex items-center justify-between text-sm">
								<Button type="button" variant="ghost" onclick={restart}>השתמשו באימייל אחר</Button>
								<Button type="button" variant="link" onclick={resendCode} disabled={resendPending}>
									{resendPending ? 'שולחים שוב...' : 'שלחו שוב את הקוד'}
								</Button>
							</div>
						{/if}
					{/if}
				</Tabs.Content>

				<Tabs.Content value="phone" class="mt-4">
					{#if stage === 'identifier'}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<div class="space-y-2">
								<Label for="otp-phone">מספר טלפון נייד</Label>
								<Input
									id="otp-phone"
									type="tel"
									placeholder="+972 50 000 0000"
									autocomplete="tel"
									inputmode="tel"
									dir="ltr"
									class="text-start"
									bind:value={phone}
									aria-invalid={status === 'error' ? 'true' : undefined}
									oninput={handleIdentifierInput}
								/>
							</div>

							<Button
								type="submit"
								class="w-full"
								disabled={!isIdentifierValid || identifierSubmitting}
							>
								{identifierSubmitting ? 'שולחים...' : 'שלחו קוד'}
							</Button>
						</form>
					{:else}
						{@const tabIsActive = mode === 'phone'}
						{#if tabIsActive}
							<form class="space-y-5" onsubmit={handleOtpSubmit}>
								<div class="space-y-2">
									<Label for="otp-code-phone">קוד אימות</Label>
									<InputOTP.Root
										id="otp-code-phone"
										maxlength={OTP_LENGTH}
										pattern={REGEXP_ONLY_DIGITS}
										dir="ltr"
										bind:value={otp}
										oninput={handleOtpInput}
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
												{#each cells.slice(3, OTP_LENGTH) as cell}
													<InputOTP.Slot {cell} />
												{/each}
											</InputOTP.Group>
										{/snippet}
									</InputOTP.Root>
								</div>
							</form>

							<p class="text-center text-xs text-muted-foreground">
								{otpSubmitting ? 'מאמתים את הקוד...' : 'הקוד יישלח אוטומטית מיד כשכל הספרות יוזנו.'}
							</p>

							<div class="flex items-center justify-between text-sm">
								<Button type="button" variant="ghost" onclick={restart}>השתמשו במספר אחר</Button>
								<Button type="button" variant="link" onclick={resendCode} disabled={resendPending}>
									{resendPending ? 'שולחים שוב...' : 'שלחו שוב את הקוד'}
								</Button>
							</div>
						{/if}
					{/if}
				</Tabs.Content>
			</Tabs.Root>

			{#if feedback}
				<p class={`text-sm ${feedbackToneClass}`}>{feedback.text}</p>
			{/if}
		</CardContent>
	</Card>
</div>
