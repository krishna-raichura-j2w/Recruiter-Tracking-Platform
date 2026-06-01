"""AI service — provider-agnostic interface for LLM calls."""

import logging
from typing import Literal

from core.config import settings

logger = logging.getLogger(__name__)

ChatMessage = dict[Literal["role", "content"], str]

# Lazy-initialised clients
_azure_client = None
_claude_client = None


def _get_azure_client():
    global _azure_client
    if _azure_client is None:
        from openai import AzureOpenAI
        _azure_client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint or "",
            api_key=settings.azure_openai_api_key or "",
            api_version=settings.azure_api_version,
        )
    return _azure_client


def _get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic(api_key=settings.claude_api_key or "")
    return _claude_client


def _active_provider() -> str:
    return (settings.model_to_use or "AZURE").upper()


def call_ai(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    max_tokens: int = 1200,
) -> str:
    """Single-turn AI call — uses provider from MODEL_TO_USE env var."""
    provider = _active_provider()
    logger.info(f"AI call → provider={provider} | prompt_length={len(prompt)}")

    if provider == "CLAUDE":
        return _call_claude(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=system_prompt,
            max_tokens=max_tokens,
        )
    return _call_azure(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=system_prompt,
        max_tokens=max_tokens,
    )


def chat_ai(
    messages: list[ChatMessage],
    system_prompt: str,
    max_tokens: int = 1200,
) -> str:
    """Multi-turn chat completion — uses provider from MODEL_TO_USE env var."""
    provider = _active_provider()
    logger.info(f"AI chat → provider={provider} | turns={len(messages)}")

    if provider == "CLAUDE":
        return _call_claude(messages=messages, system_prompt=system_prompt, max_tokens=max_tokens)
    return _call_azure(messages=messages, system_prompt=system_prompt, max_tokens=max_tokens)


def _call_claude(
    messages: list[ChatMessage],
    system_prompt: str,
    max_tokens: int = 1200,
) -> str:
    try:
        client = _get_claude_client()
        response = client.messages.create(
            model=settings.claude_model_name,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,  # type: ignore[arg-type]
        )
        return response.content[0].text
    except Exception as exc:
        logger.error(f"Claude call failed: {exc}")
        raise


def _call_azure(
    messages: list[ChatMessage],
    system_prompt: str,
    max_tokens: int = 1200,
) -> str:
    try:
        client = _get_azure_client()
        full_messages = [{"role": "system", "content": system_prompt}] + list(messages)
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=full_messages,  # type: ignore[arg-type]
            temperature=0.4,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        logger.error(f"Azure OpenAI call failed: {exc}")
        raise
