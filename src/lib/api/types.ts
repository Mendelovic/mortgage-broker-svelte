export type SessionMessage = {
	id: number;
	role: 'assistant' | 'user' | string;
	content: Record<string, unknown>;
	created_at: string;
};

export type SessionSummary = {
	session_id: string;
	created_at: string;
	updated_at: string;
	message_count: number;
	latest_message: SessionMessage | null;
};

export type SessionDetail = {
	session_id: string;
	created_at: string;
	updated_at: string;
	messages: SessionMessage[];
	timeline: Record<string, unknown>;
	intake: Record<string, unknown>;
	planning?: Record<string, unknown> | null;
	optimization?: Record<string, unknown> | null;
	optimization_summary?: OptimizationSummary | null;
	optimization_candidates?: CandidateSummary[] | null;
	optimization_matrix?: ComparisonRow[] | null;
	engine_recommended_index?: number | null;
	advisor_recommended_index?: number | null;
	term_sweep?: OptimizationTermSweepEntry[] | null;
};

export type OptimizationSummary = {
	label: string;
	index: number;
	monthly_payment_nis: number;
	stress_payment_nis: number;
	highest_expected_payment_nis: number;
	expected_weighted_payment_nis: number;
	pti_ratio: number;
	pti_ratio_peak: number;
	highest_expected_payment_note?: string | null;
	peak_payment_month?: number | null;
	peak_payment_driver?: string | null;
	engine_label?: string | null;
	engine_index?: number | null;
};

export type CandidateSummary = {
	label: string;
	index: number;
	is_recommended: boolean;
	is_engine_recommended: boolean;
	shares: CandidateShares;
	metrics: CandidateMetrics;
	track_details: CandidateTrackDetail[];
	feasibility?: CandidateFeasibility | null;
	notes?: string[] | null;
};

export type CandidateShares = {
	fixed_unindexed_pct: number;
	fixed_cpi_pct: number;
	variable_prime_pct: number;
	variable_cpi_pct: number;
};

export type CandidateMetrics = {
	monthly_payment_nis: number;
	expected_weighted_payment_nis: number;
	highest_expected_payment_nis: number;
	stress_payment_nis: number;
	pti_ratio: number;
	pti_ratio_peak: number;
	five_year_total_payment_nis: number;
	total_weighted_cost_nis: number;
	variable_share_pct: number;
	cpi_share_pct: number;
	ltv_ratio: number;
	prepayment_fee_exposure: string;
	peak_payment_month?: number | null;
	peak_payment_driver?: string | null;
	sensitivities: CandidateSensitivity[];
	highest_expected_payment_note?: string | null;
};

export type CandidateSensitivity = {
	scenario: string;
	payment_nis: number;
};

export type CandidateTrackDetail = {
	track: string;
	amount_nis: number;
	rate_display: string;
	indexation: string;
	reset_note: string;
	anchor_rate_pct?: number | null;
};

export type CandidateFeasibility = {
	is_feasible?: boolean | null;
	ltv_ratio?: number | null;
	ltv_limit?: number | null;
	pti_ratio?: number | null;
	pti_ratio_peak?: number | null;
	pti_limit?: number | null;
	issues?: string[] | null;
};

export type ComparisonRow = {
	label: string;
	index: number;
	monthly_payment_nis: number;
	highest_expected_payment_nis: number;
	delta_peak_payment_nis: number;
	pti_ratio: number;
	pti_ratio_peak: number;
	variable_share_pct: number;
	cpi_share_pct: number;
	five_year_total_payment_nis: number;
	prepayment_fee_exposure: string;
	peak_payment_month?: number | null;
	peak_payment_driver?: string | null;
};

export type OptimizationTermSweepEntry = {
	term_years: number;
	monthly_payment_nis: number;
	monthly_payment_display: string;
	stress_payment_nis: number;
	stress_payment_display: string;
	expected_weighted_payment_nis: number;
	expected_weighted_payment_display: string;
	pti_ratio: number;
	pti_ratio_display: string;
	pti_ratio_peak: number;
	pti_ratio_peak_display: string;
};

export type ChatResponse = {
	response: string;
	thread_id: string;
	files_processed?: number | null;
	timeline?: Record<string, unknown> | null;
	intake?: Record<string, unknown> | null;
	planning?: Record<string, unknown> | null;
	optimization?: Record<string, unknown> | null;
	optimization_summary?: OptimizationSummary | null;
	optimization_candidates?: CandidateSummary[] | null;
	optimization_matrix?: ComparisonRow[] | null;
	engine_recommended_index?: number | null;
	advisor_recommended_index?: number | null;
	term_sweep?: OptimizationTermSweepEntry[] | null;
};
