import re
from pathlib import Path

DOCS = Path(__file__).parent.parent / "docs"


def words(text):
    return set(re.findall(r"[a-z0-9_]+", text.lower()))


def load_docs(folder=DOCS):
    docs = []
    for f in sorted(Path(folder).glob("*.md")):
        for chunk in f.read_text().split("\n\n"):
            if chunk.strip():
                docs.append({"src": f.name, "text": chunk.strip()})
    return docs


def search(question, docs, k=3):
    q = words(question)
    scored = []
    for d in docs:
        score = len(q & words(d["text"]))
        if score:
            scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:k]]


def build_prompt(question, hits):
    context = "\n\n".join(f"[{h['src']}]\n{h['text']}" for h in hits)
    return (
        "Answer using only the context below. If the answer isn't there, say so.\n\n"
        f"Context:\n{context}\n\nQuestion: {question}"
    )
