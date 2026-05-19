from core.ai_service import call_ai


def get_sample() -> dict:
    return {}


def get_sample_ai_response(prompt: str) -> dict:
    response = call_ai(prompt=prompt)
    return {"response": response}
