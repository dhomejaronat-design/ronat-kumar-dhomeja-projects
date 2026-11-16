from app import rag


def test_load_docs_finds_chunks():
    docs = rag.load_docs()
    assert len(docs) > 0
    assert all("text" in d and "src" in d for d in docs)


def test_search_ranks_by_keyword_overlap():
    docs = [
        {"src": "a.md", "text": "docker build and docker run"},
        {"src": "b.md", "text": "pytest runs in github actions"},
    ]
    hits = rag.search("how do I run docker", docs)
    assert hits[0]["src"] == "a.md"


def test_search_no_match_returns_empty():
    docs = [{"src": "a.md", "text": "docker"}]
    assert rag.search("kubernetes helm", docs) == []
