"""AI service — provider-agnostic interface for LLM calls."""

import logging
from enum import Enum

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


def call_ai(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    provider: AIProvider = AIProvider.AZURE_OPENAI,
) -> str:
    """
    Route a prompt to the requested AI provider and return the text response.

    Args:
        prompt:        The user-facing prompt / question.
        system_prompt: Instruction context for the model.
        provider:      Which LLM backend to use (default: Azure OpenAI).

    Returns:
        The model's text response as a plain string.

    """
    logger.info(f"AI call → provider={provider.value} | prompt_length={len(prompt)}")

    if provider == AIProvider.AZURE_OPENAI:
        return _call_azure_openai(prompt, system_prompt)

    raise ValueError(f"Unsupported AI provider: {provider}")


# ---------------------------------------------------------------------------
# Private provider implementations
# ---------------------------------------------------------------------------


def _call_azure_openai(prompt: str, system_prompt: str) -> str:
    try:
        response = _azure_client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content
    except Exception as exc:
        logger.error(f"Azure OpenAI call failed: {exc}")
        raise
