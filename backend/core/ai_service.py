"""AI service — provider-agnostic interface for LLM calls."""

import logging
from enum import Enum
from typing import Literal

from openai import AzureOpenAI

from core.config import settings

logger = logging.getLogger(__name__)

# Initialise the Azure OpenAI client once at module level (thread-safe).
_azure_client = AzureOpenAI(
    azure_endpoint=settings.azure_openai_endpoint or "",
    api_key=settings.azure_openai_api_key or "",
    api_version=settings.azure_api_version,
)


class AIProvider(str, Enum):
    AZURE_OPENAI = "azure_openai"


# A single message in a chat conversation
ChatMessage = dict[Literal["role", "content"], str]


def call_ai(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    provider: AIProvider = AIProvider.AZURE_OPENAI,
) -> str:
    """Single-turn AI call (backwards compatible)."""
    logger.info(f"AI call → provider={provider.value} | prompt_length={len(prompt)}")

    if provider == AIProvider.AZURE_OPENAI:
        return _call_azure_openai_chat(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=system_prompt,
        )

    raise ValueError(f"Unsupported AI provider: {provider}")


def chat_ai(
    messages: list[ChatMessage],
    system_prompt: str,
    provider: AIProvider = AIProvider.AZURE_OPENAI,
) -> str:
    """
    Multi-turn chat completion.

    Args:
        messages:      Full conversation history as [{role, content}, ...].
                       The last entry should be the latest user message.
        system_prompt: Instruction context for the model.
        provider:      Which LLM backend to use.

    Returns:
        The model's text response as a plain string.
    """
    logger.info(f"AI chat → provider={provider.value} | turns={len(messages)}")

    if provider == AIProvider.AZURE_OPENAI:
        return _call_azure_openai_chat(messages=messages, system_prompt=system_prompt)

    raise ValueError(f"Unsupported AI provider: {provider}")


# ---------------------------------------------------------------------------
# Private provider implementations
# ---------------------------------------------------------------------------


def _call_azure_openai_chat(
    messages: list[ChatMessage],
    system_prompt: str,
) -> str:
    try:
        full_messages = [{"role": "system", "content": system_prompt}] + list(messages)
        response = _azure_client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=full_messages,  # type: ignore[arg-type]
            temperature=0.4,
            max_tokens=1200,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        logger.error(f"Azure OpenAI call failed: {exc}")
        raise
