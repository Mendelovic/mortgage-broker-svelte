<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import * as InputOTP from "$lib/components/ui/input-otp/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import { REGEXP_ONLY_DIGITS_AND_CHARS } from "bits-ui";

	const OTP_LENGTH = 6;

	type Mode = "email" | "phone";
	type Stage = "identifier" | "otp";
	type Status = "idle" | "error" | "sent" | "verified";
	type FeedbackTone = "muted" | "error" | "success";

	let mode = $state<Mode>("email");
	let stage = $state<Stage>("identifier");
	let status = $state<Status>("idle");
	let email = $state("");
	let phone = $state("");
	let otp = $state("");
	let target = $state("");
	let targetMode = $state<Mode>("email");

	const emailValue = $derived(email.trim());
	const phoneDigits = $derived(phone.replace(/\D/g, ""));
	const phoneStartsWithPlus = $derived(phone.trim().startsWith("+"));
	const normalizedPhone = $derived<string>(phoneStartsWithPlus ? `+${phoneDigits}` : phoneDigits);
	const identifierValue = $derived<string>(mode === "email" ? emailValue : normalizedPhone);
	const isIdentifierValid = $derived(() =>
		mode === "email"
			? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
			: phoneDigits.length >= 8,
	);
	const isOtpComplete = $derived(() => otp.length === OTP_LENGTH);
	const feedback = $derived(computeFeedback());
	const feedbackToneClass = $derived(() => {
		if (!feedback) {
			return "text-muted-foreground";
		}

		if (feedback.tone === "error") {
			return "text-destructive";
		}

		if (feedback.tone === "success") {
			return "text-emerald-600";
		}

		return "text-muted-foreground";
	});

	function formatIdentifier(value: string, valueMode: Mode): string {
		if (!value) {
			return "";
		}

		if (valueMode === "email") {
			const [user, domain] = value.split("@");
			if (!user || !domain) {
				return value;
			}

			const visible = user.slice(0, 2);
			return `${visible}${user.length > 2 ? "***" : ""}@${domain}`;
		}

		const digits = value.replace(/\D/g, "");
		if (digits.length <= 4) {
			return value;
		}

		const masked = "*".repeat(Math.max(0, digits.length - 4));
		const suffix = digits.slice(-4);
		return value.startsWith("+") ? `+${masked}${suffix}` : `${masked}${suffix}`;
	}

	function computeFeedback(): { tone: FeedbackTone; text: string } | null {
		if (stage === "identifier") {
			if (status === "error") {
				return {
					tone: "error",
					text:
						mode === "email"
							? "Enter a valid email to receive your verification code."
							: "Enter a valid phone number (include your country code).",
				};
			}

			return {
				tone: "muted",
				text:
					mode === "email"
						? "We will email a one-time code to the address you provide."
						: "We will text a one-time code to the number you provide.",
			};
		}

		if (stage === "otp") {
			if (status === "verified") {
				return {
					tone: "success",
					text: "Code verified. You are good to go!",
				};
			}

			if (status === "error") {
				return {
					tone: "error",
					text: `Enter the ${OTP_LENGTH}-character code we sent to confirm your identity.`,
				};
			}

			return {
				tone: "muted",
				text: target
					? `We sent a ${OTP_LENGTH}-digit code to ${formatIdentifier(target, targetMode)}.`
					: `We sent a ${OTP_LENGTH}-digit code.`,
			};
		}

		return null;
	}

	function handleIdentifierSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!isIdentifierValid) {
			status = "error";
			return;
		}

		target = identifierValue;
		targetMode = mode;
		stage = "otp";
		status = "sent";
		otp = "";
	}

	function handleOtpSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!isOtpComplete) {
			status = "error";
			return;
		}

		status = "verified";
	}

	function handleIdentifierInput() {
		if (stage === "identifier" && status === "error") {
			status = "idle";
		}
	}

	function handleOtpInput() {
		if (stage === "otp" && status === "error") {
			status = "idle";
		}
	}

	function restart() {
		stage = "identifier";
		status = "idle";
		otp = "";
		target = "";
		targetMode = mode;
	}

	function resendCode() {
		status = "sent";
		otp = "";
	}

	$effect(() => {
		mode;
		restart();
	});
