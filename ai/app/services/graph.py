import os
from typing import Any, Dict
from neo4j import GraphDatabase


class GraphClient:
    def __init__(self) -> None:
        uri = os.getenv("NEO4J_URI")
        user = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER")
        pwd = os.getenv("NEO4J_PASSWORD")
        if not uri or not user or not pwd:
            raise RuntimeError("Neo4j env vars not set")
        self._driver = GraphDatabase.driver(uri, auth=(user, pwd))

    def close(self):
        self._driver.close()

    def upsert_user_folder_file(
        self,
        *,
        user_email: str,
        folder_id: str | None,
        folder_name: str | None,
        file_id: str,
        file_name: str,
        s3_key: str,
        summary: str,
    ) -> None:
        # User owns folders and only root files (files without a folder).
        cypher = """
        MERGE (u:User {email: $userEmail})
          ON CREATE SET u.createdAt = timestamp(), u.name = $userEmail
          ON MATCH SET u.name = coalesce(u.name, $userEmail)

        // Branch A: Root file (no folder) -> (u)-[:OWNS]->(fi)
        FOREACH (_ IN CASE WHEN $folderName IS NULL THEN [1] ELSE [] END |
          MERGE (fi:File {name: $fileName, userEmail: u.email})
            ON CREATE SET fi.fileId = $fileId, fi.s3Key = $s3Key, fi.summary = $summary, fi.createdAt = timestamp()
            ON MATCH SET fi.fileId = coalesce(fi.fileId, $fileId), fi.s3Key = $s3Key, fi.summary = $summary, fi.updatedAt = timestamp()
          MERGE (u)-[:OWNS]->(fi)
        )

        // Branch B: File in a folder -> (u)-[:OWNS]->(f) and (f)-[:CONTAINS]->(fi)
        FOREACH (_ IN CASE WHEN $folderName IS NULL THEN [] ELSE [1] END |
          MERGE (f:Folder {name: $folderName, userEmail: u.email})
            ON CREATE SET f.folderId = $folderId, f.createdAt = timestamp()
            ON MATCH SET f.folderId = coalesce(f.folderId, $folderId)
          MERGE (u)-[:OWNS]->(f)
          MERGE (fi2:File {name: $fileName, userEmail: u.email})
            ON CREATE SET fi2.fileId = $fileId, fi2.s3Key = $s3Key, fi2.summary = $summary, fi2.createdAt = timestamp()
            ON MATCH SET fi2.fileId = coalesce(fi2.fileId, $fileId), fi2.s3Key = $s3Key, fi2.summary = $summary, fi2.updatedAt = timestamp()
          MERGE (f)-[:CONTAINS]->(fi2)
        )
        """
        params: Dict[str, Any] = {
            "userEmail": user_email,
            "folderId": folder_id,
            "folderName": folder_name,
            "fileId": file_id,
            "fileName": file_name,
            "s3Key": s3_key,
            "summary": summary,
        }
        with self._driver.session() as session:
            session.run(cypher, params)

    def upsert_file_chunks(self, file_id: str, chunks: list[dict], batch_size: int = 200) -> int:
        """Create/update Chunk nodes with embeddings and link them to the File.
        Batches writes to avoid message size limits.
        Each chunk dict: { id, index, text, charStart, charEnd, embedding }.
        """
        if not chunks:
            return 0

        # Best-effort vector index setup (only if we have a valid dimension)
        dim = len(chunks[0].get("embedding", [])) if chunks else 0
        if dim > 0:
            try:
                with self._driver.session() as session:
                    session.run(
                        """
                        CREATE VECTOR INDEX chunk_embedding_index IF NOT EXISTS
                        FOR (c:Chunk) ON (c.embedding)
                        OPTIONS { indexConfig: { `vector.dimensions`: $dim, `vector.similarity_function`: 'cosine' } }
                        """,
                        {"dim": dim},
                    )
            except Exception:
                pass

        cypher = """
        MATCH (fi:File {fileId: $fileId})
        WITH fi
        UNWIND $chunks AS ch
        MERGE (c:Chunk {chunkId: ch.id})
          ON CREATE SET c.index = ch.index, c.text = ch.text, c.charStart = ch.charStart, c.charEnd = ch.charEnd, c.embedding = ch.embedding, c.createdAt = timestamp()
          ON MATCH SET c.text = ch.text, c.charStart = ch.charStart, c.charEnd = ch.charEnd, c.embedding = ch.embedding, c.updatedAt = timestamp()
        MERGE (fi)-[:HAS_CHUNK]->(c)
        """
        total = 0
        with self._driver.session() as session:
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i : i + batch_size]
                session.run(cypher, {"fileId": file_id, "chunks": batch})
                total += len(batch)
        return total

    def delete_file_by_id(self, file_id: str):
        cypher = """
        MATCH (fi:File {fileId: $fileId})
        OPTIONAL MATCH (fi)-[:HAS_CHUNK]->(c:Chunk)
        DETACH DELETE fi, c
        """
        with self._driver.session() as session:
            session.run(cypher, {"fileId": file_id})

    def delete_folder_by_id(self, folder_id: str):
        cypher = """
        MATCH (f:Folder {folderId: $folderId})
        OPTIONAL MATCH (f)-[:CONTAINS]->(fi:File)
        OPTIONAL MATCH (fi)-[:HAS_CHUNK]->(c:Chunk)
        DETACH DELETE f, fi, c
        """
        with self._driver.session() as session:
            session.run(cypher, {"folderId": folder_id})

    def get_user_knowledge_json(self, user_email: str):
        # Build simple shape:
        # {
        #   userEmail,
        #   files: { fileName: summary },
        #   folders: { folderName: { fileName: summary } }
        # }
        files_map = {}
        folders_map = {}
        with self._driver.session() as session:
            # Root files (owned by user, not in any folder)
            res1 = session.run(
                """
                MATCH (u:User {email: $userEmail})-[:OWNS]->(fi:File)
                WHERE NOT ( (:Folder)-[:CONTAINS]->(fi) )
                RETURN fi.name AS fileName, fi.summary AS summary
                ORDER BY fi.name
                """,
                {"userEmail": user_email},
            )
            for r in res1:
                files_map[r["fileName"]] = r["summary"]

            # Files within folders
            res2 = session.run(
                """
                MATCH (u:User {email: $userEmail})-[:OWNS]->(f:Folder)-[:CONTAINS]->(fi:File)
                RETURN f.name AS folderName, fi.name AS fileName, fi.summary AS summary
                ORDER BY folderName, fileName
                """,
                {"userEmail": user_email},
            )
            for r in res2:
                fname = r["folderName"]
                m = folders_map.setdefault(fname, {})
                m[r["fileName"]] = r["summary"]

        return {"userEmail": user_email, "files": files_map, "folders": folders_map}
