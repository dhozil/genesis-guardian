/** Shapes mirror the JSON returned by GenesisGuardian views. */

export type ThreatLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type IncidentStatus =
  | "SUBMITTED"
  | "UNDER_INVESTIGATION"
  | "CONFIRMED"
  | "REJECTED"
  | "INCONCLUSIVE"
  | "RESOLVED";
export type ProtocolPhase =
  | "NORMAL"
  | "EMERGENCY_PENDING"
  | "EMERGENCY_ACTIVE"
  | "RECOVERY_PENDING"
  | "RECOVERED";

export interface Assessment {
  incident_id: string;
  seq: number;
  generated_at: string;
  threat_category: string;
  threat_level: ThreatLevel;
  recommended_action: string;
  confidence_level: Confidence;
  reasoning_summary: string;
  evidence_conflict: boolean;
  unresolved_questions?: string;
  /** Present when returned from the epilogue of assess(). */
  verification?: Array<{ id: string; verified: boolean; status: string }>;
}

export interface EvidenceItem {
  evidence_id: string;
  source_type: string;
  category: string;
  reference: string;
  corroborated: boolean;
  collection_status: "PENDING" | "VERIFIED" | "FAILED" | "UNAVAILABLE";
  summary?: string;
  verification_note?: string;
}

export interface Incident {
  incident_id: string;
  contract_address: string;
  network: string;
  tx_hashes: string[];
  suspicious_wallets: string[];
  description: string;
  evidence_ids: string[];
  reporter?: string;
  submitted_at?: string;
  status: IncidentStatus;
}

export interface HistoryEntry {
  type: string;
  at?: string;
  actor?: string;
  [key: string]: unknown;
}

export interface ProtocolState {
  state: ProtocolPhase;
  active_incident: string;
  paused: boolean;
  protocol_locked: boolean;
  last_emergency_unix: number;
  history_len: number;
  history_tail: string[];
  governance?: string;
  policy_version?: number;
}

export interface Policy {
  policy_version?: number;
  allowed_threat_levels: ThreatLevel[];
  allowed_actions: string[];
  min_confidence: Confidence;
  min_corroborating_sources: number;
  cooldown_seconds: number;
  emergency_requires_confirm: boolean;
  report_requires_confirm?: boolean;
}

export interface ProtocolHint {
  total: number;
  by_status: Record<string, number>;
  governance: string;
}

/** Consensus verdict extracted from a GenLayer receipt. */
export interface ConsensusSummary {
  /** MAJORITY_AGREE | MAJORITY_DISAGREE | TIMEOUT | ... */
  resultName?: string;
  executionResult?: string;
  leaderVote?: string;
  agree: number;
  disagree: number;
  idle: number;
  rounds?: string;
  /** True only when validators committed the leader result. */
  committed: boolean;
}

export type TxPhase = "idle" | "submitting" | "pending" | "success" | "error";

export interface TxOutcome {
  phase: TxPhase;
  hash?: string;
  statusName?: string;
  consensus?: ConsensusSummary;
  message?: string;
  /** Contract return value decoded, when the call is a view-like write. */
  payload?: string;
}
