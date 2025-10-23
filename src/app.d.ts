// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

	declare global {
		namespace App {
			// interface Error {}
			interface Locals {
				supabase: SupabaseClient;
				getSession: () => Promise<Session | null>;
			}
			interface PageData {
				session: Session | null;
				user: User | null;
			}
			// interface PageState {}
			// interface Platform {}
		}
	}

	export {};
}
