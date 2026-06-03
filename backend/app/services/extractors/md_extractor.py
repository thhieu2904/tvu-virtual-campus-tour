class MarkdownExtractor:
    def extract_pages_from_bytes(self, file_bytes: bytes) -> list[dict[str, any]]:
        text = file_bytes.decode('utf-8')
        return [{'page_number': 1, 'text': text, 'char_count': len(text)}]
