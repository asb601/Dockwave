import os
from typing import Dict, Any, List
import numpy as np

# Minimal vector store abstraction.
# In production, replace with Pinecone, Weaviate, Qdrant etc.

class InMemoryVectorStore:
    def __init__(self):
        self.namespaces: Dict[str, List[Dict[str, Any]]] = {}

    def upsert(self, namespace: str, items: List[Dict[str, Any]]) -> int:
        bucket = self.namespaces.setdefault(namespace, [])
        # overwrite by id
        existing = {it["id"]: it for it in bucket}
        for it in items:
            existing[it["id"]] = it
        self.namespaces[namespace] = list(existing.values())
        return len(items)

    def delete_by_ids(self, namespace: str, ids: List[str]) -> int:
        bucket = self.namespaces.get(namespace, [])
        if not bucket or not ids:
            return 0
        ids_set = set(ids)
        before = len(bucket)
        self.namespaces[namespace] = [it for it in bucket if it["id"] not in ids_set]
        return before - len(self.namespaces[namespace])

    def delete_where(self, namespace: str, predicate) -> int:
        bucket = self.namespaces.get(namespace, [])
        if not bucket:
            return 0
        before = len(bucket)
        self.namespaces[namespace] = [it for it in bucket if not predicate(it)]
        return before - len(self.namespaces[namespace])

    def search(self, namespace: str, query: List[float], top_k: int = 5):
        bucket = self.namespaces.get(namespace, [])
        if not bucket:
            return []
        q = np.array(query, dtype=np.float32)
        scored = []
        for it in bucket:
            v = np.array(it["values"], dtype=np.float32)
            # cosine similarity
            s = float(np.dot(q, v) / (np.linalg.norm(q) * np.linalg.norm(v) + 1e-8))
            scored.append((s, it))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [it for _, it in scored[:top_k]]

    def count_namespace(self, namespace: str) -> int:
        return len(self.namespaces.get(namespace, []))

    def count_file_chunks(self, namespace: str) -> Dict[str, int]:
        bucket = self.namespaces.get(namespace, [])
        counts: Dict[str, int] = {}
        for it in bucket:
            fid = it.get("metadata", {}).get("fileId")
            if fid:
                counts[fid] = counts.get(fid, 0) + 1
        return counts


_store = InMemoryVectorStore()


class VectorClient:
    def __init__(self):
        # Placeholder for real client (Pinecone, Qdrant, etc.)
        self._store = _store

    def upsert(self, namespace: str, items: List[Dict[str, Any]]) -> int:
        return self._store.upsert(namespace, items)

    def search(self, namespace: str, query: List[float], top_k: int = 5):
        return self._store.search(namespace, query, top_k=top_k)

    def delete_file_chunks(self, namespace: str, file_id: str) -> int:
        # Chunks are stored with id pattern: {file_id}:{index}
        return self._store.delete_where(namespace, lambda it: it.get("metadata", {}).get("fileId") == file_id)

    def delete_namespace(self, namespace: str) -> int:
        bucket = self._store.namespaces.get(namespace, [])
        removed = len(bucket)
        self._store.namespaces[namespace] = []
        return removed

    def count_chunks(self, namespace: str) -> int:
        return self._store.count_namespace(namespace)

    def count_file_chunks(self, namespace: str) -> Dict[str, int]:
        return self._store.count_file_chunks(namespace)
