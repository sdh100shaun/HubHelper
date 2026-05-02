/**
 * Shared configuration for CopilotClient instances.
 *
 * Centralised here so that all Copilot-backed services stay consistent and
 * changes to idle-session behaviour only need to be made in one place.
 */

// Auto-clean idle CLI sessions to avoid leaking server-side state on crashes.
export const SESSION_IDLE_TIMEOUT_SECONDS = 300;
