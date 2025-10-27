#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv

load_dotenv()

try:
    import google.generativeai as genai
except Exception as e:
    print("google-generativeai is not installed. Add it to requirements and install.")
    sys.exit(1)


def _mask(key: str) -> str:
    if not key:
        return "<missing>"
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def main():
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    if not api_key:
        print("GEMINI_API_KEY is not set in environment or .env")
        sys.exit(1)

    print(f"Using model: {model_name}")
    print(f"API key: {_mask(api_key)}")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    system_rules = (
        "You are a helpful assistant. Answer succinctly and clearly. "
        "If the question asks for a number, provide the number and units in a readable format."
    )
    question = (
        "how much is ur context tokens i how many tokens can be sent in 1 message give me the number in readable format"
    )

    prompt = (
        f"SYSTEM\n{system_rules}\n\n"
        f"QUESTION\n{question}\n\n"
        f"ANSWER"
    )

    try:
        resp = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.1,
                "max_output_tokens": 256,
            },
        )
    except Exception as e:
        print("Gemini API call failed:\n", e)
        sys.exit(2)

    text = getattr(resp, "text", None)
    if not text:
        print("No text returned from Gemini.")
        sys.exit(3)

    print("\nGemini response:\n")
    print(text)


if __name__ == "__main__":
    main()
