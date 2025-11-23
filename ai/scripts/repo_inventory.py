import os
import cohere
import dotenv

dotenv.load_dotenv()

def test_cohere_embed():
    api_key = os.getenv("embeedings_api") or os.getenv("COHERE_API_KEY")
    if not api_key:
        raise RuntimeError("Cohere API key not set in environment (embeedings_api or COHERE_API_KEY)")
    co = cohere.Client(api_key)
    texts = [
        "The quick brown fox jumps over the lazy dog.",
        "Graph-based retrieval augmented generation is powerful.",
        "Cohere provides easy-to-use embedding APIs."
    ]
    response = co.embed(
        texts=texts,
        input_type="search_document",
        model="embed-english-v3.0",
        embedding_types=["float"]
    )
    float_embeddings = response.embeddings.float_
    print("Embeddings shape:", len(float_embeddings), "x", len(float_embeddings[0]))
    for i, emb in enumerate(float_embeddings):
        print(f"Text {i+1} embedding (first 5 values):", emb[:5])

if __name__ == "__main__":
    test_cohere_embed()