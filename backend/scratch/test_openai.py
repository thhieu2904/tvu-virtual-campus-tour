"""
Test OpenAI API — Kiểm tra khả năng Chat, Embedding, TTS
Mục đích: So sánh với Gemini để quyết định provider cho dự án TVU Campus Tour
"""
import os
import sys
import time

# --- Config ---
API_KEY = os.getenv("OPENAI_API_KEY", "")

try:
    from openai import OpenAI
except ImportError:
    print("⚠️  Cần cài openai: pip install openai")
    sys.exit(1)

client = OpenAI(api_key=API_KEY)

print("=" * 60)
print("🧪 OPENAI API TEST — TVU Campus Tour")
print("=" * 60)

# ============================================================
# TEST 1: List models (kiểm tra key hoạt động)
# ============================================================
print("\n📋 TEST 1: Kiểm tra API Key (list models)")
try:
    models = client.models.list()
    available = [m.id for m in models if any(k in m.id for k in ["gpt-4", "tts", "embedding"])]
    print(f"  ✅ Key hoạt động! Có {len(available)} model liên quan:")
    for m in sorted(available)[:15]:
        print(f"     • {m}")
except Exception as e:
    print(f"  ❌ Key lỗi: {e}")
    sys.exit(1)

# ============================================================
# TEST 2: Chat — GPT-4.1-nano (rẻ nhất)
# ============================================================
print("\n💬 TEST 2: Chat tiếng Việt (GPT-4.1-nano)")
try:
    t0 = time.time()
    chat = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": "Bạn là hướng dẫn viên ảo của Đại học Trà Vinh. Trả lời ngắn gọn, thân thiện bằng tiếng Việt."},
            {"role": "user", "content": "Trường Đại học Trà Vinh có mấy khoa?"}
        ],
        max_tokens=200
    )
    elapsed = time.time() - t0
    reply = chat.choices[0].message.content
    usage = chat.usage
    print(f"  ✅ Response ({elapsed:.2f}s):")
    print(f"     {reply[:200]}")
    print(f"  📊 Tokens: in={usage.prompt_tokens}, out={usage.completion_tokens}")
except Exception as e:
    print(f"  ❌ Chat lỗi: {e}")

# ============================================================
# TEST 3: Chat — GPT-4o-mini
# ============================================================
print("\n💬 TEST 3: Chat tiếng Việt (GPT-4o-mini)")
try:
    t0 = time.time()
    chat = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Bạn là hướng dẫn viên ảo của Đại học Trà Vinh. Trả lời ngắn gọn, thân thiện bằng tiếng Việt."},
            {"role": "user", "content": "Khoa Công nghệ Thông tin có những ngành nào?"}
        ],
        max_tokens=200
    )
    elapsed = time.time() - t0
    reply = chat.choices[0].message.content
    usage = chat.usage
    print(f"  ✅ Response ({elapsed:.2f}s):")
    print(f"     {reply[:200]}")
    print(f"  📊 Tokens: in={usage.prompt_tokens}, out={usage.completion_tokens}")
except Exception as e:
    print(f"  ❌ Chat lỗi: {e}")

# ============================================================
# TEST 4: Embedding
# ============================================================
print("\n🔢 TEST 4: Embedding (text-embedding-3-small)")
try:
    t0 = time.time()
    emb = client.embeddings.create(
        model="text-embedding-3-small",
        input="Đại học Trà Vinh có bao nhiêu khoa?",
        dimensions=768  # Match với schema vector(768)
    )
    elapsed = time.time() - t0
    vec = emb.data[0].embedding
    print(f"  ✅ Vector: {len(vec)} chiều ({elapsed:.2f}s)")
    print(f"     Preview: [{vec[0]:.6f}, {vec[1]:.6f}, ... {vec[-1]:.6f}]")
    print(f"  📊 Tokens: {emb.usage.total_tokens}")
except Exception as e:
    print(f"  ❌ Embedding lỗi: {e}")

# ============================================================
# TEST 5: TTS (gpt-4o-mini-tts)
# ============================================================
print("\n🔊 TEST 5: TTS tiếng Việt (gpt-4o-mini-tts)")
try:
    t0 = time.time()
    tts_response = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="coral",
        input="Chào bạn! Đây là giọng mẫu của trợ lý ảo Đại học Trà Vinh.",
        instructions="Nói bằng giọng tiếng Việt thân thiện, ấm áp như hướng dẫn viên du lịch.",
        response_format="wav"
    )
    elapsed = time.time() - t0
    
    out_path = os.path.join(os.path.dirname(__file__), "openai_tts_test.wav")
    with open(out_path, "wb") as f:
        for chunk in tts_response.iter_bytes():
            f.write(chunk)
    
    file_size = os.path.getsize(out_path)
    print(f"  ✅ Audio saved ({elapsed:.2f}s): {file_size / 1024:.0f}KB")
    print(f"     📁 {out_path}")
except Exception as e:
    print(f"  ❌ TTS lỗi: {e}")

# ============================================================
# SUMMARY
# ============================================================
print(f"\n{'=' * 60}")
print("📊 TỔNG KẾT:")
print("  Nếu thấy ❌ 'insufficient_quota' → Key chưa có credit")
print("  Nếu thấy ✅ → OpenAI hoạt động, có thể dùng được")
print(f"{'=' * 60}")
