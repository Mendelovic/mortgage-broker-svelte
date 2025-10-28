<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { createEventDispatcher } from 'svelte';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type IdentifierInputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	export interface Props {
		id: string;
		label: string;
		placeholder: string;
		type?: IdentifierInputType;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		inputmode?: HTMLInputAttributes['inputmode'];
		dir?: 'ltr' | 'rtl';
		invalid?: boolean;
		class?: string;
		value?: string;
	}

	let {
		id,
		label,
		placeholder,
		type = 'text',
		autocomplete,
		inputmode,
		dir = 'rtl',
		invalid = false,
		class: className = 'text-start',
		value = $bindable('')
	}: Props = $props();

	const dispatch = createEventDispatcher<{ input: Event }>();

	function handleInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		value = target.value;
		dispatch('input', event);
	}
</script>

<div class="space-y-2">
	<Label for={id}>{label}</Label>
	<Input
		{id}
		{type}
		{placeholder}
		{autocomplete}
		{inputmode}
		{dir}
		class={className}
		bind:value
		aria-invalid={invalid ? 'true' : undefined}
		oninput={handleInput}
	/>
</div>
