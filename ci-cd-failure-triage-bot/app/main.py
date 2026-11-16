from fastapi import FastAPI
from pydantic import BaseModel

from app import llm, rag

app = FastAPI(title="Triage Bot")
docs = rag.load_docs()


class Question(BaseModel):
    question: str


class Log(BaseModel):
    log: str


@app.get("/health")
def health():
    return {"ok": True, "docs": len(docs)}


@app.post("/ask")
def ask(q: Question):
    hits = rag.search(q.question, docs)
    answer = llm.ask(rag.build_prompt(q.question, hits))
    return {"answer": answer, "sources": [h["src"] for h in hits]}


@app.post("/triage")
def triage(body: Log):
    from triage import explain
    return {"explanation": explain(body.log)}
