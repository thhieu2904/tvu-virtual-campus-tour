import asyncio
import os
import sys

from app.config import get_settings
from app.ai import embedding_engine, chat_engine, tts_engine
from app.ai.prompts import build_system_prompt

async def main():
    print("=" * 60)
    print("🧪 AI MODULE TEST")
    print("=" * 60)
    
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        print("❌ Error: GEMINI_API_KEY is missing from environment.")
        sys.exit(1)

    # Test 1: System Prompt
    print("\n📝 TEST 1: System Prompt")
    try:
        prompt = build_system_prompt(location_name="Khoa CNTT", voice_style="Vui vẻ")
        print(f"  ✅ ({len(prompt)} chars): {prompt[:100]}...")
    except Exception as e:
        print(f"  ❌ {e}")

    # Test 2: Embedding
    print("\n🔢 TEST 2: Embedding Query")
    try:
        vec = await embedding_engine.embed_query("Xin chào")
        print(f"  ✅ Vector dim: {len(vec)}")
    except Exception as e:
        print(f"  ❌ {e}")

    # Test 3: Chat without Thinking
    print("\n💬 TEST 3: Chat (no thinking)")
    try:
        result = await chat_engine.generate_response("1+1 bằng mấy?", enable_thinking=False)
        print(f"  ✅ Text: {result.text}")
        print(f"  📊 Usage: {result.usage}")
    except Exception as e:
        print(f"  ❌ {e}")

    # Test 4: Chat with Thinking
    print("\n🧠 TEST 4: Chat (with thinking)")
    try:
        result = await chat_engine.generate_response("Giải thích vì sao bầu trời màu xanh trong 1 câu", enable_thinking=True, thinking_budget=256)
        print(f"  🧠 Thinking: {result.thinking[:100] if result.thinking else 'None'}...")
        print(f"  ✅ Text: {result.text[:100]}...")
    except Exception as e:
        print(f"  ❌ {e}")

    # Test 5: TTS
    print("\n🔊 TEST 5: TTS")
    try:
        result = await tts_engine.synthesize("Xin chào, chúc bạn một ngày tốt lành!")
        print(f"  ✅ Audio: {len(result.audio_data)} bytes")
        print(f"  ✅ Provider: {result.provider}, Cached: {result.cached}")
        
        # Test Cache
        result2 = await tts_engine.synthesize("Xin chào, chúc bạn một ngày tốt lành!")
        print(f"  ✅ Cache Hit Test: Provider: {result2.provider}, Cached: {result2.cached}")
    except Exception as e:
        print(f"  ❌ {e}")

    print("\n" + "=" * 60)
    print("✅ All tests finished.")

if __name__ == "__main__":
    asyncio.run(main())