</script>

<div class="bg-background flex min-h-screen items-center justify-center px-4 py-12">
	<Card class="w-full max-w-md border border-border/60 px-6">
		<CardHeader class="space-y-2">
			<CardTitle class="text-2xl font-semibold">Sign in with a one-time code</CardTitle>
			<CardDescription>
				Choose how you want to receive your login code. We&apos;ll send a single-use code that expires
				quickly.
			</CardDescription>
		</CardHeader>

		<CardContent class="space-y-6">
			<Tabs.Root bind:value={mode} class="w-full">
				<Tabs.List class="grid w-full grid-cols-2 bg-muted p-1">
					<Tabs.Trigger value="email">Email</Tabs.Trigger>
					<Tabs.Trigger value="phone">Phone</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="email" class="mt-4">
					{#if stage === "identifier"}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<div class="space-y-2">
								<Label for="otp-email">Email address</Label>
								<Input
									id="otp-email"
									type="email"
									placeholder="you@example.com"
									autocomplete="email"
									bind:value={email}
									aria-invalid={status === "error" ? "true" : undefined}
									oninput={handleIdentifierInput}
								/>
							</div>

							<Button type="submit" class="w-full" disabled={!isIdentifierValid}>
								Send code
							</Button>
						</form>
					{:else}
						{@const tabIsActive = mode === "email"}
						{#if tabIsActive}
							<form class="space-y-5" onsubmit={handleOtpSubmit}>
								<div class="space-y-2">
									<Label for="otp-code-email">Verification code</Label>
									<InputOTP.Root
										id="otp-code-email"
										maxlength={OTP_LENGTH}
										pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
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

								<Button type="submit" class="w-full" disabled={!isOtpComplete}>
									Verify code
								</Button>
							</form>

							<div class="flex items-center justify-between text-sm">
								<Button type="button" variant="ghost" onclick={restart}>
									Use a different email
								</Button>
								<Button type="button" variant="link" onclick={resendCode}>
									Resend code
								</Button>
							</div>
						{/if}
					{/if}
				</Tabs.Content>

				<Tabs.Content value="phone" class="mt-4">
					{#if stage === "identifier"}
						<form class="space-y-5" onsubmit={handleIdentifierSubmit}>
							<div class="space-y-2">
								<Label for="otp-phone">Mobile number</Label>
								<Input
									id="otp-phone"
									type="tel"
									placeholder="+1 555 000 0000"
									autocomplete="tel"
									inputmode="tel"
									bind:value={phone}
									aria-invalid={status === "error" ? "true" : undefined}
									oninput={handleIdentifierInput}
								/>
							</div>

							<Button type="submit" class="w-full" disabled={!isIdentifierValid}>
								Send code
							</Button>
						</form>
					{:else}
						{@const tabIsActive = mode === "phone"}
						{#if tabIsActive}
							<form class="space-y-5" onsubmit={handleOtpSubmit}>
								<div class="space-y-2">
									<Label for="otp-code-phone">Verification code</Label>
									<InputOTP.Root
										id="otp-code-phone"
										maxlength={OTP_LENGTH}
										pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
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

								<Button type="submit" class="w-full" disabled={!isOtpComplete}>
									Verify code
								</Button>
							</form>

							<div class="flex items-center justify-between text-sm">
								<Button type="button" variant="ghost" onclick={restart}>
									Use a different number
								</Button>
								<Button type="button" variant="link" onclick={resendCode}>
									Resend code
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

		<CardFooter class="justify-center">
			<p class="text-xs text-muted-foreground">
				Need help? <a class="text-primary hover:underline" href="mailto:support@example.com">Contact our support team.</a>
			</p>
		</CardFooter>
	</Card>
</div>
