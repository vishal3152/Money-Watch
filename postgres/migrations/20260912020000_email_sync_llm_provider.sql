-- ADR-0013: email alert sync's LLM call becomes provider-agnostic (any OpenAI-compatible
-- chat-completions endpoint -- OpenRouter, OpenAI, a self-hosted Ollama, ...) instead of hardcoded
-- to OpenRouter. Replaces the single openrouter_api_key column with llm_base_url (required),
-- llm_api_key (nullable -- a self-hosted host like Ollama needs no auth), and llm_model (required,
-- no universal default once the host is configurable).
--
-- Backfilled from the existing OpenRouter configuration (not a code-level fallback -- a one-time
-- data migration) so an already-configured Owner's sync keeps working unchanged after this
-- migration, with nothing to re-enter unless they choose to point at a different provider.

alter table email_sync_settings add column llm_base_url text;
alter table email_sync_settings add column llm_api_key text;
alter table email_sync_settings add column llm_model text;

update email_sync_settings
set llm_base_url = 'https://openrouter.ai/api/v1',
    llm_api_key = openrouter_api_key,
    llm_model = 'openai/gpt-4o-mini';

alter table email_sync_settings alter column llm_base_url set not null;
alter table email_sync_settings alter column llm_model set not null;

alter table email_sync_settings drop column openrouter_api_key;
